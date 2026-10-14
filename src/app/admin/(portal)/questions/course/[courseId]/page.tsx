import { notFound } from "next/navigation";
import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { questionRows } from "@/lib/qa";
import { Tabs } from "@/components/Tabs";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, EmptyState, Pagination } from "@/components/ui";
import { QuestionList } from "@/components/QuestionList";

const PER_PAGE = 30;
const t = schema.qaThreads;
const TABS: { key: string; label: string; where: SQL }[] = [
  { key: "waiting", label: "Waiting for a teacher", where: eq(t.status, "escalated") },
  { key: "progress", label: "Teacher is answering", where: eq(t.status, "teacher_claimed") },
  { key: "replied", label: "Teacher replied", where: eq(t.status, "answered") },
  { key: "ai", label: "Answered by AI", where: inArray(t.status, ["ai_answered", "awaiting_ai"]) },
  { key: "solved", label: "Solved / closed", where: inArray(t.status, ["resolved", "closed_timeout"]) },
  { key: "all", label: "All", where: sql`${t.status} <> 'draft'` },
];

export default async function AdminCourseQuestions({
  params, searchParams,
}: { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requirePortal("admin");
  const courseId = Number((await params).courseId);
  if (!Number.isInteger(courseId)) notFound();
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
  if (!course) notFound();

  const sp = await searchParams;
  const counts = await Promise.all(TABS.map(async (x) =>
    (await db.select({ n: count() }).from(t).where(and(eq(t.courseId, courseId), x.where)))[0].n));
  const tab = TABS.find((x) => x.key === sp.tab) ?? (counts[0] ? TABS[0] : TABS[TABS.length - 1]);
  const i = TABS.indexOf(tab);
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await questionRows(and(eq(t.courseId, courseId), tab.where), {
    order: ["waiting", "progress"].includes(tab.key) ? "oldest" : "newest",
    limit: PER_PAGE, offset: (page - 1) * PER_PAGE,
  });

  return (
    <>
      <BackLink href="/admin/questions">All courses</BackLink>
      <div className="mt-3"><PageTitle sub={course.batch ? `Session ${course.batch}` : undefined}>{course.name}</PageTitle></div>

      <Tabs label="Filter by status" items={TABS.map((x, j) => ({ href: `?tab=${x.key}`, label: x.label, count: counts[j], active: tab.key === x.key, urgent: j === 0 }))} />

      {rows.length === 0 ? <EmptyState title="No questions here" /> : <QuestionList rows={rows} href={(id) => `/admin/questions/${id}`} />}
      <Pagination page={page} pages={Math.max(1, Math.ceil(counts[i] / PER_PAGE))} href={(p) => `?tab=${tab.key}&page=${p}`} />
    </>
  );
}
