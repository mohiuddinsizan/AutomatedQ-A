"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "node:crypto";
import { db, schema } from "@/db";
import { requirePortal, type CurrentUser } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { setSetting } from "@/lib/settings";

const s = schema;

export type AdminFormState = { error?: string; ok?: string; secret?: string } | undefined;

const audit = (actor: CurrentUser, action: string, entity: string, entityId: number | string, after?: unknown) =>
  db.insert(s.auditLogs).values({
    actorId: actor.id, action, entity, entityId: String(entityId),
    after: (after ?? null) as Record<string, unknown> | null,
  });

/** Readable temporary password, shown to the admin once. */
const tempPassword = () => crypto.randomBytes(9).toString("base64url").slice(0, 10);

const ids = (fd: FormData, key: string) =>
  fd.getAll(key).map(Number).filter((n) => Number.isInteger(n) && n > 0);

/* ---------- Accounts ---------- */

async function targetUser(id: number) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, id)).limit(1);
  return u ?? null;
}

/** Admins manage students and teachers; only a super admin manages other admins. */
function mayManage(me: CurrentUser, role: string) {
  if (role === "student" || role === "teacher") return true;
  return me.role === "super_admin";
}

export async function resetPassword(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const u = await targetUser(Number(fd.get("userId")));
  if (!u || !mayManage(me, u.role)) return { error: "You can't reset this account." };
  if (u.id === me.id) return { error: "Change your own password from the Password page." };

  // Students go back to their phone number, which is what they're told at sign-in.
  // Everyone else gets a one-time password to pass on.
  const usePhone = u.role === "student" && Boolean(u.phone);
  const password = usePhone ? u.phone! : tempPassword();

  await db.update(s.users).set({
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    tokenVersion: u.tokenVersion + 1, // signs them out everywhere
  }).where(eq(s.users.id, u.id));
  await audit(me, "password.reset", "user", u.id);

  revalidatePath("/admin", "layout");
  return usePhone
    ? { ok: `Password reset to the phone number on file (${u.phone}). They'll choose a new one when they sign in.` }
    : { ok: "Password reset. Give this one-time password to the person; they'll choose their own when they sign in.", secret: password };
}

export async function setAccountStatus(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const u = await targetUser(Number(fd.get("userId")));
  const status = fd.get("status") === "active" ? "active" : "disabled";
  if (!u || !mayManage(me, u.role)) return { error: "You can't change this account." };
  if (u.id === me.id) return { error: "You can't disable your own account." };

  await db.update(s.users).set({
    status,
    disabledBy: status === "disabled" ? "admin" : null,
    // Disabling signs the person out everywhere.
    tokenVersion: status === "disabled" ? u.tokenVersion + 1 : u.tokenVersion,
  }).where(eq(s.users.id, u.id));
  await audit(me, status === "disabled" ? "user.disable" : "user.enable", "user", u.id);

  revalidatePath("/admin", "layout");
  return { ok: status === "disabled" ? "Account disabled and signed out." : "Account enabled." };
}

/* ---------- Quotas ---------- */

const count = z.coerce.number().int().min(0, "Must be 0 or more").max(999, "Must be under 1000");

export async function setStudentQuota(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const parsed = z.object({ studentId: z.coerce.number().int(), courseId: z.coerce.number().int(), qa: count, sessions: count })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const [enr] = await db.select().from(s.enrollments)
    .where(and(eq(s.enrollments.studentId, v.studentId), eq(s.enrollments.courseId, v.courseId))).limit(1);
  if (!enr) return { error: "This student isn't enrolled in that course." };

  await db.insert(s.quotas).values({ studentId: v.studentId, courseId: v.courseId, qaRemaining: v.qa, sessionRemaining: v.sessions, updatedBy: me.id })
    .onConflictDoUpdate({
      target: [s.quotas.studentId, s.quotas.courseId],
      set: { qaRemaining: v.qa, sessionRemaining: v.sessions, updatedBy: me.id, updatedAt: new Date() },
    });
  await audit(me, "quota.set", "quota", `${v.studentId}:${v.courseId}`, { qa: v.qa, sessions: v.sessions });

  revalidatePath(`/admin/students/${v.studentId}`);
  return { ok: "Allowance saved." };
}

/* ---------- Courses ---------- */

