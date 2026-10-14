import { notFound } from "next/navigation";
import { asc, count, desc, eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { updateCourse, applyCourseQuota, setCourseSubjects, setExamPublished } from "@/app/actions/admin";
import { fmtDate, fmtDateTime, fmtMark } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { ResultSyncPanel } from "@/components/ResultSyncPanel";
import { BackLink, Badge, Card, SectionTitle, StatGrid, TableWrap, th, td, Button } from "@/components/ui";

const num = "h-11 w-28 rounded-md border border-rule bg-sheet px-2 text-base text-ink";

export default async function CourseDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [course] = await db.select().from(s.courses).where(eq(s.courses.id, id)).limit(1);
  if (!course) notFound();

  const [[{ active }], [{ dropped }], subjects, chosen, exams] = await Promise.all([
    db.select({ active: count() }).from(s.enrollments).where(and(eq(s.enrollments.courseId, id), eq(s.enrollments.status, "active"))),
    db.select({ dropped: count() }).from(s.enrollments).where(and(eq(s.enrollments.courseId, id), eq(s.enrollments.status, "dropped"))),
    db.select().from(s.subjects).orderBy(asc(s.subjects.name)),
    db.select({ id: s.courseSubjects.subjectId }).from(s.courseSubjects).where(eq(s.courseSubjects.courseId, id)),
    db.select({
      id: s.exams.id, title: s.exams.title, examDate: s.exams.examDate, published: s.exams.published,
      removed: s.exams.removedUpstream, fullMcq: s.exams.fullMcqMark, fullWritten: s.exams.fullWrittenMark,
      sat: sql<number>`(select count(*)::int from results r where r.exam_id = "exams"."id" and not r.withdrawn)`,
    }).from(s.exams).where(eq(s.exams.courseId, id)).orderBy(desc(s.exams.examDate), desc(s.exams.id)),
  ]);
  const chosenIds = new Set(chosen.map((c) => c.id));

  return (
    <>
      <BackLink href="/admin/courses">Courses</BackLink>
      <div className="mt-3">
        <PageTitle sub={[course.code, course.batch && `Session ${course.batch}`].filter(Boolean).join(" · ")}
          action={course.status === "active" ? <Badge tone="green">Active</Badge> : <Badge>Archived</Badge>}>
          {course.name}
        </PageTitle>
      </div>

      <StatGrid cols={4} items={[
        { label: "Active students", value: active.toLocaleString() },
        { label: "Dropped", value: dropped },
        { label: "Exams", value: exams.filter((e) => !e.removed).length },
        { label: "Results updated", value: course.resultsSyncedAt ? fmtDate(course.resultsSyncedAt) : "Never" },
      ]} />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-xl text-ink">Course settings</h2>
          <p className="mb-4 text-sm text-ink-soft">New enrollments start with these allowances.</p>
          <ActionForm action={updateCourse} submit="Save settings" variant="secondary">
            <input type="hidden" name="courseId" value={course.id} />
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">Questions per student
                <input name="qa" type="number" min={0} max={999} defaultValue={course.defaultQaQuota} className={num} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">Mentor sessions per student
                <input name="sessions" type="number" min={0} max={999} defaultValue={course.defaultSessionQuota} className={num} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="leaderboard" defaultChecked={course.leaderboardPublished} className="size-4 accent-[var(--color-pen)]" />
              Show the leaderboard and exam top-10 to students
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="listed" defaultChecked={course.listed} className="size-4 accent-[var(--color-pen)]" />
              List under &ldquo;Available courses&rdquo; for students who aren&apos;t enrolled
            </label>
          </ActionForm>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-xl text-ink">Change everyone&apos;s allowance</h2>
          <p className="mb-4 text-sm text-ink-soft">Applies to the {active.toLocaleString()} actively enrolled students only.</p>
          <ActionForm action={applyCourseQuota} submit="Apply to all active students" variant="secondary">
            <input type="hidden" name="courseId" value={course.id} />
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="add" defaultChecked className="accent-[var(--color-pen)]" /> Add to what they have</label>
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="set" className="accent-[var(--color-pen)]" /> Set exactly</label>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">Questions
                <input name="qa" type="number" min={-999} max={999} defaultValue={0} className={num} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">Mentor sessions
                <input name="sessions" type="number" min={-999} max={999} defaultValue={0} className={num} /></label>
            </div>
          </ActionForm>
        </Card>
      </div>

      <SectionTitle>Subjects</SectionTitle>
      <Card className="p-5">
        <ActionForm action={setCourseSubjects} submit="Save subjects" variant="secondary">
          <input type="hidden" name="courseId" value={course.id} />
          <p className="text-sm text-ink-soft">Students pick from these when asking a question or booking a mentor. Leave all unticked to offer every subject.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {subjects.map((x) => (
              <label key={x.id} className="flex items-center gap-2 rounded-md border border-rule px-3 py-2 text-sm text-ink has-[:checked]:border-pen/40 has-[:checked]:bg-pen-soft">
                <input type="checkbox" name="subjectIds" value={x.id} defaultChecked={chosenIds.has(x.id)} className="size-4 accent-[var(--color-pen)]" />
                {x.name}
              </label>
            ))}
          </div>
        </ActionForm>
      </Card>

      <SectionTitle>Results</SectionTitle>
      <Card className="mb-4 p-5">
        <ResultSyncPanel courseId={course.id} label="Import this course's results now" />
      </Card>
      {exams.length > 0 && (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-paper"><tr>
              <th className={th}>Exam</th><th className={`${th} hidden sm:table-cell`}>Full marks</th>
              <th className={`${th} text-right`}>Sat</th><th className={th}>Students see it</th>
            </tr></thead>
            <tbody className="divide-y divide-rule">
              {exams.map((e) => (
                <tr key={e.id} className={e.removed ? "opacity-60" : ""}>
                  <td className={td}>
                    <span className="text-ink">{e.title}</span>
                    <span className="block text-xs text-ink-faint">{fmtDate(e.examDate)}{e.removed && " · removed in BigBang"}</span>
                  </td>
                  <td className={`${td} hidden text-ink-soft sm:table-cell`}>
                    MCQ {fmtMark(e.fullMcq)} · Written {fmtMark(e.fullWritten)}
                  </td>
                  <td className={`${td} text-right text-ink`}>{e.sat}</td>
                  <td className={td}>
                    {e.removed ? <Badge>Hidden</Badge> : (
                      <form action={setExamPublished} className="flex items-center gap-2">
                        <input type="hidden" name="examId" value={e.id} />
                        <input type="hidden" name="published" value={e.published ? "0" : "1"} />
                        {e.published ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Hidden</Badge>}
                        <Button type="submit" variant="ghost" size="sm">{e.published ? "Hide" : "Publish"}</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="mt-3 text-xs text-ink-faint">Created {fmtDateTime(course.createdAt)}.</p>
    </>
  );
}
