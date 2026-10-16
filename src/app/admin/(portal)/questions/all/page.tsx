import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { questionRows, questionCount, questionSearch, teacherInvolved, STATUS_GROUPS } from "@/lib/qa";
import { PageTitle } from "@/components/PortalHeader";
import { EmptyState, Pagination } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { QuestionList } from "@/components/QuestionList";
import { QuestionFilters } from "@/components/QuestionFilters";

export const metadata = { title: "All questions" };
const PER_PAGE = 30;

export default async function AdminAllQuestions({
  searchParams,
}: { searchParams: Promise<{ q?: string; course?: string; teacher?: string; status?: string; page?: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const group = STATUS_GROUPS.find((g) => g.key === sp.status) ?? STATUS_GROUPS[0];
  const page = Math.max(1, Number(sp.page) || 1);

  // Every course that has at least one question, for the course picker.
  const courses = await db.selectDistinct({ id: s.courses.id, name: s.courses.name })
    .from(s.qaThreads).innerJoin(s.courses, eq(s.courses.id, s.qaThreads.courseId))
    .where(sql`${s.qaThreads.status} <> 'draft'`).orderBy(asc(s.courses.name));
  const courseId = courses.find((c) => c.id === Number(sp.course))?.id ?? null;
  const teachers = await db.select({ id: s.users.id, name: s.users.name }).from(s.users)
    .where(eq(s.users.role, "teacher")).orderBy(asc(s.users.name));
  const teacherId = teachers.find((t) => t.id === Number(sp.teacher))?.id ?? null;

  const base = and(courseId ? eq(s.qaThreads.courseId, courseId) : undefined, teacherId ? teacherInvolved(teacherId) : undefined, questionSearch(q));
  const where = and(base, inArray(s.qaThreads.status, group.statuses));

  const [total, rows, ...groupCounts] = await Promise.all([
    questionCount(where),
    questionRows(where, { order: "newest", limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    ...STATUS_GROUPS.map((g) => questionCount(and(base, inArray(s.qaThreads.status, g.statuses)))),
  ]);
  const counts = Object.fromEntries(STATUS_GROUPS.map((g, i) => [g.key, groupCounts[i]]));
  const pageHref = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(courseId ? { course: String(courseId) } : {}), ...(teacherId ? { teacher: String(teacherId) } : {}), ...(group.key !== "all" ? { status: group.key } : {}), page: String(p) })}`;

  return (
    <>
      <PageTitle sub="Every question from every course: waiting, answered, solved — newest first.">Q&amp;A</PageTitle>
      <Tabs label="View" items={[
        { href: "/admin/questions", label: "By course", active: false },
        { href: "/admin/questions/all", label: "All questions", count: counts.all, active: true },
      ]} />
      <QuestionFilters q={q} course={courseId} status={group.key} courses={courses} statuses={STATUS_GROUPS} counts={counts}
        teachers={teachers} teacher={teacherId} />

      {rows.length === 0 ? (
        <EmptyState title={q || courseId || teacherId || group.key !== "all" ? "No questions match" : "No questions yet"}>
          {q || courseId || teacherId || group.key !== "all" ? "Try another search or filter." : "Questions appear here as soon as students start asking."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-soft">{total.toLocaleString()} question{total === 1 ? "" : "s"}</p>
          <QuestionList rows={rows} href={(id) => `/admin/questions/${id}`} showCourse />
        </>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PER_PAGE))} href={pageHref} />
    </>
  );
}
