/**
 * SEED — creates the first super admin, plus optional demo data.
 *
 *   npm run db:seed            -> super admin only (safe for production)
 *   npm run db:seed -- --demo  -> also a demo admin, teacher, students, course and results
 *
 * Safe to run more than once. Real accounts are left alone; demo accounts get their
 * known passwords back each time.
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";

const s = schema;

async function upsertUser(v: {
  role: "student" | "teacher" | "admin" | "super_admin";
  username: string; name: string; password: string; phone?: string; mustChangePassword?: boolean;
}) {
  const [existing] = await db.select().from(s.users).where(eq(s.users.username, v.username)).limit(1);
  if (existing) {
    console.log(`  exists   ${v.role.padEnd(11)} ${v.username}`);
    return existing;
  }
  const [row] = await db.insert(s.users).values({
    role: v.role, username: v.username, name: v.name, phone: v.phone,
    passwordHash: await hashPassword(v.password),
    mustChangePassword: v.mustChangePassword ?? false,
  }).returning();
  console.log(`  created  ${v.role.padEnd(11)} ${v.username}`);
  return row;
}

async function subject(name: string) {
  await db.insert(s.subjects).values({ name }).onConflictDoNothing();
  const [row] = await db.select().from(s.subjects).where(eq(s.subjects.name, name));
  return row;
}

async function main() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
  if (ADMIN_PASSWORD.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  console.log("Super admin:");
  await upsertUser({ role: "super_admin", username: ADMIN_USERNAME, name: ADMIN_NAME ?? "Super Admin", password: ADMIN_PASSWORD });

  const defaults: Record<string, unknown> = {
    "qa.consume_on": "submit", // "submit" or "escalate"
    "mentor.reply_template": "Knock the mentor on this number on WhatsApp for the class link.",
    "ai.provider": "gemini",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
  }

  // Subjects students file questions under. Admins can add more in Settings.
  for (const name of [
    "Bangla", "English", "General Math", "Higher Math", "Physics", "Chemistry", "Biology", "ICT",
    "Bangladesh & Global Studies", "Religion", "Agriculture", "Accounting", "Finance & Banking",
    "Business Entrepreneurship", "General Knowledge", "General",
  ]) await subject(name);

  if (!process.argv.includes("--demo")) return;
  await seedDemo();
}

/* ---------- Demo data (never run this against real students) ---------- */

/** Demo accounts get known passwords, reset on every --demo run so they always work. */
async function demoUser(v: {
  role: "student" | "teacher" | "admin";
  username: string; name: string; password: string; phone?: string; mustChangePassword?: boolean;
}) {
  const [existing] = await db.select().from(s.users).where(eq(s.users.username, v.username)).limit(1);
  if (existing && existing.role !== v.role) throw new Error(`${v.username} already exists as a ${existing.role}`);
  const values = {
    role: v.role, name: v.name, phone: v.phone ?? null,
    passwordHash: await hashPassword(v.password),
    mustChangePassword: v.mustChangePassword ?? false,
    status: "active" as const, disabledBy: null,
  };
  if (existing) {
    // Bumping tokenVersion signs out old demo sessions that used the previous password.
    const [row] = await db.update(s.users).set({ ...values, tokenVersion: existing.tokenVersion + 1 })
      .where(eq(s.users.id, existing.id)).returning();
    console.log(`  reset    ${v.role.padEnd(11)} ${v.username}`);
    return row;
  }
  const [row] = await db.insert(s.users).values({ ...values, username: v.username }).returning();
  console.log(`  created  ${v.role.padEnd(11)} ${v.username}`);
  return row;
}

// Rolls starting with 24 are not used by BigBang, so these can't collide with real students.
const DEMO_STUDENTS = [
  { roll: "240101", name: "Demo Student", phone: "01711000001", password: "student123" },
  { roll: "240102", name: "Nusrat Jahan (first login)", phone: "01711000002", password: "01711000002", mustChangePassword: true },
  { roll: "240103", name: "Arif Hossain", phone: "01711000003", password: "student123" },
  { roll: "240104", name: "Sadia Islam", phone: "01711000004", password: "student123" },
  { roll: "240105", name: "Tanvir Ahmed", phone: "01711000005", password: "student123" },
  { roll: "240106", name: "Mim Akter", phone: "01711000006", password: "student123" },
];

