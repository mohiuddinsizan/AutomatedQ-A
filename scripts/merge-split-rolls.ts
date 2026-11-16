/**
 * One-off fix: a few students exist twice because BigBang wrote their roll with and
 * without leading zeros ("476" and "000476"). This moves everything from the short-roll
 * account onto the 6-digit one, keeps the password the student chose, and disables
 * (never deletes) the leftover. Accounts with only the short form are simply renamed.
 *
 *   npx tsx --env-file=.env scripts/merge-split-rolls.ts          (dry run: report only)
 *   npx tsx --env-file=.env scripts/merge-split-rolls.ts --apply  (do it)
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { canonicalRoll } from "../src/lib/roll";

const s = schema;
const apply = process.argv.includes("--apply");
const norm = (n: string | null) => (n ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const tail = (p: string | null) => (p ?? "").replace(/\D/g, "").slice(-10);

async function main() {
  const short = await db.select().from(s.users)
    .where(and(eq(s.users.role, "student"), sql`${s.users.username} ~ '^[0-9]{1,5}$'`));
  console.log(`${short.length} student account(s) with a short roll. ${apply ? "APPLYING" : "Dry run (add --apply to change anything)"}`);

  for (const a of short) {
    const roll = canonicalRoll(a.username);
    const [c] = await db.select().from(s.users).where(eq(s.users.username, roll)).limit(1);

    if (!c) {
      console.log(`  ${a.username} → renamed to ${roll}`);
      if (apply) {
        await db.transaction(async (tx) => {
          await tx.update(s.users).set({ username: roll }).where(eq(s.users.id, a.id));
          await tx.update(s.students).set({ rollNo: roll }).where(eq(s.students.userId, a.id));
        });
      }
      continue;
    }

    if (c.role !== "student" || (norm(a.name) !== norm(c.name) && !(tail(a.phone) && tail(a.phone) === tail(c.phone)))) {
      console.log(`  ${a.username} ≠ ${roll}: different people (${a.name} / ${c.name}) — left alone`);
      continue;
    }

    // The password the student actually chose is the one to keep.
    const keepShortPassword = !a.mustChangePassword &&
      (c.mustChangePassword || (a.lastLoginAt?.getTime() ?? 0) > (c.lastLoginAt?.getTime() ?? 0));
    console.log(`  ${a.username} → merged into ${roll} (${c.name})${keepShortPassword ? ", keeping the password set on " + a.username : ""}`);
    if (!apply) continue;

    await db.transaction(async (tx) => {
      // Courses: copy across; a course active on either account stays active.
      await tx.execute(sql`
        insert into enrollments (student_id, course_id, status, enrolled_at)
        select ${c.id}, course_id, status, enrolled_at from enrollments where student_id = ${a.id}
        on conflict (student_id, course_id) do update
          set status = case when enrollments.status = 'active' or excluded.status = 'active' then 'active'::enrollment_status else enrollments.status end`);
      await tx.execute(sql`
        insert into quotas (student_id, course_id, qa_remaining, session_remaining, updated_by)
        select ${c.id}, course_id, qa_remaining, session_remaining, updated_by from quotas where student_id = ${a.id}
        on conflict do nothing`);
      await tx.execute(sql`
        update results r set student_id = ${c.id} where r.student_id = ${a.id}
          and not exists (select 1 from results x where x.student_id = ${c.id} and x.exam_id = r.exam_id)`);
      await tx.update(s.qaThreads).set({ studentId: c.id }).where(eq(s.qaThreads.studentId, a.id));
      await tx.update(s.mentorSessions).set({ studentId: c.id }).where(eq(s.mentorSessions.studentId, a.id));
      await tx.update(s.notifications).set({ userId: c.id }).where(eq(s.notifications.userId, a.id));

      if (keepShortPassword) {
        await tx.update(s.users).set({ passwordHash: a.passwordHash, mustChangePassword: false, lastLoginAt: a.lastLoginAt })
          .where(eq(s.users.id, c.id));
      }
      // The leftover stays on record, switched off and signed out; the import won't revive it.
      await tx.update(s.enrollments).set({ status: "dropped" }).where(eq(s.enrollments.studentId, a.id));
      await tx.update(s.users).set({ status: "disabled", disabledBy: "merged", tokenVersion: a.tokenVersion + 1 })
        .where(eq(s.users.id, a.id));
      await tx.insert(s.auditLogs).values({
        action: "student.merge_roll", entity: "user", entityId: String(c.id),
        after: { from: a.username, fromId: a.id, into: roll, keptPassword: keepShortPassword ? a.username : roll },
      });
    });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
