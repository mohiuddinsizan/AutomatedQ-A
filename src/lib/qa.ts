import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./dal";

const s = schema;

export type QaStatus = (typeof s.qaStatusEnum.enumValues)[number];

/**
 * Which questions a teacher may see: questions from the courses they're assigned
 * to, narrowed to their subjects when they have any.
 */
export async function teacherScope(teacherId: number) {
  const [courses, subjects] = await Promise.all([
    db.select({ id: s.teacherCourses.courseId }).from(s.teacherCourses).where(eq(s.teacherCourses.teacherId, teacherId)),
    db.select({ id: s.teacherSubjects.subjectId }).from(s.teacherSubjects).where(eq(s.teacherSubjects.teacherId, teacherId)),
  ]);
  return { courseIds: courses.map((c) => c.id), subjectIds: subjects.map((x) => x.id) };
}

export type TeacherScope = Awaited<ReturnType<typeof teacherScope>>;

/** SQL condition for threads inside a teacher's scope. Matches nothing when unassigned. */
export function scopeWhere(scope: TeacherScope): SQL {
  if (!scope.courseIds.length) return sql`false`;
  const byCourse = inArray(s.qaThreads.courseId, scope.courseIds);
  const visible = eq(s.qaThreads.hidden, false);
  return scope.subjectIds.length
    ? and(byCourse, inArray(s.qaThreads.subjectId, scope.subjectIds), visible)!
    : and(byCourse, visible)!;
}

type ThreadRow = { studentId: number; courseId: number; subjectId: number; hidden: boolean; status: QaStatus };

/** The rule from AGENTS.md: admins see all, teachers their courses, students their own. */
export async function canSeeThread(user: CurrentUser, t: ThreadRow) {
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (user.role === "student") return t.studentId === user.id;
  if (user.role === "teacher") {
    if (t.hidden || t.status === "draft") return false;
    const scope = await teacherScope(user.id);
    return scope.courseIds.includes(t.courseId) && (!scope.subjectIds.length || scope.subjectIds.includes(t.subjectId));
  }
  return false;
}

/** A full thread for display, or null when it doesn't exist or this user may not see it. */
export async function getThread(user: CurrentUser, threadId: number) {
  if (!Number.isInteger(threadId)) return null;
  const [thread] = await db.select({
    id: s.qaThreads.id,
    studentId: s.qaThreads.studentId,
    courseId: s.qaThreads.courseId,
    subjectId: s.qaThreads.subjectId,
    status: s.qaThreads.status,
    question: s.qaThreads.question,
    hidden: s.qaThreads.hidden,
    teacherId: s.qaThreads.teacherId,
    quotaCharged: s.qaThreads.quotaCharged,
    aiVerdict: s.qaThreads.aiVerdict,
    aiNote: s.qaThreads.aiNote,
    createdAt: s.qaThreads.createdAt,
    updatedAt: s.qaThreads.updatedAt,
    escalatedAt: s.qaThreads.escalatedAt,
    resolvedAt: s.qaThreads.resolvedAt,
    courseName: s.courses.name,
    subjectName: s.subjects.name,
    studentName: s.users.name,
    studentRoll: s.users.username,
  })
    .from(s.qaThreads)
    .innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.qaThreads.subjectId))
    .innerJoin(s.users, eq(s.users.id, s.qaThreads.studentId))
    .where(eq(s.qaThreads.id, threadId))
    .limit(1);

  if (!thread || !(await canSeeThread(user, thread))) return null;

  const messages = await db.select({
    id: s.qaMessages.id,
    senderType: s.qaMessages.senderType,
    senderId: s.qaMessages.senderId,
    senderName: s.users.name,
    body: s.qaMessages.body,
    rating: s.qaMessages.rating,
    ratingNote: s.qaMessages.ratingNote,
    aiMeta: s.qaMessages.aiMeta,
    createdAt: s.qaMessages.createdAt,
  })
    .from(s.qaMessages)
    .leftJoin(s.users, eq(s.users.id, s.qaMessages.senderId))
    .where(eq(s.qaMessages.threadId, threadId))
    .orderBy(asc(s.qaMessages.createdAt), asc(s.qaMessages.id));

  const files = messages.length
    ? await db.select({
        id: s.attachments.id, messageId: s.attachments.messageId, kind: s.attachments.kind,
        mime: s.attachments.mime, transcript: s.attachments.transcript, durationSec: s.attachments.durationSec,
      }).from(s.attachments).where(inArray(s.attachments.messageId, messages.map((m) => m.id)))
    : [];

  let teacherName: string | null = null;
  if (thread.teacherId) {
    const [t] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, thread.teacherId)).limit(1);
    teacherName = t?.name ?? null;
  }

  return {
    ...thread,
    teacherName,
    messages: messages.map((m) => ({ ...m, files: files.filter((f) => f.messageId === m.id) })),
  };
}

export type Thread = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** Subjects a student can file a question under: the course's own list, or every subject. */
export async function subjectsForCourse(courseId: number) {
  const own = await db.select({ id: s.subjects.id, name: s.subjects.name })
    .from(s.courseSubjects).innerJoin(s.subjects, eq(s.subjects.id, s.courseSubjects.subjectId))
    .where(eq(s.courseSubjects.courseId, courseId)).orderBy(asc(s.subjects.name));
  if (own.length) return own;
  return db.select({ id: s.subjects.id, name: s.subjects.name }).from(s.subjects).orderBy(asc(s.subjects.name));
}

