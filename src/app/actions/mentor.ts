"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { subjectsForCourse } from "@/lib/qa";
import { saveUpload, baseMime, LIMITS } from "@/lib/uploads";
import { MENTOR_MAX_PHOTOS, MENTOR_SLOT_MINUTES } from "@/lib/constants";

const s = schema;

export type MentorFormState = { error?: string; ok?: string } | undefined;

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
const MAX_OPEN = 2;

const requestSchema = z.object({
  courseId: z.coerce.number().int(),
  subjectId: z.coerce.number().int(),
  topic: z.string().trim().min(3, "Write the topic in a few words").max(200, "Keep the topic short"),
  problem: z.string().trim().min(15, "Describe where you're stuck in a sentence or two").max(2000, "Please shorten the description"),
  preferredTime: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => BD_PHONE.test(v), "Enter a valid Bangladeshi mobile number, like 01712345678"),
});

export async function requestSession(_: MentorFormState, fd: FormData): Promise<MentorFormState> {
  const me = await requirePortal("student");
  const parsed = requestSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  // Photos of the problem, checked before anything is charged.
  const photos = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MENTOR_MAX_PHOTOS) return { error: `You can attach up to ${MENTOR_MAX_PHOTOS} photos.` };
  for (const f of photos) {
    if (!LIMITS.image.types.includes(baseMime(f.type))) return { error: "Photos must be JPG, PNG or WebP." };
    if (f.size > LIMITS.image.bytes) return { error: "One of the photos is too large. Please take it again." };
  }

  const [course] = await db.select({ id: s.courses.id, left: s.quotas.sessionRemaining })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .leftJoin(s.quotas, and(eq(s.quotas.studentId, s.enrollments.studentId), eq(s.quotas.courseId, s.enrollments.courseId)))
    .where(and(eq(s.enrollments.studentId, me.id), eq(s.enrollments.courseId, v.courseId),
      eq(s.enrollments.status, "active"), eq(s.courses.status, "active")))
    .limit(1);
  if (!course) return { error: "Choose one of your active courses." };
  if ((course.left ?? 0) <= 0) return { error: "You have no mentor sessions left in this course. Contact the admin office to get more." };

  const subjects = await subjectsForCourse(course.id);
  if (!subjects.some((x) => x.id === v.subjectId)) return { error: "Choose a subject." };

  const [{ open }] = await db.select({ open: count() }).from(s.mentorSessions)
    .where(and(eq(s.mentorSessions.studentId, me.id), inArray(s.mentorSessions.status, ["pending", "scheduled"])));
  if (open >= MAX_OPEN) return { error: `You already have ${open} sessions open. Wait for one to finish before requesting another.` };

  const id = await db.transaction(async (tx) => {
    const took = await tx.update(s.quotas)
      .set({ sessionRemaining: sql`${s.quotas.sessionRemaining} - 1`, updatedAt: new Date() })
      .where(and(eq(s.quotas.studentId, me.id), eq(s.quotas.courseId, course.id), gt(s.quotas.sessionRemaining, 0)))
      .returning({ left: s.quotas.sessionRemaining });
    if (!took.length) return null;
    const [row] = await tx.insert(s.mentorSessions).values({
      studentId: me.id, courseId: course.id, subjectId: v.subjectId,
      topic: v.topic, problem: v.problem, preferredTime: v.preferredTime || null,
      contactPhone: v.contactPhone, quotaCharged: true,
    }).returning({ id: s.mentorSessions.id });
    return row.id;
  });
  if (!id) return { error: "You have no mentor sessions left in this course." };

  for (const f of photos) {
    const data = Buffer.from(await f.arrayBuffer());
    const mime = baseMime(f.type);
    await db.insert(s.mentorAttachments).values({ sessionId: id, storageKey: await saveUpload(data, mime), mime, sizeBytes: data.length });
  }

  revalidatePath("/student", "layout");
  redirect(`/student/mentor?requested=${id}`);
}

async function refundSession(row: { studentId: number; courseId: number; quotaCharged: boolean; id: number }) {
  if (!row.quotaCharged) return;
  await db.transaction(async (tx) => {
    const done = await tx.update(s.mentorSessions).set({ quotaCharged: false })
      .where(and(eq(s.mentorSessions.id, row.id), eq(s.mentorSessions.quotaCharged, true))).returning({ id: s.mentorSessions.id });
    if (!done.length) return;
    await tx.update(s.quotas).set({ sessionRemaining: sql`${s.quotas.sessionRemaining} + 1`, updatedAt: new Date() })
      .where(and(eq(s.quotas.studentId, row.studentId), eq(s.quotas.courseId, row.courseId)));
  });
}

export async function cancelOwnSession(fd: FormData) {
  const me = await requirePortal("student");
  const id = Number(fd.get("id"));
  const [row] = await db.select().from(s.mentorSessions)
    .where(and(eq(s.mentorSessions.id, id), eq(s.mentorSessions.studentId, me.id))).limit(1);
  if (row && row.status === "pending") {
    await db.update(s.mentorSessions).set({ status: "cancelled", adminMessage: "Cancelled by you." })
      .where(and(eq(s.mentorSessions.id, id), eq(s.mentorSessions.status, "pending")));
    await refundSession(row);
  }
  revalidatePath("/student/mentor");
}

/* ---------- Admin ---------- */

const scheduleSchema = z.object({
  id: z.coerce.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time slot or enter a time"),
  mentorTeacherId: z.string().optional(),
  mentorName: z.string().trim().max(160).optional(),
  mentorPhone: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).optional(),
  adminMessage: z.string().trim().max(1000).optional(),
});

