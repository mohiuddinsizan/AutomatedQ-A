import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { studentCourse, courseLeaderboard } from "@/lib/results";
import { fmtMark, ordinal } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Card, EmptyState, TableWrap, th, td } from "@/components/ui";

export const metadata = { title: "Leaderboard" };

const SHOWN = 50;

export default async function LeaderboardPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePortal("student");
  const course = await studentCourse(user.id, Number((await params).courseId));
  if (!course) notFound();

  const back = <BackLink href={`/student/courses/${course.id}`}>{course.name}</BackLink>;
  if (!course.leaderboardPublished) {
    return (<>{back}<div className="mt-3"><PageTitle>Leaderboard</PageTitle></div>
      <EmptyState title="Not published yet">The leaderboard for this course hasn&apos;t been published. Your own ranks are on your results page.</EmptyState></>);
  }

  const board = await courseLeaderboard(course.id);
  const mine = board.find((r) => r.student_id === user.id);
  const top = board.slice(0, SHOWN);

  return (
    <>
      {back}
      <div className="mt-3">
        <PageTitle sub="Total marks across every exam in the course. Missing an exam counts as zero for it.">Leaderboard</PageTitle>
      </div>

      {mine ? (
        <Card className="brand-hero mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-0 p-5 text-white">
          <div>
            <p className="text-sm text-white/70">Your position</p>
            <p className="font-display text-4xl text-white">{ordinal(mine.rank)} <span className="text-lg text-white/70">of {board.length}</span></p>
          </div>
          <div className="text-sm text-white/80">
            <p><strong className="font-semibold text-brand-orange">{fmtMark(mine.total)}</strong> total marks from {mine.exams} exams</p>
            {mine.rank > 1 && <p>{fmtMark(Math.round((board[0].total - mine.total) * 100) / 100)} marks behind 1st place</p>}
          </div>
        </Card>
      ) : (
        <p className="mb-6 text-ink-soft">You&apos;ll appear here after your first exam result.</p>
      )}

      {board.length >= 3 && (
        <ol className="mb-6 grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Top three">
          {[board[1], board[0], board[2]].map((r, i) => {
            const place = [2, 1, 3][i];
            const style = place === 1 ? "chip-orange h-36 sm:h-40" : place === 2 ? "chip-navy h-28 sm:h-32" : "chip-red h-24 sm:h-28";
            return (
              <li key={r.student_id} className="flex flex-col items-center text-center">
                <span className={`mb-2 grid size-12 place-items-center rounded-full bg-sheet text-lg font-bold shadow-md ring-4 ${place === 1 ? "text-brand-orange ring-brand-orange/40" : place === 2 ? "text-pen ring-brand-indigo/30" : "text-brand-red ring-brand-red/30"}`}>
                  {r.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="line-clamp-2 min-h-10 text-sm font-semibold text-ink">{r.name}{r.student_id === user.id && " (you)"}</span>
                <span className={`${style} mt-2 flex w-full flex-col items-center justify-start rounded-t-2xl pt-3`}>
                  <span className="text-3xl font-bold">{place}</span>
                  <span className="text-xs font-semibold text-white/85">{fmtMark(r.total)} marks</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {board.length === 0 ? <EmptyState title="No results yet" /> : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-paper"><tr>
              <th className={th}>#</th><th className={th}>Name</th><th className={`${th} hidden sm:table-cell`}>Branch</th>
              <th className={`${th} text-right`}>Exams</th><th className={`${th} text-right`}>Total</th>
            </tr></thead>
            <tbody className="divide-y divide-rule">
              {top.map((r) => (
                <tr key={r.student_id} className={r.student_id === user.id ? "bg-pen-soft" : ""}>
                  <td className={`${td} font-medium ${r.rank <= 3 ? "text-gold" : "text-ink"}`}>{r.rank}</td>
                  <td className={`${td} text-ink`}>{r.name}{r.student_id === user.id && " (you)"}</td>
                  <td className={`${td} hidden text-ink-soft sm:table-cell`}>{r.branch ?? "—"}</td>
                  <td className={`${td} text-right text-ink-soft`}>{r.exams}</td>
                  <td className={`${td} text-right font-medium text-ink`}>{fmtMark(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {board.length > SHOWN && <p className="mt-3 text-sm text-ink-faint">Showing the top {SHOWN} of {board.length} students.</p>}
    </>
  );
}