export const STATUS_LABEL: Record<QaStatus, string> = {
  draft: "Needs your confirmation",
  awaiting_ai: "Being answered",
  ai_answered: "Answered by AI",
  escalated: "Waiting for a teacher",
  teacher_claimed: "Teacher is answering",
  answered: "Teacher replied",
  resolved: "Solved",
  closed_timeout: "Closed",
};

/**
 * Question counts per course, for the course-wise queues. For a teacher, pass their
 * scope and id: "in progress" then counts only the questions they have taken.
 */
export async function courseQueues(opts: { scope?: TeacherScope; teacherId?: number } = {}) {
  const t = s.qaThreads;
  const mine = opts.teacherId ? sql`and ${t.teacherId} = ${opts.teacherId}` : sql``;
  const rows = await db.select({
    courseId: s.courses.id,
    name: s.courses.name,
    batch: s.courses.batch,
    waiting: sql<number>`count(*) filter (where ${t.status} = 'escalated')::int`,
    inProgress: sql<number>`count(*) filter (where ${t.status} = 'teacher_claimed' ${mine})::int`,
    replied: sql<number>`count(*) filter (where ${t.status} = 'answered')::int`,
    aiAnswered: sql<number>`count(*) filter (where ${t.status} in ('ai_answered', 'awaiting_ai'))::int`,
    solved: sql<number>`count(*) filter (where ${t.status} in ('resolved', 'closed_timeout'))::int`,
    total: sql<number>`count(*)::int`,
    oldestWaiting: sql<string | null>`min(${t.escalatedAt}) filter (where ${t.status} = 'escalated')`,
    lastActivity: sql<string>`max(${t.updatedAt})`,
  })
    .from(t)
    .innerJoin(s.courses, eq(s.courses.id, t.courseId))
    .where(and(sql`${t.status} <> 'draft'`, opts.scope ? scopeWhere(opts.scope) : undefined))
    .groupBy(s.courses.id, s.courses.name, s.courses.batch);

  // Most urgent first: courses with questions waiting, then by latest activity.
  return rows.sort((a, b) => (b.waiting + b.inProgress) - (a.waiting + a.inProgress) || (b.lastActivity > a.lastActivity ? 1 : -1));
}

export type CourseQueue = Awaited<ReturnType<typeof courseQueues>>[number];

/** Question rows for a list: what was asked, by whom, and how long it has waited. */
export async function questionRows(where: SQL | undefined, opts: { order?: "oldest" | "newest"; limit?: number; offset?: number } = {}) {
  const t = s.qaThreads;
  return db.select({
    id: t.id, question: t.question, status: t.status, hidden: t.hidden,
    escalatedAt: t.escalatedAt, updatedAt: t.updatedAt, createdAt: t.createdAt,
    course: s.courses.name, subject: s.subjects.name, student: s.users.name, roll: s.users.username,
    rating: sql<number | null>`(select avg(m.rating)::float from qa_messages m where m.thread_id = "qa_threads"."id" and m.rating is not null)`,
    replies: sql<number>`(select count(*)::int from qa_messages m where m.thread_id = "qa_threads"."id")`,
  })
    .from(t)
    .innerJoin(s.courses, eq(s.courses.id, t.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, t.subjectId))
    .innerJoin(s.users, eq(s.users.id, t.studentId))
    .where(where)
    .orderBy(opts.order === "oldest" ? sql`coalesce(${t.escalatedAt}, ${t.updatedAt}) asc` : sql`${t.updatedAt} desc`)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

export type QuestionRow = Awaited<ReturnType<typeof questionRows>>[number];

/** Photo ids per mentor session, for showing thumbnails. */
export async function mentorPhotoIds(sessionIds: number[]) {
  const map = new Map<number, number[]>();
  if (!sessionIds.length) return map;
  const rows = await db.select({ id: s.mentorAttachments.id, sessionId: s.mentorAttachments.sessionId })
    .from(s.mentorAttachments).where(inArray(s.mentorAttachments.sessionId, sessionIds)).orderBy(asc(s.mentorAttachments.id));
  for (const r of rows) map.set(r.sessionId, [...(map.get(r.sessionId) ?? []), r.id]);
  return map;
}

/** Status groups for the "all questions" lists. */
export const STATUS_GROUPS: { key: string; label: string; statuses: QaStatus[] }[] = [
  { key: "all", label: "All", statuses: ["awaiting_ai", "ai_answered", "escalated", "teacher_claimed", "answered", "resolved", "closed_timeout"] },
  { key: "waiting", label: "Waiting for a teacher", statuses: ["escalated"] },
  { key: "progress", label: "Teacher answering", statuses: ["teacher_claimed"] },
  { key: "replied", label: "Teacher replied", statuses: ["answered"] },
  { key: "ai", label: "AI answered", statuses: ["ai_answered", "awaiting_ai"] },
  { key: "solved", label: "Solved / closed", statuses: ["resolved", "closed_timeout"] },
];

/** Search across the question text, the student's name and roll. */
export function questionSearch(q: string): SQL | undefined {
  const term = q.trim().replace(/[%_]/g, "").slice(0, 80);
  if (!term) return undefined;
  const like = `%${term}%`;
  return sql`(${s.qaThreads.question} ilike ${like} or ${s.users.name} ilike ${like} or ${s.users.username} ilike ${like})`;
}

/** How many questions match, using the same joins as questionRows (so search works). */
export async function questionCount(where: SQL | undefined) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(s.qaThreads)
    .innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.qaThreads.subjectId))
    .innerJoin(s.users, eq(s.users.id, s.qaThreads.studentId))
    .where(where);
  return row?.n ?? 0;
}
