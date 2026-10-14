import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchCourseResults } from "./client";

const s = schema;

export type ResultSyncReport = {
  runId: number;
  status: "success" | "partial" | "failed";
  courses: { id: number; name: string; exams: number; results: number; unknownRolls: number; identityConflicts?: number; error?: string }[];
  examsCreated: number;
  resultsWritten: number;
  resultsWithdrawn: number;
  unknownRolls: string[]; // sample of rolls with results but no portal account
  identityConflicts: string[]; // sample of rolls whose result belongs to someone else (see samePerson)
  error?: string;
  seconds: number;
};

const CHUNK = 500;

const lastTen = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);
const normName = (n: string | null | undefined) => (n ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * BigBang reuses roll numbers across programmes (an Olympiad roll can belong to a
 * different child than the same roll in a regular course). A result is attached
 * when the name or the phone matches the account; when both differ it belongs to
 * someone else and is skipped and reported, so nobody is shown another's marks.
 */
function samePerson(account: { name: string; phone: string | null }, record: { name?: string | null; phone_number?: string | null }) {
  if (normName(account.name) === normName(record.name)) return true;
  const a = lastTen(account.phone), r = lastTen(record.phone_number);
  return Boolean(a && r && a === r);
}

function fullTotal(mcq: number | null, written: number | null) {
  return mcq === null && written === null ? null : (mcq ?? 0) + (written ?? 0);
}

/** Imports one course's exams and results, then re-ranks every exam in it. */
async function syncCourse(course: { id: number; name: string; externalId: string }, report: ResultSyncReport) {
  const { exams, students } = await fetchCourseResults(course.externalId);

  const examIds = new Map<string, number>();
  for (const e of exams) {
    const [row] = await db.insert(s.exams).values({
      courseId: course.id,
      externalId: e.id,
      title: e.title?.trim() || "Untitled exam",
      examDate: e.exam_date ? new Date(e.exam_date.endsWith("Z") || e.exam_date.includes("+") ? e.exam_date : `${e.exam_date}+06:00`) : null,
      fullMcqMark: e.full_mcq_mark,
      fullWrittenMark: e.full_written_mark,
      totalMarks: fullTotal(e.full_mcq_mark, e.full_written_mark),
      removedUpstream: false,
    }).onConflictDoUpdate({
      target: [s.exams.courseId, s.exams.externalId],
      set: {
        title: e.title?.trim() || "Untitled exam",
        examDate: sql`excluded.exam_date`,
        fullMcqMark: e.full_mcq_mark,
        fullWrittenMark: e.full_written_mark,
        totalMarks: fullTotal(e.full_mcq_mark, e.full_written_mark),
        removedUpstream: false,
        updatedAt: new Date(),
      },
    }).returning({ id: s.exams.id, created: sql<boolean>`(xmax = 0)` });
    examIds.set(e.id, row.id);
    if (row.created) report.examsCreated++;
  }

  // Exams that BigBang no longer reports are hidden, never deleted.
  const live = [...examIds.values()];
  await db.update(s.exams).set({ removedUpstream: true })
    .where(and(eq(s.exams.courseId, course.id), live.length ? sql`${s.exams.id} not in (${sql.join(live, sql`, `)})` : sql`true`));

  // Rolls are matched to portal accounts. Rolls without one (typos, people who
  // never enrolled) are counted and reported, not imported.
  const rolls = [...new Set(students.map((x) => x.roll))];
  const accounts = new Map<string, { id: number; name: string; phone: string | null }>();
  for (let i = 0; i < rolls.length; i += 1000) {
    const rows = await db.select({ id: s.users.id, username: s.users.username, name: s.users.name, phone: s.users.phone }).from(s.users)
      .where(and(eq(s.users.role, "student"), inArray(s.users.username, rolls.slice(i, i + 1000))));
    rows.forEach((r) => accounts.set(r.username, r));
  }

  const syncStarted = new Date();
  const rows: (typeof s.results.$inferInsert)[] = [];
  let unknown = 0;
  let conflicts = 0;
  for (const st of students) {
    const account = accounts.get(st.roll);
    if (!account) {
      if (st.results.length) {
        unknown++;
        if (report.unknownRolls.length < 50) report.unknownRolls.push(st.roll);
      }
      continue;
    }
    if (st.results.length && !samePerson(account, st)) {
      conflicts++;
      if (report.identityConflicts.length < 50) report.identityConflicts.push(st.roll);
      continue;
    }
    const studentId = account.id;
    for (const r of st.results) {
      const examId = examIds.get(r.exam_id);
      if (!examId) continue;
      rows.push({
        examId, studentId,
        marks: r.total_mark,
        mcqMark: r.mcq_mark,
        writtenMark: r.written_mark,
        satMcq: r.sat_mcq,
        satWritten: r.sat_written,
        correct: r.correct, incorrect: r.incorrect, skipped: r.skipped, questions: r.questions,
        absent: false,
        withdrawn: false,
        updatedAt: syncStarted,
      });
    }
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(s.results).values(rows.slice(i, i + CHUNK)).onConflictDoUpdate({
      target: [s.results.examId, s.results.studentId],
      set: {
        marks: sql`excluded.marks`, mcqMark: sql`excluded.mcq_mark`, writtenMark: sql`excluded.written_mark`,
        satMcq: sql`excluded.sat_mcq`, satWritten: sql`excluded.sat_written`,
        correct: sql`excluded.correct`, incorrect: sql`excluded.incorrect`,
        skipped: sql`excluded.skipped`, questions: sql`excluded.questions`,
        withdrawn: false, updatedAt: syncStarted,
      },
    });
  }

  // A result BigBang stopped reporting was usually a scan under the wrong roll.
  // Keep the row but stop showing and ranking it.
  if (live.length) {
    const gone = await db.update(s.results).set({ withdrawn: true })
      .where(and(
        inArray(s.results.examId, live),
        eq(s.results.withdrawn, false),
        sql`${s.results.updatedAt} < ${syncStarted}`,
      ))
      .returning({ id: s.results.id });
    report.resultsWithdrawn += gone.length;
  }

  await rankCourse(course.id);
  await db.update(s.courses).set({ resultsSyncedAt: new Date() }).where(eq(s.courses.id, course.id));

  report.resultsWritten += rows.length;
  report.courses.push({ id: course.id, name: course.name, exams: exams.length, results: rows.length, unknownRolls: unknown, identityConflicts: conflicts });
}

/**
 * Rank within each exam by total mark, highest first. Equal marks share a rank
 * (1, 2, 2, 4). Percentile is the share of sitters scoring at or below you.
 */
export async function rankCourse(courseId: number) {
  await db.execute(sql`
    update results r set rank = x.rnk, percentile = x.pct
    from (
      select r2.id,
             rank() over (partition by r2.exam_id order by r2.marks desc) as rnk,
             round((100 * cume_dist() over (partition by r2.exam_id order by r2.marks asc))::numeric, 2) as pct
      from results r2
      join exams e on e.id = r2.exam_id
      where e.course_id = ${courseId} and not r2.withdrawn and r2.marks is not null
    ) x
    where r.id = x.id`);
  await db.execute(sql`
    update results r set rank = null, percentile = null
    from exams e
    where e.id = r.exam_id and e.course_id = ${courseId} and (r.withdrawn or r.marks is null) and r.rank is not null`);
}

/**
 * Imports results for the given courses, or every active course when none are given.
 * Pass `all` to include archived courses too (their results rarely change).
 */
export async function runResultSync(opts: { trigger: "manual" | "schedule"; courseIds?: number[]; all?: boolean }) {
  const started = Date.now();
  const [run] = await db.insert(s.syncRuns).values({ kind: "results", trigger: opts.trigger, status: "running" }).returning();

  const report: ResultSyncReport = {
    runId: run.id, status: "success", courses: [], examsCreated: 0,
    resultsWritten: 0, resultsWithdrawn: 0, unknownRolls: [], identityConflicts: [], seconds: 0,
  };

  try {
    // Only courses that came from BigBang (a Mongo ObjectId); hand-made ones have no results there.
    const fromBigBang = sql`${s.courses.externalId} ~ '^[0-9a-f]{24}$'`;
    const where = opts.courseIds?.length
      ? and(inArray(s.courses.id, opts.courseIds), fromBigBang)
      : opts.all
        ? fromBigBang
        : and(fromBigBang, eq(s.courses.status, "active"));
    const courses = await db.select({ id: s.courses.id, name: s.courses.name, externalId: s.courses.externalId })
      .from(s.courses).where(where);

    for (const c of courses) {
      try {
        await syncCourse({ id: c.id, name: c.name, externalId: c.externalId! }, report);
      } catch (err) {
        report.status = "partial";
        report.courses.push({ id: c.id, name: c.name, exams: 0, results: 0, unknownRolls: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (courses.length > 0 && report.courses.every((c) => c.error)) report.status = "failed";
  } catch (err) {
    report.status = "failed";
    report.error = err instanceof Error ? err.message : String(err);
  }

  report.seconds = Math.round((Date.now() - started) / 100) / 10;
  await db.update(s.syncRuns).set({
    status: report.status,
    finishedAt: new Date(),
    created: report.examsCreated,
    updated: report.resultsWritten,
    failed: report.courses.filter((c) => c.error).length,
    log: [report as unknown],
  }).where(eq(s.syncRuns.id, run.id));

  return report;
}
