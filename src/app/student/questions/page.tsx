import Link from "next/link";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import type { QaStatus } from "@/lib/qa";
import { fmtAgo } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { StatusBadge } from "@/components/ThreadView";
import { Tabs } from "@/components/Tabs";
import { Icon } from "@/components/icons";

export const metadata = { title: "My Q&A" };

const FILTERS: { key: string; label: string; statuses: QaStatus[] }[] = [
  { key: "you", label: "Needs you", statuses: ["draft", "awaiting_ai", "ai_answered", "answered"] },
  { key: "teacher", label: "With a teacher", statuses: ["escalated", "teacher_claimed"] },
  { key: "solved", label: "Solved", statuses: ["resolved", "closed_timeout"] },
];

/** What the student should do next, in plain words. */
const NEXT: Partial<Record<QaStatus, string>> = {
  draft: "Check the question and confirm it",
  awaiting_ai: "The answer didn't arrive — tap to try again",
  ai_answered: "Answer ready — rate it",
  answered: "Teacher replied — rate the reply",
  escalated: "Waiting for a teacher",
  teacher_claimed: "A teacher is writing your answer",
};

export default async function MyQuestions({ searchParams }: { searchParams: Promise<{ show?: string; course?: string }> }) {
  const user = await requirePortal("student");
  const s = schema;
  const sp = await searchParams;

  // Courses the student has asked in, for the course filter.
  const courses = await db.select({ id: s.courses.id, name: s.courses.name, n: count() })
    .from(s.qaThreads).innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .where(and(eq(s.qaThreads.studentId, user.id), sql`${s.qaThreads.status} <> 'draft'`))
    .groupBy(s.courses.id, s.courses.name).orderBy(s.courses.name);
  const courseId = courses.find((c) => c.id === Number(sp.course))?.id ?? null;
  const mine = and(eq(s.qaThreads.studentId, user.id), courseId ? eq(s.qaThreads.courseId, courseId) : undefined)!;
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(courseId ? { course: String(courseId) } : {}), ...extra })}`;

  const counts = await Promise.all(FILTERS.map(async (f) =>
    (await db.select({ n: count() }).from(s.qaThreads).where(and(mine, inArray(s.qaThreads.status, f.statuses))))[0].n));
  const wanted = sp.show;
  // Open on whatever needs attention.
  const filter = FILTERS.find((f) => f.key === wanted) ?? FILTERS[counts[0] ? 0 : counts[1] ? 1 : 2];
  const total = counts.reduce((a, b) => a + b, 0);

  const threads = await db.select({
    id: s.qaThreads.id, question: s.qaThreads.question, status: s.qaThreads.status, updatedAt: s.qaThreads.updatedAt,
    course: s.courses.name, subject: s.subjects.name, aiVerdict: s.qaThreads.aiVerdict,
  }).from(s.qaThreads)
    .innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.qaThreads.subjectId))
    .where(and(mine, inArray(s.qaThreads.status, filter.statuses)))
    .orderBy(desc(s.qaThreads.updatedAt)).limit(100);

  return (
    <>
      <PageTitle sub="Every question you've asked and its answers."
        action={<LinkButton href="/student/questions/new"><Icon name="plus" /> Ask a question</LinkButton>}>
        My Q&amp;A
      </PageTitle>
      {total === 0 ? (
        <EmptyState title="No questions yet" action={<LinkButton href="/student/questions/new">Ask your first question</LinkButton>}>
          Stuck on a problem? Type it, snap a photo of it, or record a voice note. You&apos;ll get an answer in seconds.
        </EmptyState>
      ) : (
        <>
          {courses.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-soft">Course:</span>
              {[{ id: 0, name: "All courses" }, ...courses].map((c) => {
                const active = (c.id || null) === courseId;
                const href = c.id ? `?${new URLSearchParams({ course: String(c.id), show: filter.key })}` : `?show=${filter.key}`;
                return (
                  <Link key={c.id} href={href} aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-ink text-white" : "bg-sheet text-ink-soft ring-1 ring-rule hover:text-pen"}`}>
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}
          <Tabs label="Filter questions" items={FILTERS.map((f, i) => ({
            href: q({ show: f.key }), label: f.label, count: counts[i], active: f.key === filter.key, urgent: i === 0,
          }))} />
          {threads.length === 0 ? (
            <EmptyState title={filter.key === "you" ? "Nothing needs you right now" : filter.key === "teacher" ? "No questions with a teacher" : "Nothing solved yet"} />
          ) : (
            <Card as="div" className="divide-y divide-rule overflow-hidden">
              {threads.map((t) => (
                <Link key={t.id} href={`/student/questions/${t.id}`} className="group block p-4 hover:bg-paper sm:px-5">
                  <p className="line-clamp-2 text-ink group-hover:text-pen">{t.question ?? "Photo / voice question"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="blue">{t.subject}</Badge>
                    {t.status === "draft" && t.aiVerdict
                      ? <span className="font-medium text-warn">The AI couldn&apos;t read it — send it to a teacher</span>
                      : NEXT[t.status] ? <span className={filter.key === "you" ? "font-medium text-pen" : "text-ink-soft"}>{NEXT[t.status]}</span> : <StatusBadge status={t.status} />}
                    <span className="text-ink-faint">· {fmtAgo(t.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
