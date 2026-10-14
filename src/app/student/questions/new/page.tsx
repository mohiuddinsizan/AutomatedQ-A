import { requirePortal } from "@/lib/dal";
import { studentCourses } from "@/lib/results";
import { subjectsForCourse } from "@/lib/qa";
import { getSetting } from "@/lib/settings";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Card, EmptyState } from "@/components/ui";
import { AskForm } from "@/components/AskForm";

export const metadata = { title: "Ask a question" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requirePortal("student");
  const courses = (await studentCourses(user.id)).filter((c) => c.active);
  const back = <BackLink href="/student/questions">My Q&amp;A</BackLink>;

  if (courses.length === 0) {
    return <>{back}<div className="mt-3"><PageTitle>Ask a question</PageTitle></div>
      <EmptyState title="No active course">You can ask questions while you&apos;re enrolled in an active course.</EmptyState></>;
  }

  const wanted = Number((await searchParams).course);
  const defaultCourse = courses.find((c) => c.id === wanted)?.id ?? courses[0].id;
  const subjects = Object.fromEntries(await Promise.all(courses.map(async (c) => [c.id, await subjectsForCourse(c.id)] as const)));
  const consumeOn = await getSetting("qa.consume_on");

  return (
    <>
      {back}
      <div className="mt-3">
        <PageTitle sub="Ask about anything you're studying — in Bangla or English.">Ask a question</PageTitle>
      </div>

      <ol className="mb-6 grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
        {[
          { n: 1, t: "Ask", d: "Type, photo or voice" },
          { n: 2, t: "Get an answer", d: "In seconds" },
          { n: 3, t: "Need more?", d: "A teacher steps in" },
        ].map((x) => (
          <li key={x.n} className="rounded-xl border border-rule bg-sheet px-2 py-3">
            <span className={`mx-auto grid size-7 place-items-center rounded-full text-sm font-bold text-white ${x.n === 1 ? "bg-pen" : x.n === 2 ? "bg-brand-orange" : "bg-brand-red"}`}>{x.n}</span>
            <span className="mt-1.5 block font-semibold text-ink">{x.t}</span>
            <span className="block text-ink-faint">{x.d}</span>
          </li>
        ))}
      </ol>

      <Card className="p-4 sm:p-6">
        <AskForm
          courses={courses.map((c) => ({ id: c.id, name: c.name, qa: c.qa ?? 0 }))}
          subjects={subjects}
          defaultCourse={defaultCourse}
          needsQuota={consumeOn === "submit"}
          chargeNote={consumeOn === "submit"
            ? "Uses one question from your allowance. Messages that aren't study questions are turned away free."
            : "AI answers are free. Sending it on to a teacher uses one question."}
        />
      </Card>
    </>
  );
}
