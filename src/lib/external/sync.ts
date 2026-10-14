import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { fetchStudents, fetchLiveRolls, type ExternalItem, type BadRecord } from "./client";
import crypto from "node:crypto";

const s = schema;
const LAST_SUCCESS_KEY = "sync.students.last_success";

export type SyncReport = {
  runId: number;
  mode: "full" | "incremental";
  status: "success" | "partial" | "failed";
  read: number;
  studentsCreated: number;
  studentsUpdated: number;
  coursesCreated: number;
  enrollmentsCreated: number;
  enrollmentsDropped: number;
  accountsDisabled: number;
  noPhone: string[];      // rolls that arrived without a phone number
  nameConflicts: string[]; // rolls whose name differs from what we stored
  bad: BadRecord[];
  /** Set when ended-enrollment detection was skipped, with the reason. */
  dropCheckSkipped?: string;
  error?: string;
  seconds: number;
};

async function getLastSuccess(): Promise<string | null> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, LAST_SUCCESS_KEY)).limit(1);
  return (row?.value as { at?: string } | undefined)?.at ?? null;
}

async function setLastSuccess(at: string) {
  await db.insert(s.settings).values({ key: LAST_SUCCESS_KEY, value: { at } })
    .onConflictDoUpdate({ target: s.settings.key, set: { value: { at }, updatedAt: new Date() } });
}

/** Courses are looked up by the ID the external system uses. */
async function upsertCourse(item: ExternalItem, cache: Map<string, { id: number; qa: number; sessions: number }>, report: SyncReport) {
  const hit = cache.get(item.course_id);
  if (hit) return hit;

  const archived = item.course_is_archived || item.course_is_deleted;
  const [row] = await db
    .insert(s.courses)
    .values({
      externalId: item.course_id,
      name: item.course_name,
      code: item.course_code ?? null,
      batch: item.course_session ?? null,
      status: archived ? "archived" : "active",
    })
    .onConflictDoUpdate({
      target: s.courses.externalId,
      set: {
        name: item.course_name,
        code: item.course_code ?? null,
        batch: item.course_session ?? null,
        status: archived ? "archived" : "active",
        updatedAt: new Date(),
      },
    })
    .returning({ id: s.courses.id, qa: s.courses.defaultQaQuota, sessions: s.courses.defaultSessionQuota, created: sql<boolean>`(xmax = 0)` });

  if (row.created) report.coursesCreated++;
  const value = { id: row.id, qa: row.qa, sessions: row.sessions };
  cache.set(item.course_id, value);
  return value;
}

/**
 * Students are identified by their roll number, which becomes their username.
 * Their phone number becomes the first password, which they must change on first login.
 */
async function upsertStudent(item: ExternalItem, report: SyncReport) {
  const roll = item.roll.trim();
  const [existing] = await db.select().from(s.users).where(eq(s.users.username, roll)).limit(1);

  const meta = {
    branch: item.branch ?? null,
    guardianPhone: item.guardian_phone_number ?? null,
    externalRecordId: item.id,
  };

  if (!existing) {
    const phone = item.phone_number?.trim();
    if (!phone) report.noPhone.push(roll);
    // No phone on file? Set an unusable password; the admin resets it on request.
    const firstPassword = phone || crypto.randomBytes(18).toString("base64url");

    const [user] = await db.insert(s.users).values({
      role: "student",
      username: roll,
      name: item.name,
      phone: phone ?? null,
      passwordHash: await hashPassword(firstPassword),
      mustChangePassword: true,
      status: item.is_deleted ? "disabled" : "active",
      disabledBy: item.is_deleted ? "import" : null,
    }).returning();

    await db.insert(s.students).values({
      userId: user.id, rollNo: roll, batch: item.course_session ?? null,
      institution: item.branch ?? null, meta,
    }).onConflictDoNothing();

    report.studentsCreated++;
    return { id: user.id };
  }

  if (existing.role !== "student") {
    throw new Error(`Roll ${roll} clashes with an existing ${existing.role} account`);
  }
  if (existing.name !== item.name) report.nameConflicts.push(roll);

  // Never touch passwordHash here — students keep the password they chose.
  // Status is settled after the whole feed is read: one roll can have a deleted
  // record and a live one, and the order they arrive in must not decide it.
  await db.update(s.users).set({
    name: item.name,
    phone: item.phone_number ?? existing.phone,
    updatedAt: new Date(),
  }).where(eq(s.users.id, existing.id));

  await db.insert(s.students).values({
    userId: existing.id, rollNo: roll, batch: item.course_session ?? null,
    institution: item.branch ?? null, meta,
  }).onConflictDoUpdate({
    target: s.students.userId,
    set: { batch: item.course_session ?? null, institution: item.branch ?? null, meta, updatedAt: new Date() },
  });

  report.studentsUpdated++;
  return { id: existing.id };
}