export async function scheduleSession(_: MentorFormState, fd: FormData): Promise<MentorFormState> {
  const me = await requirePortal("admin");
  const parsed = scheduleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  // The form's date and time are Bangladesh time.
  const when = new Date(`${v.date}T${v.time}:00+06:00`);
  if (Number.isNaN(when.getTime())) return { error: "Pick the date and time." };
  if (when.getTime() < Date.now() - 5 * 60_000) return { error: "That time has already passed. Pick a later one." };

  const [row] = await db.select().from(s.mentorSessions).where(eq(s.mentorSessions.id, v.id)).limit(1);
  if (!row || !["pending", "scheduled"].includes(row.status)) return { error: "This request can't be scheduled any more." };

  let teacherId: number | null = null;
  let name = v.mentorName ?? "";
  let phone = v.mentorPhone ?? "";

  if (v.mentorTeacherId && v.mentorTeacherId !== "other") {
    const [t] = await db.select().from(s.users)
      .where(and(eq(s.users.id, Number(v.mentorTeacherId)), eq(s.users.role, "teacher"), eq(s.users.status, "active"))).limit(1);
    if (!t) return { error: "That teacher isn't available. Pick another." };
    teacherId = t.id;
    name = t.name;
    // A number already on the teacher's profile wins; otherwise the one typed here.
    phone = t.phone?.replace(/[\s-]/g, "") || phone;
    if (!BD_PHONE.test(phone)) return { error: `${t.name} has no WhatsApp number saved. Enter it, like 01712345678.` };
    if (!t.phone) await db.update(s.users).set({ phone }).where(eq(s.users.id, t.id));

    // One teacher, one session per slot.
    const clash = await db.select({ id: s.mentorSessions.id, at: s.mentorSessions.scheduledAt }).from(s.mentorSessions)
      .where(and(
        eq(s.mentorSessions.mentorTeacherId, t.id),
        eq(s.mentorSessions.status, "scheduled"),
        sql`${s.mentorSessions.id} <> ${row.id}`,
        sql`abs(extract(epoch from (${s.mentorSessions.scheduledAt} - ${when.toISOString()}::timestamptz))) < ${MENTOR_SLOT_MINUTES * 60}`,
      )).limit(1);
    if (clash.length) {
      const at = clash[0].at!.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true });
      return { error: `${t.name} already has a session at ${at} that day. Pick another slot or teacher.` };
    }
  } else {
    if (name.length < 2) return { error: "Enter the mentor's name." };
    if (!BD_PHONE.test(phone)) return { error: "Enter the mentor's WhatsApp number, like 01712345678." };
  }

  await db.update(s.mentorSessions).set({
    status: "scheduled", scheduledAt: when, mentorTeacherId: teacherId, mentorName: name, mentorPhone: phone,
    adminMessage: v.adminMessage || null, respondedBy: me.id,
  }).where(eq(s.mentorSessions.id, v.id));
  await db.insert(s.notifications).values({
    userId: row.studentId, type: "mentor.scheduled",
    payload: { title: row.status === "scheduled" ? "Your mentor session was rescheduled" : "Your mentor session is scheduled", href: "/student/mentor" },
  });
  await db.insert(s.auditLogs).values({
    actorId: me.id, action: "mentor.schedule", entity: "mentor_session", entityId: String(v.id),
    after: { scheduledAt: when.toISOString(), mentorTeacherId: teacherId, mentorName: name },
  });

  revalidatePath(`/admin/mentor/${v.id}`);
  return { ok: teacherId ? `Scheduled with ${name}. The student and the teacher can both see it now.` : "Scheduled. The student can see the details now." };
}

/** The assigned teacher marks a session as held. */
export async function teacherCompleteSession(fd: FormData) {
  const me = await requirePortal("teacher");
  const id = Number(fd.get("id"));
  await db.update(s.mentorSessions).set({ status: "completed" })
    .where(and(eq(s.mentorSessions.id, id), eq(s.mentorSessions.mentorTeacherId, me.id), eq(s.mentorSessions.status, "scheduled")));
  revalidatePath("/teacher/sessions");
}

export async function closeSession(_: MentorFormState, fd: FormData): Promise<MentorFormState> {
  const me = await requirePortal("admin");
  const id = Number(fd.get("id"));
  const outcome = fd.get("outcome") === "completed" ? "completed" : "cancelled";
  const message = String(fd.get("adminMessage") ?? "").trim().slice(0, 1000);

  const [row] = await db.select().from(s.mentorSessions).where(eq(s.mentorSessions.id, id)).limit(1);
  if (!row || !["pending", "scheduled"].includes(row.status)) return { error: "This request is already closed." };
  if (outcome === "completed" && row.status !== "scheduled") return { error: "Only a scheduled session can be marked as done." };
  if (outcome === "cancelled" && message.length < 3) return { error: "Tell the student why it was cancelled." };

  await db.update(s.mentorSessions).set({
    status: outcome, respondedBy: me.id, ...(outcome === "cancelled" ? { adminMessage: message } : {}),
  }).where(eq(s.mentorSessions.id, id));
  // A cancelled session goes back into the student's allowance.
  if (outcome === "cancelled") await refundSession(row);
  if (outcome === "cancelled") {
    await db.insert(s.notifications).values({
      userId: row.studentId, type: "mentor.cancelled", payload: { title: "Your mentor session request was cancelled", href: "/student/mentor" },
    });
  }
  await db.insert(s.auditLogs).values({ actorId: me.id, action: `mentor.${outcome}`, entity: "mentor_session", entityId: String(id) });

  revalidatePath(`/admin/mentor/${id}`);
  return { ok: outcome === "completed" ? "Marked as done." : "Cancelled, and the session was returned to the student." };
}
