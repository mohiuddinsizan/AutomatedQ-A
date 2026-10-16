import { notFound } from "next/navigation";
import { and, asc, avg, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { resetPassword, setAccountStatus, setTeacherAssignments } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { AssignmentFields } from "@/components/AssignmentFields";
import { BackLink, Badge, Card, EmptyState, Pagination, SectionTitle, StatGrid, Stars } from "@/components/ui";
import { QuestionList } from "@/components/QuestionList";
import { QuestionFilters } from "@/components/QuestionFilters";
import { questionRows, questionCount, questionSearch, teacherInvolved, STATUS_GROUPS } from "@/lib/qa";

const PER_PAGE = 20;
const GROUPS = STATUS_GROUPS.filter((g) => ["all", "progress", "replied", "solved"].includes(g.key))
  .map((g) => (g.key === "progress" ? { ...g, label: "They're answering" } : g.key === "replied" ? { ...g, label: "Waiting for the student" } : g));

export default async function TeacherDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; course?: string; status?: string; page?: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.role, "teacher"))).limit(1);
  if (!u) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const group = GROUPS.find((g) => g.key === sp.status) ?? GROUPS[0];
  const page = Math.max(1, Number(sp.page) || 1);

  const [courses, subjects, mineC, mineS] = await Promise.all([
    db.select({ id: s.courses.id, name: s.courses.name, status: s.courses.status }).from(s.courses).orderBy(asc(s.courses.status), asc(s.courses.name)),
    db.select({ id: s.subjects.id, name: s.subjects.name }).from(s.subjects).orderBy(asc(s.subjects.name)),
    db.select({ id: s.teacherCourses.courseId }).from(s.teacherCourses).where(eq(s.teacherCourses.teacherId, id)),
    db.select({ id: s.teacherSubjects.subjectId }).from(s.teacherSubjects).where(eq(s.teacherSubjects.teacherId, id)),
  ]);

  // This teacher's Q&A: every question they've taken or replied to.
  const assigned = courses.filter((c) => mineC.some((m) => m.id === c.id));
  const courseId = assigned.find((c) => c.id === Number(sp.course))?.id ?? null;
  const base = and(teacherInvolved(id), courseId ? eq(s.qaThreads.courseId, courseId) : undefined, questionSearch(q));
  const where = and(base, inArray(s.qaThreads.status, group.statuses));
  const [total, rows, [mine], ...groupCounts] = await Promise.all([
    questionCount(where),
    questionRows(where, { order: "newest", limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    db.select({ replies: count(), rating: avg(s.qaMessages.rating), rated: count(s.qaMessages.rating) })
      .from(s.qaMessages).where(and(eq(s.qaMessages.senderId, id), eq(s.qaMessages.senderType, "teacher"))),
    ...GROUPS.map((g) => questionCount(and(base, inArray(s.qaThreads.status, g.statuses)))),
  ]);
  const counts = Object.fromEntries(GROUPS.map((g, i) => [g.key, groupCounts[i]]));
  const pageHref = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(courseId ? { course: String(courseId) } : {}), ...(group.key !== "all" ? { status: group.key } : {}), page: String(p) })}#qa`;

  return (
    <>
      <BackLink href="/admin/teachers">Teachers</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>{u.username}{u.phone && ` · ${u.phone}`} · last sign-in {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}</>}
          action={u.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}>
          {u.name}
        </PageTitle>
      </div>

      <StatGrid cols={4} items={[
        { label: "Questions handled", value: counts.all },
        { label: "Replies sent", value: mine.replies },
        { label: "Answering now", value: counts.progress },
        { label: "Average rating", value: mine.rating ? <Stars value={Number(mine.rating)} size="md" /> : "—", sub: mine.rated ? `${mine.rated} ratings` : undefined },
      ]} />

      <div id="qa" className="scroll-mt-28">
        <SectionTitle>Q&amp;A by this teacher</SectionTitle>
      </div>
      <QuestionFilters q={q} course={courseId} status={group.key} courses={assigned} statuses={GROUPS} counts={counts} />
      {rows.length === 0 ? (
        <EmptyState title={q || courseId || group.key !== "all" ? "No questions match" : "No questions yet"}>
          {q || courseId || group.key !== "all" ? "Try another search or filter." : "Questions this teacher takes or replies to appear here, with the full chat."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-soft">{total.toLocaleString()} question{total === 1 ? "" : "s"} · tap one to read the whole conversation</p>
          <QuestionList rows={rows} href={(qid) => `/admin/questions/${qid}`} showCourse />
        </>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PER_PAGE))} href={pageHref} />

      <SectionTitle>Courses and subjects</SectionTitle>
      <Card className="p-5">
        <ActionForm action={setTeacherAssignments} submit="Save assignments">
          <input type="hidden" name="teacherId" value={u.id} />
          <AssignmentFields courses={courses} subjects={subjects} courseIds={mineC.map((c) => c.id)} subjectIds={mineS.map((x) => x.id)} />
        </ActionForm>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <ActionForm action={resetPassword} submit="Reset password" variant="secondary" className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <p className="text-sm text-ink-soft">Creates a one-time password and signs them out everywhere.</p>
        </ActionForm>
        <ActionForm action={setAccountStatus} submit={u.status === "active" ? "Disable account" : "Enable account"}
          variant={u.status === "active" ? "danger" : "secondary"} className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <input type="hidden" name="status" value={u.status === "active" ? "disabled" : "active"} />
          <p className="text-sm text-ink-soft">{u.status === "active" ? "They can't sign in until enabled again." : "Lets them sign in again."}</p>
        </ActionForm>
      </Card>
    </>
  );
}
