import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { studentCourse, studentResults, examMerit, percentOf } from "@/lib/results";
import { fmtDate, fmtMark, ordinal } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Card, StatGrid, SectionTitle, TableWrap, th, td, Alert } from "@/components/ui";
import { AnswerBar, MarkLine } from "@/components/ResultBits";

export default async function ExamPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const user = await requirePortal("student");
  const p = await params;
  const course = await studentCourse(user.id, Number(p.courseId));
  if (!course) notFound();

  const r = (await studentResults(user.id, course.id)).find((x) => x.examId === Number(p.examId));
  if (!r) notFound();

  const merit = course.leaderboardPublished ? await examMerit(r.examId, 10) : [];
  const inTop = merit.some((m) => m.studentId === user.id);
  const [me] = await db.select({ branch: schema.students.institution }).from(schema.students).where(eq(schema.students.userId, user.id));
  const pct = percentOf(r);
  const absent = r.marks === null;

  return (
    <>
      <BackLink href={`/student/courses/${course.id}/results`}>My results</BackLink>
      <div className="mt-3"><PageTitle sub={`${course.name} · ${fmtDate(r.examDate)}`}>{r.title}</PageTitle></div>

      {absent ? (
        <Alert tone="info">You don&apos;t have a result for this exam. If you sat it, tell the admin office your roll number so they can check the answer sheet.</Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <Card className="relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-navy via-brand-orange to-brand-red" aria-hidden />
            <p className="text-sm font-semibold text-ink-soft">Your score</p>
            <p className="text-gradient mt-1 font-display text-6xl">
              {fmtMark(r.marks)}{r.totalMarks !== null && <span className="text-2xl text-ink-faint"> / {fmtMark(r.totalMarks)}</span>}
            </p>
            <p className="mt-2 text-ink-soft">
              {pct !== null && <>{pct}% · </>}
              {r.rank ? <><strong className="font-medium text-ink">{ordinal(r.rank)}</strong> of {r.sitters}</> : null}
              {r.percentile !== null && <> · ahead of {Math.round(r.percentile)}% of the class</>}
            </p>
            <div className="mt-5 grid gap-2 border-t border-rule pt-4">
              <MarkLine label="MCQ" mark={r.mcqMark} full={r.fullMcqMark} sat={r.satMcq} />
              <MarkLine label="Written" mark={r.writtenMark} full={r.fullWrittenMark} sat={r.satWritten} />
            </div>
            {r.questions ? (
              <div className="mt-5 border-t border-rule pt-4">
                <p className="mb-2 text-sm text-ink-soft">{r.questions} MCQ questions</p>
                <AnswerBar correct={r.correct} incorrect={r.incorrect} skipped={r.skipped} />
              </div>
            ) : null}
          </Card>
          <StatGrid cols={2} items={[
            { label: "Highest in class", value: fmtMark(r.top) },
            { label: "Class average", value: r.avg !== null ? fmtMark(Math.round(r.avg * 10) / 10) : "—" },
            { label: "Students who sat", value: r.sitters ?? 0 },
            { label: "Behind the top", value: r.top !== null && r.marks !== null ? fmtMark(Math.round((r.top - r.marks) * 100) / 100) : "—" },
          ]} />
        </div>
      )}

      {merit.length > 0 && (
        <>
          <SectionTitle>Top of this exam</SectionTitle>
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="border-b border-rule bg-paper"><tr>
                <th className={th}>Rank</th><th className={th}>Name</th><th className={`${th} hidden sm:table-cell`}>Branch</th><th className={`${th} text-right`}>Marks</th>
              </tr></thead>
              <tbody className="divide-y divide-rule">
                {merit.map((m) => (
                  <tr key={m.studentId} className={m.studentId === user.id ? "bg-pen-soft" : ""}>
                    <td className={`${td} font-medium ${m.rank! <= 3 ? "text-gold" : "text-ink"}`}>{m.rank}</td>
                    <td className={`${td} text-ink`}>{m.name}{m.studentId === user.id && " (you)"}</td>
                    <td className={`${td} hidden text-ink-soft sm:table-cell`}>{m.branch ?? "—"}</td>
                    <td className={`${td} text-right text-ink`}>{fmtMark(m.marks)}</td>
                  </tr>
                ))}
                {!inTop && !absent && (
                  <tr className="bg-pen-soft">
                    <td className={`${td} font-medium text-ink`}>{r.rank}</td>
                    <td className={`${td} text-ink`}>{user.name} (you)</td>
                    <td className={`${td} hidden text-ink-soft sm:table-cell`}>{me?.branch ?? "—"}</td>
                    <td className={`${td} text-right text-ink`}>{fmtMark(r.marks)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
    </>
  );
}
