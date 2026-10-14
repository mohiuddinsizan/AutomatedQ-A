import Link from "next/link";
import { and, avg, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { teacherScope, courseQueues } from "@/lib/qa";
import { inArray, asc } from "drizzle-orm";
import { PageTitle } from "@/components/PortalHeader";
import { Card, EmptyState, SectionTitle, StatGrid, Stars, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CourseQueueCard } from "@/components/QuestionList";

export const metadata = { title: "Q&A" };

export default async function TeacherHome() {
  const user = await requirePortal("teacher");
  const scope = await teacherScope(user.id);

  if (!scope.courseIds.length) {
    return (<><PageTitle>Q&amp;A</PageTitle>
      <EmptyState title="No courses assigned yet">Ask the admin office to assign you to the courses you teach. Questions from those courses will appear here.</EmptyState></>);
  }

  const [queues, [mine], assigned] = await Promise.all([
    courseQueues({ scope, teacherId: user.id }),
    db.select({ replies: count(), rating: avg(schema.qaMessages.rating), rated: count(schema.qaMessages.rating) })
      .from(schema.qaMessages)
      .where(and(eq(schema.qaMessages.senderId, user.id), eq(schema.qaMessages.senderType, "teacher"))),
    db.select({ id: schema.courses.id, name: schema.courses.name, batch: schema.courses.batch })
      .from(schema.courses).where(inArray(schema.courses.id, scope.courseIds)).orderBy(asc(schema.courses.name)),
  ]);
  const totals = new Map(queues.map((q) => [q.courseId, q]));
  // Only courses that need something from this teacher.
  const pending = queues.filter((q) => q.waiting > 0 || q.inProgress > 0);
  const waiting = pending.reduce((n, q) => n + q.waiting, 0);
  const inProgress = pending.reduce((n, q) => n + q.inProgress, 0);

  return (
    <>
      <PageTitle sub="Questions students sent on after reading the AI answer."
        action={<LinkButton href="/teacher/answered" variant="secondary" size="sm">Your answered questions</LinkButton>}>
        Hello, {user.name.split(" ")[0]}
      </PageTitle>

      <StatGrid cols={4} items={[
        { label: "Waiting for a teacher", value: waiting },
        { label: "In progress (yours)", value: inProgress },
        { label: "Replies you've sent", value: mine.replies },
        { label: "Your average rating", value: mine.rating ? <Stars value={Number(mine.rating)} size="md" /> : "—", sub: mine.rated ? `${mine.rated} ratings` : undefined },
      ]} />

      <SectionTitle>Courses with pending questions</SectionTitle>
      {pending.length === 0 ? (
        <EmptyState title="All caught up">
          No questions are waiting in your courses. New ones appear here when a student asks for a teacher.
          {" "}<Link href="/teacher/answered" className="text-pen hover:underline underline-offset-4">See what you&apos;ve answered</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map((q) => (
            <CourseQueueCard key={q.courseId} href={`/teacher/courses/${q.courseId}`} name={q.name} batch={q.batch}
              waiting={q.waiting} inProgress={q.inProgress} oldestWaiting={q.oldestWaiting} />
          ))}
        </div>
      )}

      <SectionTitle>Q&amp;A history by course</SectionTitle>
      <Card className="divide-y divide-rule overflow-hidden">
        {assigned.map((c) => {
          const q = totals.get(c.id);
          return (
            <Link key={c.id} href={`/teacher/courses/${c.id}?tab=history`}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-gradient-to-r hover:from-pen-soft hover:to-transparent">
              <span className="chip-navy grid size-10 shrink-0 place-items-center rounded-xl"><Icon name="book" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{c.name}</span>
                <span className="text-sm text-ink-soft">
                  {q ? <>{q.total} question{q.total === 1 ? "" : "s"} · {q.solved} solved{q.waiting ? <> · <span className="font-semibold text-warn">{q.waiting} waiting</span></> : null}</> : "No questions yet"}
                </span>
              </span>
              <span className="text-pen" aria-hidden>→</span>
            </Link>
          );
        })}
      </Card>
    </>
  );
}
