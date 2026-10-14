import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { studentCourses } from "@/lib/results";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Results" };

export default async function ResultsIndex() {
  const user = await requirePortal("student");
  const courses = (await studentCourses(user.id)).filter((c) => c.active || c.examsSat > 0);
  if (courses.length === 1) redirect(`/student/courses/${courses[0].id}/results`);

  return (
    <>
      <PageTitle sub="Choose a course to see your marks, rank and progress.">Results</PageTitle>
      {courses.length === 0 ? (
        <EmptyState title="No results yet">Your exam results appear here after they&apos;re published.</EmptyState>
      ) : (
        <Card className="divide-y divide-rule">
          {courses.map((c) => (
            <Link key={c.id} href={`/student/courses/${c.id}/results`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{c.name}</span>
                <span className="text-sm text-ink-soft">{c.examsSat} exam{c.examsSat === 1 ? "" : "s"} taken</span>
              </span>
              {c.active ? <Badge tone="green">Active</Badge> : <Badge>Past</Badge>}
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
