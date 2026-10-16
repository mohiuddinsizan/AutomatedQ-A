"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal, getCurrentUser, type CurrentUser } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { canSeeThread, subjectsForCourse } from "@/lib/qa";
import { extractQuestion, screenAndAnswer, answerQuestion, AiUnavailableError, type Part } from "@/lib/ai";
import { saveUpload, readUpload, deleteUpload, LIMITS, baseMime } from "@/lib/uploads";

const s = schema;

export type QaFormState = { error?: string; ok?: string } | undefined;

const BUSY = "The answer service is busy right now. Please try again in a minute — your question has not been charged.";
const lastAsk = new Map<number, number>(); // a small cooldown against double taps and spam

/* ---------- Helpers ---------- */

async function activeCourse(studentId: number, courseId: number) {
  if (!Number.isInteger(courseId)) return null;
  const [row] = await db.select({ id: s.courses.id, name: s.courses.name, qa: s.quotas.qaRemaining })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .leftJoin(s.quotas, and(eq(s.quotas.studentId, s.enrollments.studentId), eq(s.quotas.courseId, s.enrollments.courseId)))
    .where(and(
      eq(s.enrollments.studentId, studentId), eq(s.enrollments.courseId, courseId),
      eq(s.enrollments.status, "active"), eq(s.courses.status, "active"),
    )).limit(1);
  return row ?? null;
}

/** Takes one question from the allowance. False when none are left. */
async function charge(studentId: number, courseId: number) {
  const done = await db.update(s.quotas)
    .set({ qaRemaining: sql`${s.quotas.qaRemaining} - 1`, updatedAt: new Date() })
    .where(and(eq(s.quotas.studentId, studentId), eq(s.quotas.courseId, courseId), gt(s.quotas.qaRemaining, 0)))
    .returning({ left: s.quotas.qaRemaining });
  return done.length > 0;
}

async function refund(studentId: number, courseId: number) {
  await db.update(s.quotas).set({ qaRemaining: sql`${s.quotas.qaRemaining} + 1`, updatedAt: new Date() })
    .where(and(eq(s.quotas.studentId, studentId), eq(s.quotas.courseId, courseId)));
}

async function generalSubjectId() {
  await db.insert(s.subjects).values({ name: "General" }).onConflictDoNothing();
  const [row] = await db.select({ id: s.subjects.id }).from(s.subjects).where(eq(s.subjects.name, "General"));
  return row.id;
}

type Upload = { kind: "image" | "audio"; mime: string; data: Buffer; durationSec?: number };

/** Reads and checks the photos (and, for students, the voice note) in a form. */
async function readUploads(fd: FormData, allowAudio: boolean): Promise<Upload[] | string> {
  const out: Upload[] = [];
  const images = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (images.length > LIMITS.image.max) return `You can attach up to ${LIMITS.image.max} photos.`;
  for (const f of images) {
    const mime = baseMime(f.type);
    if (!LIMITS.image.types.includes(mime)) return "Photos must be JPG, PNG or WebP.";
    if (f.size > LIMITS.image.bytes) return "One of the photos is too large. Please take it again.";
    out.push({ kind: "image", mime, data: Buffer.from(await f.arrayBuffer()) });
  }
  const audio = fd.get("audio");
  if (allowAudio && audio instanceof File && audio.size > 0) {
    const mime = baseMime(audio.type);
    if (!LIMITS.audio.types.includes(mime)) return "This voice note format isn't supported. Please type your question instead.";
    if (audio.size > LIMITS.audio.bytes) return "The voice note is too long. Keep it under 2 minutes.";
    const dur = Math.round(Number(fd.get("audioDuration")) || 0);
    out.push({ kind: "audio", mime, data: Buffer.from(await audio.arrayBuffer()), durationSec: dur > 0 ? Math.min(dur, 600) : undefined });
  }
  return out;
}