async function seedDemo() {
  console.log("Demo accounts:");
  await demoUser({ role: "admin", username: "demo.admin", name: "Demo Admin", password: "admin12345" });

  const teacher = await demoUser({ role: "teacher", username: "demo.teacher", name: "Demo Teacher", password: "teacher123" });
  await db.insert(s.teachers).values({ userId: teacher.id }).onConflictDoNothing();

  await db.insert(s.courses).values({ externalId: "DEMO-HSC26", name: "HSC 2026 Science", batch: "Batch A", code: "HSC26-A" })
    .onConflictDoNothing();
  const [course] = await db.select().from(s.courses).where(eq(s.courses.externalId, "DEMO-HSC26"));
  await db.update(s.courses).set({ status: "active", leaderboardPublished: true }).where(eq(s.courses.id, course.id));

  const subjects = await Promise.all(["Physics", "Chemistry", "Higher Math", "Biology"].map(subject));
  await db.insert(s.courseSubjects).values(subjects.map((x) => ({ courseId: course.id, subjectId: x.id }))).onConflictDoNothing();

  // The teacher answers every subject of the demo course.
  await db.delete(s.teacherSubjects).where(eq(s.teacherSubjects.teacherId, teacher.id));
  await db.insert(s.teacherCourses).values({ teacherId: teacher.id, courseId: course.id }).onConflictDoNothing();

  const students = [];
  for (const d of DEMO_STUDENTS) {
    const u = await demoUser({ role: "student", username: d.roll, name: d.name, phone: d.phone, password: d.password, mustChangePassword: d.mustChangePassword });
    await db.insert(s.students).values({ userId: u.id, rollNo: d.roll, batch: "Batch A", institution: "Demo Branch" })
      .onConflictDoUpdate({ target: s.students.userId, set: { institution: "Demo Branch" } });
    await db.insert(s.enrollments).values({ studentId: u.id, courseId: course.id, status: "active" })
      .onConflictDoUpdate({ target: [s.enrollments.studentId, s.enrollments.courseId], set: { status: "active" } });
    await db.insert(s.quotas).values({ studentId: u.id, courseId: course.id, qaRemaining: course.defaultQaQuota, sessionRemaining: course.defaultSessionQuota })
      .onConflictDoUpdate({ target: [s.quotas.studentId, s.quotas.courseId], set: { qaRemaining: course.defaultQaQuota, sessionRemaining: course.defaultSessionQuota } });
    students.push(u);
  }

  // Six exams with results, so the results page, chart and leaderboard have something to show.
  console.log("Demo exams and results:");
  const titles = ["Physics Exam-1", "Chemistry Exam-1", "Higher Math Exam-1", "Physics Exam-2", "Biology Exam-1", "Chemistry Exam-2"];
  for (const [i, title] of titles.entries()) {
    const examDate = new Date(Date.UTC(2026, 7, 3 + i * 7, 4));
    const [exam] = await db.insert(s.exams).values({
      courseId: course.id, externalId: `DEMO-EX${i + 1}`, title, examDate,
      fullMcqMark: 25, fullWrittenMark: 25, totalMarks: 50,
    }).onConflictDoUpdate({
      target: [s.exams.courseId, s.exams.externalId],
      set: { title, examDate, fullMcqMark: 25, fullWrittenMark: 25, totalMarks: 50, published: true, removedUpstream: false },
    }).returning();

    for (const [j, u] of students.entries()) {
      if (j === 0 && i === 2) continue; // the main demo student missed one exam
      const correct = 12 + ((i * 7 + j * 5) % 13);
      const incorrect = Math.min(25 - correct, 2 + ((i + j) % 4));
      const mcq = correct - incorrect * 0.25;
      const written = 10 + ((i * 3 + j * 4) % 14);
      await db.insert(s.results).values({
        examId: exam.id, studentId: u.id, marks: mcq + written, mcqMark: mcq, writtenMark: written,
        satMcq: true, satWritten: true, correct, incorrect, skipped: 25 - correct - incorrect, questions: 25,
      }).onConflictDoUpdate({
        target: [s.results.examId, s.results.studentId],
        set: { marks: mcq + written, mcqMark: mcq, writtenMark: written, correct, incorrect, skipped: 25 - correct - incorrect, withdrawn: false },
      });
    }
  }
  // Same ranking rule as the real results import (src/lib/external/results-sync.ts).
  await db.execute(sql`
    update results r set rank = x.rnk, percentile = x.pct
    from (
      select r2.id, rank() over (partition by r2.exam_id order by r2.marks desc) as rnk,
             round((100 * cume_dist() over (partition by r2.exam_id order by r2.marks asc))::numeric, 2) as pct
      from results r2 join exams e on e.id = r2.exam_id
      where e.course_id = ${course.id} and not r2.withdrawn and r2.marks is not null
    ) x where r.id = x.id`);
  console.log(`  ${titles.length} exams for ${students.length} students in "${course.name}"`);

  console.log(`
Demo sign-ins (passwords are reset on every --demo run):
  Super admin  /admin/login    ${process.env.ADMIN_USERNAME} / (ADMIN_PASSWORD from .env)
  Admin        /admin/login    demo.admin / admin12345
  Teacher      /teacher/login  demo.teacher / teacher123
  Student      /login          240101 / student123
  Student      /login          240102 / 01711000002   (first login: must choose a new password)
`);
}

main()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