export async function runStudentSync(opts: { trigger: "manual" | "schedule"; full?: boolean } = { trigger: "manual" }) {
  const started = Date.now();
  const lastSuccess = opts.full ? null : await getLastSuccess();
  const mode: "full" | "incremental" = lastSuccess ? "incremental" : "full";

  const [run] = await db.insert(s.syncRuns).values({ trigger: opts.trigger, status: "running" }).returning();

  const report: SyncReport = {
    runId: run.id, mode, status: "success", read: 0,
    studentsCreated: 0, studentsUpdated: 0, coursesCreated: 0,
    enrollmentsCreated: 0, enrollmentsDropped: 0, accountsDisabled: 0,
    noPhone: [], nameConflicts: [], bad: [], seconds: 0,
  };

  const courseCache = new Map<string, { id: number; qa: number; sessions: number }>();
  const studentIdByRoll = new Map<string, number>();
  const seenPairs = new Set<string>();
  const liveRolls = new Set<string>();
  const deleted: { studentId: number; courseId: number; roll: string; courseExternalId: string }[] = [];
  // The timestamp is taken before reading, so records changed mid-run are caught next time.
  const startedAtIso = new Date().toISOString();

  try {
    for await (const item of fetchStudents({ updatedSince: lastSuccess, bad: report.bad })) {
      report.read++;
      try {
        const course = await upsertCourse(item, courseCache, report);

        let studentId = studentIdByRoll.get(item.roll.trim());
        if (studentId === undefined) {
          const st = await upsertStudent(item, report);
          studentId = st.id;
          studentIdByRoll.set(item.roll.trim(), studentId);
        }

        if (item.is_deleted) {
          deleted.push({ studentId, courseId: course.id, roll: item.roll.trim(), courseExternalId: item.course_id });
          continue;
        }
        liveRolls.add(item.roll.trim());

        const [enr] = await db.insert(s.enrollments)
          .values({ studentId, courseId: course.id, status: "active" })
          .onConflictDoUpdate({
            target: [s.enrollments.studentId, s.enrollments.courseId],
            set: { status: "active" },
          })
          .returning({ created: sql<boolean>`(xmax = 0)` });

        if (enr?.created) {
          report.enrollmentsCreated++;
          // A new enrollment starts with the course's default allowances.
          await db.insert(s.quotas).values({
            studentId, courseId: course.id,
            qaRemaining: course.qa, sessionRemaining: course.sessions,
          }).onConflictDoNothing();
        }
        seenPairs.add(`${studentId}:${course.id}`);
      } catch (err) {
        report.bad.push({ index: report.read, roll: item.roll, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // A full run sees every current enrollment, so anything missing was removed upstream.
    // Only trust that if the read was essentially complete: a handful of unreadable
    // records is tolerable, a flood means something is wrong and we leave enrollments alone.
    if (mode === "full" && seenPairs.size > 0) {
      const tolerance = Math.max(5, Math.floor(report.read * 0.01));
      if (report.bad.length > tolerance) {
        report.dropCheckSkipped = `${report.bad.length} records could not be read, which is too many to safely decide that an enrollment has ended.`;
      } else {
        // Never end an enrollment for a student whose record we failed to read.
        const badRolls = report.bad.map((b) => b.roll).filter((r): r is string => Boolean(r));
        const protectedIds = new Set<number>();
        if (badRolls.length) {
          const rows = await db.select({ id: s.users.id }).from(s.users).where(inArray(s.users.username, badRolls));
          rows.forEach((r) => protectedIds.add(r.id));
        }

        // Only courses that came from BigBang; hand-made ones (like the demo course) aren't in the feed.
        const active = await db.select({ studentId: s.enrollments.studentId, courseId: s.enrollments.courseId })
          .from(s.enrollments).innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
          .where(and(eq(s.enrollments.status, "active"), sql`${s.courses.externalId} ~ '^[0-9a-f]{24}$'`));
        const stale = active.filter((e) => !seenPairs.has(`${e.studentId}:${e.courseId}`) && !protectedIds.has(e.studentId));
        for (const e of stale) {
          await db.update(s.enrollments).set({ status: "dropped" })
            .where(and(eq(s.enrollments.studentId, e.studentId), eq(s.enrollments.courseId, e.courseId)));
          report.enrollmentsDropped++;
        }
      }
    }

    await settleDeletions(deleted, seenPairs, liveRolls, mode, report);

    if (report.bad.length > 0) report.status = "partial";
    if (report.status !== "failed") await setLastSuccess(startedAtIso);
  } catch (err) {
    report.status = "failed";
    report.error = err instanceof Error ? err.message : String(err);
  }

  report.seconds = Math.round((Date.now() - started) / 100) / 10;

  await db.update(s.syncRuns).set({
    status: report.status,
    finishedAt: new Date(),
    created: report.studentsCreated + report.coursesCreated + report.enrollmentsCreated,
    updated: report.studentsUpdated,
    failed: report.bad.length,
    log: [report as unknown],
  }).where(eq(s.syncRuns.id, run.id));

  return report;
}

/**
 * A deleted record ends that one enrollment, unless the same roll still has a live
 * record in the course (BigBang keeps old duplicates). An account is disabled only
 * when nothing active is left, and re-enabled when a live record shows up again.
 */
async function settleDeletions(
  deleted: { studentId: number; courseId: number; roll: string; courseExternalId: string }[],
  seenPairs: Set<string>,
  liveRolls: Set<string>,
  mode: "full" | "incremental",
  report: SyncReport,
) {
  const rosters = new Map<string, Set<string>>();
  const candidates = new Set<number>();

  for (const d of deleted) {
    if (seenPairs.has(`${d.studentId}:${d.courseId}`)) continue;
    if (mode === "incremental") {
      // An incremental run only sees what changed, so ask whether a live record remains.
      let roster = rosters.get(d.courseExternalId);
      if (!roster) {
        roster = await fetchLiveRolls(d.courseExternalId);
        rosters.set(d.courseExternalId, roster);
      }
      if (roster.has(d.roll)) continue;
    }
    const ended = await db.update(s.enrollments).set({ status: "dropped" })
      .where(and(eq(s.enrollments.studentId, d.studentId), eq(s.enrollments.courseId, d.courseId), eq(s.enrollments.status, "active")))
      .returning({ id: s.enrollments.studentId });
    report.enrollmentsDropped += ended.length;
    if (!liveRolls.has(d.roll)) candidates.add(d.studentId);
  }

  for (const studentId of candidates) {
    const [stillActive] = await db.select({ id: s.enrollments.courseId }).from(s.enrollments)
      .where(and(eq(s.enrollments.studentId, studentId), eq(s.enrollments.status, "active"))).limit(1);
    if (stillActive) continue;
    const off = await db.update(s.users)
      .set({ status: "disabled", disabledBy: "import", tokenVersion: sql`${s.users.tokenVersion} + 1` })
      .where(and(eq(s.users.id, studentId), eq(s.users.status, "active")))
      .returning({ id: s.users.id });
    report.accountsDisabled += off.length;
  }

  // Accounts this import disabled come back when the student reappears. An admin's
  // decision to disable someone is left alone.
  const rolls = [...liveRolls];
  for (let i = 0; i < rolls.length; i += 1000) {
    await db.update(s.users).set({ status: "active", disabledBy: null })
      .where(and(
        inArray(s.users.username, rolls.slice(i, i + 1000)),
        eq(s.users.role, "student"),
        eq(s.users.status, "disabled"),
        sql`coalesce(${s.users.disabledBy}, 'import') = 'import'`,
      ));
  }
}

export { LAST_SUCCESS_KEY };