const toPart = (u: { mime: string; data: Buffer }): Part => ({ inlineData: { mimeType: u.mime, data: u.data.toString("base64") } });

async function storeFiles(messageId: number, files: Upload[], transcript?: string) {
  for (const f of files) {
    const key = await saveUpload(f.data, f.mime);
    await db.insert(s.attachments).values({
      messageId, kind: f.kind, storageKey: key, mime: f.mime, sizeBytes: f.data.length,
      durationSec: f.durationSec ?? null,
      transcript: f.kind === "audio" ? transcript || null : null,
    });
  }
}

async function notify(userId: number, type: string, title: string, href: string) {
  await db.insert(s.notifications).values({ userId, type, payload: { title, href } });
}

/* ---------- Student: ask ---------- */

export async function askQuestion(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requirePortal("student");
  const course = await activeCourse(me.id, Number(fd.get("courseId")));
  if (!course) return { error: "Choose one of your active courses." };

  const text = String(fd.get("text") ?? "").trim().slice(0, 2000);
  const files = await readUploads(fd, true);
  if (typeof files === "string") return { error: files };
  if (!text && files.length === 0) return { error: "Type your question, add a photo, or record a voice note." };
  if (files.length === 0 && text.length < 8) return { error: "Please write the whole question so it can be answered properly." };

  const consumeOn = await getSetting("qa.consume_on");
  if (consumeOn === "submit" && (course.qa ?? 0) <= 0) {
    return { error: "You have no questions left in this course. Contact the admin office to get more." };
  }

  // The allowance (20 per course, changed only by an admin) is the only limit.
  // This cooldown just stops double taps and rapid-fire spam.
  const since = lastAsk.get(me.id) ?? 0;
  if (Date.now() - since < 15_000) return { error: "Please wait a few seconds before asking again." };
  lastAsk.set(me.id, Date.now());

  const subjects = await subjectsForCourse(course.id);
  const chosen = subjects.find((x) => x.id === Number(fd.get("subjectId"))) ?? null;
  const names = subjects.map((x) => x.name);
  const pickSubject = async (aiName: string) =>
    chosen?.id ?? subjects.find((x) => x.name === aiName)?.id ?? (await generalSubjectId());

  let threadId: number;

  if (files.length === 0) {
    // Typed questions: screened and answered in a single AI call.
    let r: Awaited<ReturnType<typeof screenAndAnswer>>;
    try {
      r = await screenAndAnswer({ course: course.name, subjects: names, chosenSubject: chosen?.name ?? null, text });
    } catch (err) {
      if (err instanceof AiUnavailableError) return { error: BUSY };
      throw err;
    }
    if (r.verdict !== "ok") {
      // Not answered, but not thrown away either: the student can fix it or send it to a teacher.
      const [t] = await db.insert(s.qaThreads).values({
        studentId: me.id, courseId: course.id, subjectId: await pickSubject(r.subject),
        question: r.question || text, status: "draft", aiVerdict: r.verdict, aiNote: r.reason || null,
      }).returning({ id: s.qaThreads.id });
      await db.insert(s.qaMessages).values({ threadId: t.id, senderType: "student", senderId: me.id, body: text, aiMeta: { screen: r.meta } });
      revalidatePath("/student", "layout");
      redirect(`/student/questions/${t.id}`);
    }
    const charged = consumeOn === "submit" ? await charge(me.id, course.id) : false;
    if (consumeOn === "submit" && !charged) return { error: "You have no questions left in this course." };

    threadId = await db.transaction(async (tx) => {
      const [t] = await tx.insert(s.qaThreads).values({
        studentId: me.id, courseId: course.id, subjectId: await pickSubject(r.subject),
        question: r.question || text, status: "ai_answered", quotaCharged: charged,
      }).returning({ id: s.qaThreads.id });
      await tx.insert(s.qaMessages).values({ threadId: t.id, senderType: "student", senderId: me.id, body: text });
      await tx.insert(s.qaMessages).values({ threadId: t.id, senderType: "ai", body: r.answer.trim(), aiMeta: r.meta });
      return t.id;
    });
  } else {
    // Voice notes and photos: first write out the question, and let the student check it.
    let x: Awaited<ReturnType<typeof extractQuestion>>;
    try {
      x = await extractQuestion({
        course: course.name, subjects: names, chosenSubject: chosen?.name ?? null, text, media: files.map(toPart),
      });
    } catch (err) {
      if (err instanceof AiUnavailableError) return { error: BUSY };
      throw err;
    }
    // Kept even when the AI can't make it out: a teacher can still look at the photo or listen.
    const unclear = x.verdict !== "ok" || !x.question.trim();
    const [t] = await db.insert(s.qaThreads).values({
      studentId: me.id, courseId: course.id, subjectId: await pickSubject(x.subject),
      question: x.question.trim() || x.transcript.trim() || text || null, status: "draft",
      aiVerdict: unclear ? (x.verdict === "off_topic" ? "off_topic" : "unclear") : null,
      aiNote: unclear ? x.reason || null : null,
    }).returning({ id: s.qaThreads.id });
    const [m] = await db.insert(s.qaMessages).values({
      threadId: t.id, senderType: "student", senderId: me.id, body: text || null, aiMeta: { extract: x.meta },
    }).returning({ id: s.qaMessages.id });
    await storeFiles(m.id, files, x.transcript);
    threadId = t.id;
  }

  revalidatePath("/student", "layout");
  redirect(`/student/questions/${threadId}`);
}

