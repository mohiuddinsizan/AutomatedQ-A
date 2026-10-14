import { notFound } from "next/navigation";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { teacherScope, scopeWhere, questionRows } from "@/lib/qa";
import { Tabs } from "@/components/Tabs";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, EmptyState } from "@/components/ui";
import { QuestionList } from "@/components/QuestionList";

const TABS = [
  { key: "waiting", label: "Waiting" },
  { key: "mine", label: "In progress" },
  { key: "done", label: "Answered by you" },
  { key: "history", label: "All Q&A" },
] as const;

export default async function TeacherCourse({
  params, searchParams,
}: { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePortal("teacher");
  const courseId = Number((await params).courseId);
  const scope = await teacherScope(user.id);
  // A course outside the teacher's assignments doesn't exist for them.
  if (!scope.courseIds.includes(courseId)) notFound();
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
  if (!course) notFound();

  const t = schema.qaThreads;
  const base = and(scopeWhere(scope), eq(t.courseId, courseId));
  const where = {
    waiting: and(base, eq(t.status, "escalated")),
    mine: and(base, eq(t.status, "teacher_claimed"), eq(t.teacherId, user.id)),
    done: and(base, eq(t.teacherId, user.id), inArray(t.status, ["answered", "resolved", "closed_timeout"])),
    // Everything asked in the course, including questions the AI settled on its own.
    history: and(base, sql`${t.status} <> 'draft'`),
  };
  const wanted = (await searchParams).tab;
  const counts = await Promise.all(TABS.map(async (x) => (await db.select({ n: count() }).from(t).where(where[x.key]))[0].n));
  // Open the tab that has work in it.
  const tab = TABS.find((x) => x.key === wanted)?.key ?? (counts[0] ? "waiting" : counts[1] ? "mine" : "waiting");
  const rows = await questionRows(where[tab], { order: tab === "done" || tab === "history" ? "newest" : "oldest" });

  return (
    <>
      <BackLink href="/teacher">All courses</BackLink>
      <div className="mt-3"><PageTitle sub={course.batch ? `Session ${course.batch}` : undefined}>{course.name}</PageTitle></div>

      <Tabs label="Question lists" items={TABS.map((x, i) => ({ href: `?tab=${x.key}`, label: x.label, count: counts[i], active: tab === x.key, urgent: i === 0 }))} />

      {rows.length === 0 ? (
        <EmptyState title={tab === "waiting" ? "Nothing waiting in this course" : tab === "mine" ? "You haven't taken any questions here"
          : tab === "done" ? "You haven't answered any questions here yet" : "No questions in this course yet"} />
      ) : (
        <>
          {tab === "waiting" && <p className="mb-3 text-sm text-ink-soft">Oldest first. Open a question and take it so no one else answers at the same time.</p>}
          <QuestionList rows={rows} href={(id) => `/teacher/questions/${id}`} />
        </>
      )}
    </>
  );
}
