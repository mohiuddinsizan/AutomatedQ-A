import Link from "next/link";
import { and, avg, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { Card, SectionTitle, StatGrid, Stars, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requirePortal("admin");
  const s = schema;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

  const [students, teachers, courses, asked, waiting, pending, aiRating, teacherRating, solvedByAi, aiAnswered, runs] = await Promise.all([
    n(db.select({ n: count() }).from(s.users).where(and(eq(s.users.role, "student"), eq(s.users.status, "active")))),
    n(db.select({ n: count() }).from(s.users).where(and(eq(s.users.role, "teacher"), eq(s.users.status, "active")))),
    n(db.select({ n: count() }).from(s.courses).where(eq(s.courses.status, "active"))),
    n(db.select({ n: count() }).from(s.qaThreads).where(sql`${s.qaThreads.createdAt} > now() - interval '7 days'`)),
    n(db.select({ n: count() }).from(s.qaThreads).where(eq(s.qaThreads.status, "escalated"))),
    n(db.select({ n: count() }).from(s.mentorSessions).where(eq(s.mentorSessions.status, "pending"))),
    db.select({ v: avg(s.qaMessages.rating), c: count(s.qaMessages.rating) }).from(s.qaMessages).where(eq(s.qaMessages.senderType, "ai")),
    db.select({ v: avg(s.qaMessages.rating), c: count(s.qaMessages.rating) }).from(s.qaMessages).where(inArray(s.qaMessages.senderType, ["teacher", "admin"])),
    // Settled without a teacher: the AI answer was enough.
    n(db.select({ n: count() }).from(s.qaThreads).where(and(eq(s.qaThreads.status, "resolved"), isNull(s.qaThreads.escalatedAt)))),
    n(db.select({ n: count() }).from(s.qaMessages).where(eq(s.qaMessages.senderType, "ai"))),
    db.select().from(s.syncRuns).orderBy(desc(s.syncRuns.startedAt)).limit(6),
  ]);

  const lastStudents = runs.find((r) => r.kind === "students");
  const lastResults = runs.find((r) => r.kind === "results");

  return (
    <>
      <PageTitle>Overview</PageTitle>
      <StatGrid cols={3} items={[
        { label: "Active students", value: students.toLocaleString() },
        { label: "Active teachers", value: teachers },
        { label: "Active courses", value: courses },
      ]} />

      <SectionTitle>Needs attention</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/questions" className="group">
          <Card className="card-hover flex items-center gap-4 p-5">
            <span className="chip-orange grid size-12 shrink-0 place-items-center rounded-2xl"><Icon name="chat" className="size-6" /></span>
            <span className="flex-1"><span className="block font-display text-3xl text-ink">{waiting}</span><span className="text-sm text-ink-soft">Questions waiting for a teacher</span></span>
            <span className="text-pen" aria-hidden>→</span>
          </Card>
        </Link>
        <Link href="/admin/mentor" className="group">
          <Card className="card-hover flex items-center gap-4 p-5">
            <span className="chip-red grid size-12 shrink-0 place-items-center rounded-2xl"><Icon name="calendar" className="size-6" /></span>
            <span className="flex-1"><span className="block font-display text-3xl text-ink">{pending}</span><span className="text-sm text-ink-soft">Mentor requests to schedule</span></span>
            <span className="text-pen" aria-hidden>→</span>
          </Card>
        </Link>
      </div>

      <SectionTitle>Q&amp;A quality</SectionTitle>
      <StatGrid cols={4} items={[
        { label: "Questions this week", value: asked },
        { label: "Solved by AI alone", value: aiAnswered ? `${Math.round((solvedByAi / aiAnswered) * 100)}%` : "—", sub: `${solvedByAi} of ${aiAnswered} AI answers` },
        { label: "AI answer rating", value: aiRating[0].v ? <Stars value={Number(aiRating[0].v)} size="md" /> : "—", sub: `${aiRating[0].c} ratings` },
        { label: "Teacher reply rating", value: teacherRating[0].v ? <Stars value={Number(teacherRating[0].v)} size="md" /> : "—", sub: `${teacherRating[0].c} ratings` },
      ]} />

      <SectionTitle action={<Link href="/admin/sync" className="text-sm text-pen hover:underline underline-offset-4">Import page →</Link>}>Data from BigBang</SectionTitle>
      <Card className="divide-y divide-rule text-sm">
        {[["Students & enrollments", lastStudents], ["Results", lastResults]].map(([label, r]) => {
          const run = r as typeof lastStudents;
          return (
            <div key={label as string} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="text-ink">{label as string}</span>
              <span className="flex items-center gap-2 text-ink-soft">
                {run ? <>{fmtDateTime(run.startedAt)} <Badge tone={run.status === "success" ? "green" : run.status === "failed" ? "red" : "amber"}>{run.status}</Badge></> : "Never imported"}
              </span>
            </div>
          );
        })}
      </Card>
    </>
  );
}