/** Produces the one AI answer for a confirmed question. */
async function runAnswer(threadId: number): Promise<QaFormState> {
  const [t] = await db.select({
    id: s.qaThreads.id, question: s.qaThreads.question, studentId: s.qaThreads.studentId,
    courseId: s.qaThreads.courseId, quotaCharged: s.qaThreads.quotaCharged,
    course: s.courses.name, subject: s.subjects.name,
  }).from(s.qaThreads)
    .innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.qaThreads.subjectId))
    .where(eq(s.qaThreads.id, threadId)).limit(1);

  const images = await db.select({ key: s.attachments.storageKey, mime: s.attachments.mime })
    .from(s.attachments).innerJoin(s.qaMessages, eq(s.qaMessages.id, s.attachments.messageId))
    .where(and(eq(s.qaMessages.threadId, threadId), eq(s.qaMessages.senderType, "student"), eq(s.attachments.kind, "image")));

  let r: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    const parts = await Promise.all(images.map(async (i) => toPart({ mime: i.mime, data: await readUpload(i.key) })));
    r = await answerQuestion({ course: t.course, subject: t.subject === "General" ? null : t.subject, question: t.question ?? "", images: parts });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { error: "The answer service is busy. Tap “Try again” in a minute; you won't be charged twice." };
    }
    throw err;
  }

  if (r.verdict !== "ok") {
    // The AI can't answer it. Give the allowance back; the student chooses what next
    // (fix it, or send it to a teacher who can see the photos).
    if (t.quotaCharged) await refund(t.studentId, t.courseId);
    await db.update(s.qaThreads).set({ status: "draft", quotaCharged: false, aiVerdict: r.verdict, aiNote: r.reason || null })
      .where(eq(s.qaThreads.id, threadId));
    return undefined;
  }

  await db.transaction(async (tx) => {
    await tx.insert(s.qaMessages).values({ threadId, senderType: "ai", body: r.answer.trim(), aiMeta: r.meta });
    await tx.update(s.qaThreads).set({ status: "ai_answered" }).where(eq(s.qaThreads.id, threadId));
  });
  return undefined;
}

async function ownThread(me: CurrentUser, threadId: number) {
  if (!Number.isInteger(threadId)) return null;
  const [t] = await db.select().from(s.qaThreads)
    .where(and(eq(s.qaThreads.id, threadId), eq(s.qaThreads.studentId, me.id))).limit(1);
  return t ?? null;
}