export async function updateCourse(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const parsed = z.object({ courseId: z.coerce.number().int(), qa: count, sessions: count }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const leaderboard = fd.get("leaderboard") === "on";
  const listed = fd.get("listed") === "on";

  await db.update(s.courses).set({
    defaultQaQuota: v.qa, defaultSessionQuota: v.sessions, leaderboardPublished: leaderboard, listed,
  }).where(eq(s.courses.id, v.courseId));
  await audit(me, "course.update", "course", v.courseId, { qa: v.qa, sessions: v.sessions, leaderboard, listed });

  revalidatePath(`/admin/courses/${v.courseId}`);
  return { ok: "Course settings saved. New enrollments start with these allowances." };
}

/** Course-wide change. Only students with an active enrollment are touched (AGENTS.md rule 5). */
export async function applyCourseQuota(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const parsed = z.object({
    courseId: z.coerce.number().int(),
    mode: z.enum(["set", "add"]),
    qa: z.coerce.number().int().min(-999).max(999),
    sessions: z.coerce.number().int().min(-999).max(999),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Enter whole numbers." };
  const v = parsed.data;
  if (v.mode === "set" && (v.qa < 0 || v.sessions < 0)) return { error: "Allowances can't be negative." };

  const active = db.select({ id: s.enrollments.studentId }).from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, v.courseId), eq(s.enrollments.status, "active")));

  // Anyone actively enrolled without an allowance row gets one first.
  await db.execute(sql`
    insert into quotas (student_id, course_id, qa_remaining, session_remaining, updated_by)
    select e.student_id, e.course_id, 0, 0, ${me.id} from enrollments e
    where e.course_id = ${v.courseId} and e.status = 'active'
    on conflict do nothing`);

  const changed = await db.update(s.quotas).set(
    v.mode === "set"
      ? { qaRemaining: v.qa, sessionRemaining: v.sessions, updatedBy: me.id, updatedAt: new Date() }
      : {
          qaRemaining: sql`greatest(0, ${s.quotas.qaRemaining} + ${v.qa})`,
          sessionRemaining: sql`greatest(0, ${s.quotas.sessionRemaining} + ${v.sessions})`,
          updatedBy: me.id, updatedAt: new Date(),
        },
  ).where(and(eq(s.quotas.courseId, v.courseId), inArray(s.quotas.studentId, active)))
    .returning({ id: s.quotas.studentId });

  await audit(me, `quota.course.${v.mode}`, "course", v.courseId, { qa: v.qa, sessions: v.sessions, students: changed.length });
  revalidatePath(`/admin/courses/${v.courseId}`);
  return { ok: `Updated the allowance of ${changed.length.toLocaleString()} actively enrolled students.` };
}

export async function setCourseSubjects(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const courseId = Number(fd.get("courseId"));
  const subjectIds = ids(fd, "subjectIds");
  await db.transaction(async (tx) => {
    await tx.delete(s.courseSubjects).where(eq(s.courseSubjects.courseId, courseId));
    if (subjectIds.length) await tx.insert(s.courseSubjects).values(subjectIds.map((subjectId) => ({ courseId, subjectId })));
  });
  await audit(me, "course.subjects", "course", courseId, { subjectIds });
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: subjectIds.length ? "Subjects saved." : "Cleared. Students will see every subject." };
}

export async function setExamPublished(fd: FormData) {
  const me = await requirePortal("admin");
  const examId = Number(fd.get("examId"));
  const published = fd.get("published") === "1";
  const [exam] = await db.update(s.exams).set({ published }).where(eq(s.exams.id, examId)).returning({ courseId: s.exams.courseId });
  if (!exam) return;
  await audit(me, published ? "exam.publish" : "exam.unpublish", "exam", examId);
  revalidatePath(`/admin/courses/${exam.courseId}`);
}

export async function createSubject(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { error: "Enter a subject name." };
  const [row] = await db.insert(s.subjects).values({ name }).onConflictDoNothing().returning({ id: s.subjects.id });
  if (!row) return { error: "That subject already exists." };
  await audit(me, "subject.create", "subject", row.id, { name });
  revalidatePath("/admin/settings");
  return { ok: `Added ${name}.` };
}

/* ---------- Staff ---------- */

const staffSchema = z.object({
  username: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9._-]{3,64}$/, "Username: 3–64 letters, numbers, dots, dashes or underscores"),
  name: z.string().trim().min(2, "Enter the full name").max(160),
  phone: z.string().trim().max(20).optional(),
});

