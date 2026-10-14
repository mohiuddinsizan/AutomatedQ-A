import Link from "next/link";
import { asc, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { Tabs } from "@/components/Tabs";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Mentor sessions" };
const TABS = ["pending", "scheduled", "completed", "cancelled"] as const;

export default async function AdminMentor({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const wanted = (await searchParams).status;
  const status = TABS.find((t) => t === wanted) ?? "pending";

  const [counts, rows] = await Promise.all([
    Promise.all(TABS.map(async (t) => (await db.select({ n: count() }).from(s.mentorSessions).where(eq(s.mentorSessions.status, t)))[0].n)),
    db.select({
      id: s.mentorSessions.id, topic: s.mentorSessions.topic, createdAt: s.mentorSessions.createdAt,
      scheduledAt: s.mentorSessions.scheduledAt, preferredTime: s.mentorSessions.preferredTime, mentorName: s.mentorSessions.mentorName,
      student: s.users.name, roll: s.users.username, course: s.courses.name, subject: s.subjects.name,
    }).from(s.mentorSessions)
      .innerJoin(s.users, eq(s.users.id, s.mentorSessions.studentId))
      .innerJoin(s.courses, eq(s.courses.id, s.mentorSessions.courseId))
      .innerJoin(s.subjects, eq(s.subjects.id, s.mentorSessions.subjectId))
      .where(eq(s.mentorSessions.status, status))
      .orderBy(status === "pending" ? asc(s.mentorSessions.createdAt) : status === "scheduled" ? asc(s.mentorSessions.scheduledAt) : desc(s.mentorSessions.updatedAt))
      .limit(100),
  ]);

  return (
    <>
      <PageTitle sub="Schedule requests with a mentor; the student sees the time and the mentor's number.">Mentor sessions</PageTitle>
      <Tabs label="Filter" items={TABS.map((t, i) => ({ href: `?status=${t}`, label: t[0].toUpperCase() + t.slice(1), count: counts[i], active: status === t, urgent: t === "pending" }))} />
      {rows.length === 0 ? <EmptyState title={`No ${status} requests`} /> : (
        <Card className="divide-y divide-rule">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/mentor/${r.id}`} className="flex flex-col gap-1 p-4 hover:bg-paper sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{r.topic}</span>
                <span className="block text-sm text-ink-faint">{r.student} ({r.roll}) · {r.subject} · {r.course}</span>
              </span>
              <span className="shrink-0 text-sm text-ink-soft">
                {status === "scheduled" ? <>{fmtDateTime(r.scheduledAt)} · {r.mentorName}</>
                  : status === "pending" ? <>{r.preferredTime && <Badge>{r.preferredTime}</Badge>} {fmtAgo(r.createdAt)}</>
                  : fmtAgo(r.createdAt)}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