export async function confirmQuestion(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requirePortal("student");
  const t = await ownThread(me, Number(fd.get("threadId")));
  if (!t || t.status !== "draft") return { error: "This question can no longer be changed." };

  const question = String(fd.get("question") ?? "").trim();
  if (question.length < 8) return { error: "Please write the whole question." };
  if (question.length > 2000) return { error: "Please shorten the question." };

  const consumeOn = await getSetting("qa.consume_on");
  let charged = t.quotaCharged;
  if (consumeOn === "submit" && !charged) {
    if (!(await charge(me.id, t.courseId))) return { error: "You have no questions left in this course." };
    charged = true;
  }

  // Claim the draft so a double tap can't answer it twice.
  const moved = await db.update(s.qaThreads).set({ question, status: "awaiting_ai", quotaCharged: charged, aiVerdict: null, aiNote: null })
    .where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, "draft"))).returning({ id: s.qaThreads.id });
  if (!moved.length) {
    if (charged && !t.quotaCharged) await refund(me.id, t.courseId);
    return { error: "This question is already being answered." };
  }

  const result = await runAnswer(t.id);
  revalidatePath(`/student/questions/${t.id}`);
  return result;
}

export async function retryAnswer(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requirePortal("student");
  const t = await ownThread(me, Number(fd.get("threadId")));
  if (!t || t.status !== "awaiting_ai") return { error: "This question isn't waiting for an answer." };
  // Only one retry at a time: a recent update means another attempt is still running.
  if (Date.now() - t.updatedAt.getTime() < 10_000) return { error: "Still working on it. Give it a few more seconds." };
  await db.update(s.qaThreads).set({ updatedAt: new Date() }).where(eq(s.qaThreads.id, t.id));
  const result = await runAnswer(t.id);
  revalidatePath(`/student/questions/${t.id}`);
  return result;
}

/**
 * When the AI tutor can't answer (couldn't read it, thinks it's off topic, or is busy),
 * the student can send the question as it is to a teacher, who sees the photos and voice note.
 */
export async function forwardToTeacher(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requirePortal("student");
  const t = await ownThread(me, Number(fd.get("threadId")));
  if (!t || !["draft", "awaiting_ai"].includes(t.status)) return { error: "This question has moved on. Refresh the page." };
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);

  // A teacher's time is the allowance, whichever way the setting is.
  let charged = t.quotaCharged;
  if (!charged) {
    if (!(await charge(me.id, t.courseId))) return { error: "You have no questions left in this course." };
    charged = true;
  }

  const moved = await db.transaction(async (tx) => {
    const done = await tx.update(s.qaThreads).set({
      status: "escalated", escalatedAt: new Date(), quotaCharged: charged,
      aiNote: t.aiNote ?? (t.status === "awaiting_ai" ? "The AI service was busy." : null),
      aiVerdict: t.aiVerdict ?? (t.status === "awaiting_ai" ? "unclear" : null),
    }).where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, t.status))).returning({ id: s.qaThreads.id });
    if (!done.length) return false;
    if (note) await tx.insert(s.qaMessages).values({ threadId: t.id, senderType: "student", senderId: me.id, body: note });
    return true;
  });
  if (!moved) {
    if (charged && !t.quotaCharged) await refund(me.id, t.courseId);
    return { error: "This question has moved on. Refresh the page." };
  }
  revalidatePath(`/student/questions/${t.id}`);
  return { ok: "Sent to a teacher. They can see your photo and hear your voice note. The reply will appear here." };
}

export async function discardDraft(fd: FormData) {
  const me = await requirePortal("student");
  const t = await ownThread(me, Number(fd.get("threadId")));
  if (!t || t.status !== "draft") redirect("/student/questions");

  const files = await db.select({ key: s.attachments.storageKey }).from(s.attachments)
    .innerJoin(s.qaMessages, eq(s.qaMessages.id, s.attachments.messageId))
    .where(eq(s.qaMessages.threadId, t.id));
  if (t.quotaCharged) await refund(me.id, t.courseId);
  await db.delete(s.qaThreads).where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, "draft")));
  await Promise.all(files.map((f) => deleteUpload(f.key)));
  redirect("/student/questions");
}

