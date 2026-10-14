import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const s = schema;

/** Exams students may see: published by an admin and still reported by BigBang. */
const visibleExam = and(eq(s.exams.published, true), eq(s.exams.removedUpstream, false));
const countedResult = and(eq(s.results.withdrawn, false), sql`${s.results.marks} is not null`);

/**
 * Percentage only when every part the student sat has a recorded full mark;
 * otherwise we'd be dividing by a number nobody wrote down.
 */
export function percentOf(r: {
  marks: number | null; satMcq: boolean | null; satWritten: boolean | null;
  fullMcqMark: number | null; fullWrittenMark: number | null;
}) {
  if (r.marks === null) return null;
  if (r.satMcq && r.fullMcqMark === null) return null;
  if (r.satWritten && r.fullWrittenMark === null) return null;
  // Out of the whole exam: missing the written part counts against the percentage.
  const full = (r.fullMcqMark ?? 0) + (r.fullWrittenMark ?? 0);
  return full > 0 ? Math.round((r.marks / full) * 1000) / 10 : null;
}

/** Is the student allowed to see this course (any enrollment, active or past)? */
export async function studentCourse(studentId: number, courseId: number) {
  if (!Number.isInteger(courseId)) return null;
  const [row] = await db.select({
    id: s.courses.id, name: s.courses.name, batch: s.courses.batch, status: s.courses.status,
    leaderboardPublished: s.courses.leaderboardPublished, enrollment: s.enrollments.status,
    resultsSyncedAt: s.courses.resultsSyncedAt,
  })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(eq(s.enrollments.studentId, studentId), eq(s.enrollments.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

/** Every visible exam of a course, newest first, with this student's result if any. */
export async function studentResults(studentId: number, courseId: number) {
  const sitters = db.$with("sitters").as(
    db.select({
      examId: s.results.examId,
      n: sql<number>`count(*)::int`.as("n"),
      top: sql<number | null>`max(${s.results.marks})::float`.as("top"),
      avg: sql<number | null>`avg(${s.results.marks})::float`.as("avg"),
    }).from(s.results).where(countedResult).groupBy(s.results.examId),
  );

  return db.with(sitters).select({
    examId: s.exams.id,
    title: s.exams.title,
    examDate: s.exams.examDate,
    fullMcqMark: s.exams.fullMcqMark,
    fullWrittenMark: s.exams.fullWrittenMark,
    totalMarks: s.exams.totalMarks,
    sitters: sitters.n,
    top: sitters.top,
    avg: sitters.avg,
    marks: s.results.marks,
    mcqMark: s.results.mcqMark,
    writtenMark: s.results.writtenMark,
    satMcq: sql<boolean>`coalesce(${s.results.satMcq}, false)`,
    satWritten: sql<boolean>`coalesce(${s.results.satWritten}, false)`,
    correct: s.results.correct,
    incorrect: s.results.incorrect,
    skipped: s.results.skipped,
    questions: s.results.questions,
    rank: s.results.rank,
    percentile: s.results.percentile,
  })
    .from(s.exams)
    .leftJoin(s.results, and(eq(s.results.examId, s.exams.id), eq(s.results.studentId, studentId), eq(s.results.withdrawn, false)))
    .leftJoin(sitters, eq(sitters.examId, s.exams.id))
    .where(and(eq(s.exams.courseId, courseId), visibleExam))
    .orderBy(desc(s.exams.examDate), desc(s.exams.id));
}

export type StudentResult = Awaited<ReturnType<typeof studentResults>>[number];

export async function visibleExamOfCourse(courseId: number, examId: number) {
  if (!Number.isInteger(examId)) return null;
  const [exam] = await db.select().from(s.exams)
    .where(and(eq(s.exams.id, examId), eq(s.exams.courseId, courseId), visibleExam)).limit(1);
  return exam ?? null;
}

/** Top of one exam's merit list. Only name, branch and marks are shown, never contact details. */
export async function examMerit(examId: number, limit = 10) {
  return db.select({
    studentId: s.results.studentId,
    name: s.users.name,
    branch: s.students.institution,
    marks: s.results.marks,
    rank: s.results.rank,
  })
    .from(s.results)
    .innerJoin(s.users, eq(s.users.id, s.results.studentId))
    .leftJoin(s.students, eq(s.students.userId, s.results.studentId))
    .where(and(eq(s.results.examId, examId), countedResult))
    .orderBy(asc(s.results.rank), asc(s.users.name))
    .limit(limit);
}

/**
 * The course leaderboard: total marks across every visible exam. Missing an exam
 * counts as zero for it, so regular attendance is rewarded. Equal totals share a rank.
 */
export async function courseLeaderboard(courseId: number) {
  const rows = await db.execute<{
    student_id: number; name: string; branch: string | null;
    total: number; exams: number; rank: number;
  }>(sql`
    select r.student_id, u.name, st.institution as branch,
           sum(r.marks)::float as total, count(*)::int as exams,
           rank() over (order by sum(r.marks) desc)::int as rank
    from results r
    join exams e on e.id = r.exam_id
    join users u on u.id = r.student_id
    left join students st on st.user_id = r.student_id
    where e.course_id = ${courseId} and e.published and not e.removed_upstream
      and not r.withdrawn and r.marks is not null
    group by r.student_id, u.name, st.institution
    order by total desc, u.name asc`);
  return rows.rows;
}

/** Every course the student has, active ones first, with allowances and result counts. */
export async function studentCourses(studentId: number) {
  const rows = await db.select({
    id: s.courses.id, name: s.courses.name, batch: s.courses.batch, status: s.courses.status,
    enrollment: s.enrollments.status, qa: s.quotas.qaRemaining, sessions: s.quotas.sessionRemaining,
  })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .leftJoin(s.quotas, and(eq(s.quotas.courseId, s.courses.id), eq(s.quotas.studentId, s.enrollments.studentId)))
    .where(eq(s.enrollments.studentId, studentId))
    .orderBy(asc(s.courses.name));

  const sat = await db.select({ courseId: s.exams.courseId, n: sql<number>`count(*)::int` })
    .from(s.results).innerJoin(s.exams, eq(s.exams.id, s.results.examId))
    .where(and(eq(s.results.studentId, studentId), countedResult, visibleExam))
    .groupBy(s.exams.courseId);

  return rows.map((r) => ({
    ...r,
    active: r.status === "active" && r.enrollment === "active",
    examsSat: sat.find((x) => x.courseId === r.id)?.n ?? 0,
  })).sort((a, b) => Number(b.active) - Number(a.active));
}

export type StudentCourse = Awaited<ReturnType<typeof studentCourses>>[number];

/**
 * Active BigBang courses the student isn't in, to advertise on their home page.
 * Admins can take a course off this list (courses.listed).
 */
export async function availableCourses(studentId: number) {
  return db.select({ id: s.courses.id, name: s.courses.name, batch: s.courses.batch, code: s.courses.code })
    .from(s.courses)
    .where(and(
      eq(s.courses.status, "active"),
      eq(s.courses.listed, true),
      sql`${s.courses.externalId} ~ '^[0-9a-f]{24}$'`,
      sql`not exists (select 1 from enrollments e where e.course_id = "courses"."id" and e.student_id = ${studentId} and e.status = 'active')`,
    ))
    .orderBy(asc(s.courses.name));
}
