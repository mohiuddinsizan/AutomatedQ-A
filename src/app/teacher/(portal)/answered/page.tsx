import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { teacherScope, scopeWhere, questionRows, questionCount, questionSearch, STATUS_GROUPS } from "@/lib/qa";
import { PageTitle } from "@/components/PortalHeader";
import { EmptyState, Pagination } from "@/components/ui";
import { QuestionList } from "@/components/QuestionList";
import { QuestionFilters } from "@/components/QuestionFilters";

export const metadata = { title: "My answers" };
const PER_PAGE = 30;
const GROUPS = STATUS_GROUPS.filter((g) => ["all", "progress", "replied", "solved"].includes(g.key))
  .map((g) => (g.key === "progress" ? { ...g, label: "Follow-up waiting for you" } : g.key === "replied" ? { ...g, label: "Waiting for the student" } : g));

export default async function TeacherAnswered({
  searchParams,
}: { searchParams: Promise<{ q?: string; course?: string; status?: string; page?: string }> }) {
  const user = await requirePortal("teacher");
  const s = schema;
  const sp = await searchParams;
  const scope = await teacherScope(user.id);
  const q = (sp.q ?? "").slice(0, 80);
  const group = GROUPS.find((g) => g.key === sp.status) ?? GROUPS[0];
  const page = Math.max(1, Number(sp.page) || 1);

  const courses = scope.courseIds.length
    ? await db.select({ id: s.courses.id, name: s.courses.name }).from(s.courses).where(inArray(s.courses.id, scope.courseIds)).orderBy(asc(s.courses.name))
    : [];
  const courseId = courses.find((c) => c.id === Number(sp.course))?.id ?? null;

  // Every question this teacher has replied to, still inside their assigned courses.
  const replied = sql`exists (select 1 from qa_messages m where m.thread_id = "qa_threads"."id" and m.sender_id = ${user.id} and m.sender_type = 'teacher')`;
  const base = and(scopeWhere(scope), replied, courseId ? eq(s.qaThreads.courseId, courseId) : undefined, questionSearch(q));
  const where = and(base, inArray(s.qaThreads.status, group.statuses));

  const [total, rows, ...groupCounts] = await Promise.all([
    questionCount(where),
    questionRows(where, { order: "newest", limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    ...GROUPS.map((g) => questionCount(and(base, inArray(s.qaThreads.status, g.statuses)))),
  ]);
  const counts = Object.fromEntries(GROUPS.map((g, i) => [g.key, groupCounts[i]]));
  const pageHref = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(courseId ? { course: String(courseId) } : {}), ...(group.key !== "all" ? { status: group.key } : {}), page: String(p) })}`;

  return (
    <>
      <PageTitle sub="Every question you've replied to, with the student's rating — newest first.">My answers</PageTitle>
      <QuestionFilters q={q} course={courseId} status={group.key} courses={courses} statuses={GROUPS} counts={counts} />
      {rows.length === 0 ? (
        <EmptyState title={q || courseId || group.key !== "all" ? "No answers match" : "You haven't answered any questions yet"}>
          {q || courseId || group.key !== "all" ? "Try another search or filter." : "Questions you reply to will be listed here."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-soft">{total.toLocaleString()} question{total === 1 ? "" : "s"}</p>
          <QuestionList rows={rows} href={(id) => `/teacher/questions/${id}`} showCourse />
        </>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PER_PAGE))} href={pageHref} />
    </>
  );
}