/* ---------- Student: rate, then settle / forward / follow up ---------- */

export async function rateReply(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requirePortal("student");
  const t = await ownThread(me, Number(fd.get("threadId")));
  if (!t) return { error: "Question not found." };

  const decision = String(fd.get("decision"));
  const allowed = t.status === "ai_answered" ? ["resolved", "escalate"]
    : t.status === "answered" ? ["resolved", "followup"] : [];
  if (!allowed.includes(decision)) return { error: "This question has moved on. Refresh the page." };

  // The reply being rated is always the latest one from the AI or a teacher.
  const [reply] = await db.select().from(s.qaMessages)
    .where(and(eq(s.qaMessages.threadId, t.id), inArray(s.qaMessages.senderType, ["ai", "teacher", "admin"])))
    .orderBy(sql`${s.qaMessages.createdAt} desc, ${s.qaMessages.id} desc`).limit(1);
  if (!reply) return { error: "There is no reply to rate yet." };

  const rating = Number(fd.get("rating"));
  if (!reply.rating && !(rating >= 1 && rating <= 5)) return { error: "Tap the stars to rate the answer first." };
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);

  if (decision === "followup" && note.length < 5) return { error: "Write what is still unclear so the teacher can help." };
  if (decision === "followup") {
    const max = await getSetting("qa.max_followups");
    const [{ n }] = await db.select({ n: count() }).from(s.qaMessages)
      .where(and(eq(s.qaMessages.threadId, t.id), eq(s.qaMessages.senderType, "student"),
        sql`${s.qaMessages.createdAt} > coalesce(${t.escalatedAt}, ${t.createdAt})`));
    if (n >= max) return { error: `You've reached the limit of ${max} follow-ups for one question. Ask a new question instead.` };
  }

  let charged = t.quotaCharged;
  if (decision === "escalate" && !charged && (await getSetting("qa.consume_on")) === "escalate") {
    if (!(await charge(me.id, t.courseId))) return { error: "You have no questions left, so this can't go to a teacher." };
    charged = true;
  }

  const next = decision === "resolved" ? "resolved"
    : decision === "escalate" ? "escalated"
    : t.teacherId ? "teacher_claimed" : "escalated";

  const moved = await db.transaction(async (tx) => {
    const done = await tx.update(s.qaThreads).set({
      status: next,
      quotaCharged: charged,
      ...(next === "resolved" ? { resolvedAt: new Date() } : {}),
      ...(decision === "escalate" ? { escalatedAt: new Date() } : {}),
    }).where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, t.status))).returning({ id: s.qaThreads.id });
    if (!done.length) return false;

    if (!reply.rating) {
      await tx.update(s.qaMessages).set({
        rating, ratingNote: decision === "resolved" ? note || null : null, ratedAt: new Date(),
      }).where(eq(s.qaMessages.id, reply.id));
    }
    if (decision !== "resolved" && note) {
      await tx.insert(s.qaMessages).values({ threadId: t.id, senderType: "student", senderId: me.id, body: note });
    }
    return true;
  });
  if (!moved) {
    if (charged && !t.quotaCharged) await refund(me.id, t.courseId);
    return { error: "This question has moved on. Refresh the page." };
  }

  revalidatePath(`/student/questions/${t.id}`);
  return {
    ok: decision === "resolved" ? "Glad it helped. Marked as solved."
      : decision === "escalate" ? "Sent to a teacher. You'll see the reply here."
      : "Sent to your teacher.",
  };
}

/* ---------- Teachers and admins ---------- */

