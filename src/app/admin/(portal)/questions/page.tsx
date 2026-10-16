import { courseQueues } from "@/lib/qa";
import { requirePortal } from "@/lib/dal";
import { PageTitle } from "@/components/PortalHeader";
import { EmptyState, SectionTitle, StatGrid } from "@/components/ui";
import { CourseQueueCard } from "@/components/QuestionList";
import { Tabs } from "@/components/Tabs";

export const metadata = { title: "Q&A" };

export default async function AdminQuestions() {
  await requirePortal("admin");
  const queues = await courseQueues();
  const sum = (k: "waiting" | "inProgress" | "replied" | "total") => queues.reduce((n, q) => n + q[k], 0);
  const pending = queues.filter((q) => q.waiting + q.inProgress > 0);
  const quiet = queues.filter((q) => q.waiting + q.inProgress === 0);

  return (
    <>
      <PageTitle sub="Questions grouped by course. Courses with questions waiting for a teacher come first.">Q&amp;A</PageTitle>
      <Tabs label="View" items={[
        { href: "/admin/questions", label: "By course", active: true },
        { href: "/admin/questions/all", label: "All questions", count: sum("total"), active: false },
      ]} />
      <StatGrid cols={4} items={[
        { label: "Waiting for a teacher", value: sum("waiting") },
        { label: "Taken by a teacher", value: sum("inProgress") },
        { label: "Teacher replied", value: sum("replied") },
        { label: "All questions", value: sum("total") },
      ]} />

      {queues.length === 0 ? (
        <div className="mt-8"><EmptyState title="No questions yet">Questions appear here once students start asking.</EmptyState></div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <SectionTitle>Needs a teacher</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pending.map((q) => (
                  <CourseQueueCard key={q.courseId} href={`/admin/questions/course/${q.courseId}`} name={q.name} batch={q.batch}
                    waiting={q.waiting} inProgress={q.inProgress} total={q.total} oldestWaiting={q.oldestWaiting} />
                ))}
              </div>
            </>
          )}
          {quiet.length > 0 && (
            <>
              <SectionTitle>Other courses with questions</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {quiet.map((q) => (
                  <CourseQueueCard key={q.courseId} href={`/admin/questions/course/${q.courseId}`} name={q.name} batch={q.batch}
                    waiting={q.waiting} inProgress={q.inProgress} total={q.total} oldestWaiting={q.oldestWaiting} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