async function createStaff(me: CurrentUser, role: "teacher" | "admin", fd: FormData) {
  const parsed = staffSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;
  if (/^\d+$/.test(v.username)) return { error: "Staff usernames can't be only digits; those are student roll numbers." } as const;

  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${v.username}`).limit(1);
  if (taken) return { error: "That username is already in use." } as const;

  const password = tempPassword();
  const [u] = await db.insert(s.users).values({
    role, username: v.username, name: v.name, phone: v.phone || null,
    passwordHash: await hashPassword(password), mustChangePassword: true,
  }).returning({ id: s.users.id });
  await audit(me, `${role}.create`, "user", u.id, { username: v.username });
  return { id: u.id, password } as const;
}

export async function createTeacher(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const made = await createStaff(me, "teacher", fd);
  if ("error" in made) return { error: made.error };

  await db.insert(s.teachers).values({ userId: made.id });
  const courseIds = ids(fd, "courseIds");
  const subjectIds = ids(fd, "subjectIds");
  if (courseIds.length) await db.insert(s.teacherCourses).values(courseIds.map((courseId) => ({ teacherId: made.id, courseId })));
  if (subjectIds.length) await db.insert(s.teacherSubjects).values(subjectIds.map((subjectId) => ({ teacherId: made.id, subjectId })));

  revalidatePath("/admin/teachers");
  return {
    ok: `Teacher account created. They sign in at /teacher/login with username “${String(fd.get("username")).trim().toLowerCase()}” and this one-time password:`,
    secret: made.password,
  };
}

export async function setTeacherAssignments(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const teacherId = Number(fd.get("teacherId"));
  const [t] = await db.select().from(s.teachers).where(eq(s.teachers.userId, teacherId)).limit(1);
  if (!t) return { error: "Teacher not found." };
  const courseIds = ids(fd, "courseIds");
  const subjectIds = ids(fd, "subjectIds");

  await db.transaction(async (tx) => {
    await tx.delete(s.teacherCourses).where(eq(s.teacherCourses.teacherId, teacherId));
    await tx.delete(s.teacherSubjects).where(eq(s.teacherSubjects.teacherId, teacherId));
    if (courseIds.length) await tx.insert(s.teacherCourses).values(courseIds.map((courseId) => ({ teacherId, courseId })));
    if (subjectIds.length) await tx.insert(s.teacherSubjects).values(subjectIds.map((subjectId) => ({ teacherId, subjectId })));
  });
  await audit(me, "teacher.assign", "user", teacherId, { courseIds, subjectIds });

  revalidatePath(`/admin/teachers/${teacherId}`);
  return { ok: "Assignments saved." };
}

export async function createAdmin(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  if (me.role !== "super_admin") return { error: "Only the super admin can create admins." };
  const made = await createStaff(me, "admin", fd);
  if ("error" in made) return { error: made.error };
  revalidatePath("/admin/admins");
  return {
    ok: `Admin account created. They sign in at /admin/login with username “${String(fd.get("username")).trim().toLowerCase()}” and this one-time password:`,
    secret: made.password,
  };
}

/* ---------- Settings ---------- */

export async function saveSettings(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const parsed = z.object({
    consumeOn: z.enum(["submit", "escalate"]),
    maxFollowups: z.coerce.number().int().min(0).max(20),
    mentorTemplate: z.string().trim().min(5, "Write the mentor message").max(1000),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  await setSetting("qa.consume_on", v.consumeOn, me.id);
  await setSetting("qa.max_followups", v.maxFollowups, me.id);
  await setSetting("mentor.reply_template", v.mentorTemplate, me.id);
  await audit(me, "settings.update", "settings", "qa+mentor", v);

  revalidatePath("/admin/settings");
  return { ok: "Settings saved." };
}


export async function setAiProvider(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const provider = fd.get("provider") === "openai" ? "openai" : "gemini";
  await setSetting("ai.provider", provider, me.id);
  await audit(me, "settings.ai_provider", "settings", "ai.provider", { provider });
  revalidatePath("/admin/settings");
  return { ok: provider === "openai" ? "ChatGPT will answer new questions." : "Gemini will answer new questions." };
}

/* ---------- Staff links ---------- */

const linkSchema = z.object({
  id: z.coerce.number().int().optional(),
  title: z.string().trim().min(2, "Give the link a name").max(120),
  url: z.string().trim().url("Enter the full address, starting with https://")
    .refine((u) => /^https?:\/\//i.test(u), "The address must start with https://"),
  description: z.string().trim().max(500).optional(),
  audience: z.enum(["staff", "admins"]),
  position: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveLink(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await requirePortal("admin");
  const raw = Object.fromEntries(fd);
  const parsed = linkSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...v } = parsed.data;
  const values = { ...v, description: v.description || null };

  if (id) {
    await db.update(s.staffLinks).set(values).where(eq(s.staffLinks.id, id));
    await audit(me, "link.update", "staff_link", id, values);
  } else {
    const [row] = await db.insert(s.staffLinks).values({ ...values, createdBy: me.id }).returning({ id: s.staffLinks.id });
    await audit(me, "link.create", "staff_link", row.id, values);
  }
  revalidatePath("/admin/links");
  return { ok: id ? "Link updated." : "Link added." };
}

export async function deleteLink(fd: FormData) {
  const me = await requirePortal("admin");
  const id = Number(fd.get("id"));
  await db.delete(s.staffLinks).where(eq(s.staffLinks.id, id));
  await audit(me, "link.delete", "staff_link", id);
  revalidatePath("/admin/links");
}