async function staffThread(me: CurrentUser, threadId: number) {
  if (!Number.isInteger(threadId)) return null;
  const [t] = await db.select().from(s.qaThreads).where(eq(s.qaThreads.id, threadId)).limit(1);
  if (!t || !(await canSeeThread(me, t))) return null;
  return t;
}

const staffPath = (me: CurrentUser, id: number) =>
  me.role === "teacher" ? `/teacher/questions/${id}` : `/admin/questions/${id}`;

async function requireStaff() {
  const me = await getCurrentUser();
  if (!me || !["teacher", "admin", "super_admin"].includes(me.role) || me.mustChangePassword) {
    redirect("/teacher/login");
  }
  return me;
}

export async function claimThread(fd: FormData) {
  const me = await requirePortal("teacher");
  const t = await staffThread(me, Number(fd.get("threadId")));
  if (!t) redirect("/teacher");
  await db.update(s.qaThreads).set({ status: "teacher_claimed", teacherId: me.id })
    .where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, "escalated")));
  revalidatePath(`/teacher/questions/${t.id}`);
}

export async function releaseThread(fd: FormData) {
  const me = await requireStaff();
  const t = await staffThread(me, Number(fd.get("threadId")));
  if (!t) redirect(me.role === "teacher" ? "/teacher" : "/admin/questions");
  const mine = me.role !== "teacher" || t.teacherId === me.id;
  if (mine && t.status === "teacher_claimed") {
    await db.update(s.qaThreads).set({ status: "escalated", teacherId: null })
      .where(and(eq(s.qaThreads.id, t.id), eq(s.qaThreads.status, "teacher_claimed")));
  }
  revalidatePath(staffPath(me, t.id));
  if (me.role === "teacher") redirect(`/teacher/courses/${t.courseId}`);
}

export async function replyThread(_: QaFormState, fd: FormData): Promise<QaFormState> {
  const me = await requireStaff();
  const t = await staffThread(me, Number(fd.get("threadId")));
  if (!t) return { error: "Question not found." };

  const isTeacher = me.role === "teacher";
  if (isTeacher && !(t.status === "teacher_claimed" && t.teacherId === me.id)) {
    return { error: "Take this question first, then reply." };
  }
  if (!isTeacher && !["escalated", "teacher_claimed", "answered"].includes(t.status)) {
    return { error: "This question isn't waiting for a reply." };
  }

  const body = String(fd.get("body") ?? "").trim();
  if (body.length > 5000) return { error: "Please keep the reply under 5,000 characters." };
  // Teachers can answer by voice too: a voice note alone is a complete reply.
  const files = await readUploads(fd, true);
  if (typeof files === "string") return { error: files };
  if (body.length < 2 && !files.some((f) => f.kind === "audio")) return { error: "Write your reply or record a voice note." };

  await db.transaction(async (tx) => {
    const [m] = await tx.insert(s.qaMessages).values({
      threadId: t.id, senderType: isTeacher ? "teacher" : "admin", senderId: me.id, body: body || null,
    }).returning({ id: s.qaMessages.id });
    await tx.update(s.qaThreads).set({ status: "answered", teacherId: t.teacherId ?? (isTeacher ? me.id : null) })
      .where(eq(s.qaThreads.id, t.id));
    return m.id;
  }).then((messageId) => storeFiles(messageId, files));

  await notify(t.studentId, "qa.reply", "A teacher replied to your question", `/student/questions/${t.id}`);
  revalidatePath(staffPath(me, t.id));
  return { ok: "Reply sent." };
}

export async function setThreadHidden(fd: FormData) {
  const me = await requirePortal("admin");
  const id = Number(fd.get("threadId"));
  const hidden = fd.get("hidden") === "1";
  await db.update(s.qaThreads).set({ hidden }).where(eq(s.qaThreads.id, id));
  await db.insert(s.auditLogs).values({ actorId: me.id, action: hidden ? "qa.hide" : "qa.unhide", entity: "qa_thread", entityId: String(id) });
  revalidatePath(`/admin/questions/${id}`);
}
