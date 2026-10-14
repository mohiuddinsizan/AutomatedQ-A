import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { studentCourse, studentResults, percentOf } from "@/lib/results";
import { fmtDate, fmtMark } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Card, EmptyState, StatGrid, SectionTitle, LinkButton } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { AnswerBar, RankBadge } from "@/components/ResultBits";

export const metadata = { title: "Results" };

export default async function ResultsPage({
  params, searchParams,
}: { params: Promise<{ courseId: string }>; searchParams: Promise<{ show?: string }> }) {
  const user = await requirePortal("student");
  const course = await studentCourse(user.id, Number((await params).courseId));
  if (!course) notFound();
  const show = (await searchParams).show === "all" ? "all" : "taken";

  const all = await studentResults(user.id, course.id);
  const taken = all.filter((r) => r.marks !== null);
  const list = show === "all" ? all : taken;

  const pcts = taken.map(percentOf).filter((p): p is number => p !== null);
  const avgPct = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
  const bestRank = taken.reduce<number | null>((b, r) => (r.rank && (!b || r.rank < b) ? r.rank : b), null);
  const top3 = taken.filter((r) => r.rank && r.rank <= 3).length;

  const trend = [...taken].reverse().filter((r) => r.percentile !== null).slice(-20)
    .map((r) => ({ label: r.title, date: fmtDate(r.examDate), value: r.percentile! }));

  return (
    <>
      <BackLink href={`/student/courses/${course.id}`}>{course.name}</BackLink>
      <div className="mt-3">
        <PageTitle sub={course.name} action={<LinkButton href={`/student/courses/${course.id}/leaderboard`} variant="secondary" size="sm">Leaderboard</LinkButton>}>
          My results
        </PageTitle>
      </div>

      {all.length === 0 ? (
        <EmptyState title="No exams yet">Results appear here after each exam is checked.</EmptyState>
      ) : (
        <>
          <StatGrid items={[
            { label: "Exams taken", value: taken.length, sub: `of ${all.length} held` },
            { label: "Average score", value: avgPct !== null ? `${avgPct}%` : "—", sub: pcts.length < taken.length ? "where full marks are known" : undefined },
            { label: "Best rank", value: bestRank ?? "—" },
            { label: "Top-3 finishes", value: top3 },
          ]} />

          {trend.length >= 2 && <Card className="mt-6 p-4 sm:p-5"><TrendChart points={trend} /></Card>}

          <SectionTitle action={
            <div className="flex rounded-md border border-rule bg-sheet p-0.5 text-sm" role="group" aria-label="Which exams">
              {(["taken", "all"] as const).map((k) => (
                <Link key={k} href={`?show=${k}`} aria-current={show === k ? "true" : undefined}
                  className={`rounded px-3 py-1.5 ${show === k ? "bg-pen-soft font-medium text-pen-dark" : "text-ink-soft hover:text-ink"}`}>
                  {k === "taken" ? `Taken (${taken.length})` : `All exams (${all.length})`}
                </Link>
              ))}
            </div>
          }>Exams</SectionTitle>

          {list.length === 0 ? (
            <EmptyState title="You haven't taken any exams yet" />
          ) : (
            <ul className="grid gap-3">
              {list.map((r) => {
                const pct = percentOf(r);
                const absent = r.marks === null;
                return (
                  <li key={r.examId}>
                    <Link href={`/student/courses/${course.id}/results/${r.examId}`} className="group block">
                      <Card className={`p-4 card-hover ${absent ? "bg-paper" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-ink group-hover:text-pen">{r.title}</p>
                            <p className="text-sm text-ink-faint">{fmtDate(r.examDate)}{r.sitters ? ` · ${r.sitters} sat` : ""}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {absent ? <span className="text-sm text-ink-faint">Absent</span> : (
                              <>
                                <p className="text-gradient font-display text-3xl leading-none">
                                  {fmtMark(r.marks)}{r.totalMarks !== null && <span className="text-base text-ink-faint">/{fmtMark(r.totalMarks)}</span>}
                                </p>
                                {pct !== null && <p className="mt-1 text-xs text-ink-soft">{pct}%</p>}
                              </>
                            )}
                          </div>
                        </div>
                        {!absent && (
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                              <RankBadge rank={r.rank} of={r.sitters} />
                              {r.satMcq && <span>MCQ {fmtMark(r.mcqMark)}</span>}
                              {r.satWritten && <span>Written {fmtMark(r.writtenMark)}</span>}
                            </div>
                            {r.questions ? <div className="sm:ml-auto sm:w-64"><AnswerBar correct={r.correct} incorrect={r.incorrect} skipped={r.skipped} /></div> : null}
                          </div>
                        )}
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
