import Link from "next/link";
import type { QuestionRow } from "@/lib/qa";
import { fmtAgo, hoursSince } from "@/lib/format";
import { Badge, Card, Stars } from "./ui";
import { StatusBadge } from "./ThreadView";

/** How long a forwarded question has been waiting, coloured by urgency. */
function Waiting({ since }: { since: Date }) {
  const hours = hoursSince(since);
  const tone = hours >= 24 ? "red" : hours >= 6 ? "amber" : "neutral";
  return <Badge tone={tone}>Waiting {fmtAgo(since).replace(" ago", "")}</Badge>;
}

export function QuestionList({ rows, href, showCourse = false }: { rows: QuestionRow[]; href: (id: number) => string; showCourse?: boolean }) {
  return (
    <Card as="div" className="divide-y divide-rule overflow-hidden">
      {rows.map((r) => (
        <Link key={r.id} href={href(r.id)} className="group block p-4 transition-colors hover:bg-gradient-to-r hover:from-pen-soft hover:to-transparent sm:px-5">
          <div className="flex items-start gap-3">
            <span className={`${r.status === "escalated" ? "chip-orange" : r.status === "resolved" || r.status === "closed_timeout" ? "chip-green" : "chip-navy"} grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold`} aria-hidden>
              {r.student.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-ink group-hover:text-pen">{r.question ?? "Question"}</p>
              <p className="mt-1 text-sm text-ink-faint">
                {r.student} · {r.roll}{showCourse && <> · {r.course}</>} · {fmtAgo(r.updatedAt)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{r.subject}</Badge>
                {r.status === "escalated" && r.escalatedAt ? <Waiting since={r.escalatedAt} /> : <StatusBadge status={r.status} />}
                {r.hidden && <Badge tone="red">Hidden</Badge>}
                {/* While it waits, the only rating is the AI's; it would read as the question's own. */}
                {r.rating && !["escalated", "teacher_claimed"].includes(r.status) ? <Stars value={r.rating} /> : null}
              </div>
            </div>
            <span className="hidden self-center text-pen sm:block" aria-hidden>→</span>
          </div>
        </Link>
      ))}
    </Card>
  );
}

/** One course in a queue: what's waiting, what's in progress, and how old the oldest is. */
export function CourseQueueCard({
  href, name, batch, waiting, inProgress, total, oldestWaiting, extra,
}: {
  href: string; name: string; batch: string | null; waiting: number; inProgress: number; total?: number;
  oldestWaiting: string | null; extra?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card className={`card-hover relative flex h-full flex-col overflow-hidden p-5 ${waiting ? "border-brand-orange/40" : ""}`}>
        <span className={`absolute inset-x-0 top-0 h-1 ${waiting ? "bg-gradient-to-r from-brand-orange to-brand-red" : "bg-gradient-to-r from-brand-navy to-brand-indigo"}`} aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-ink group-hover:text-pen">{name}</h3>
            {batch && <p className="text-sm text-ink-faint">Session {batch}</p>}
          </div>
          <span className="text-pen" aria-hidden>→</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className={`rounded-xl px-3 py-3 ${waiting ? "chip-orange" : "bg-paper"}`}>
            <dd className={`font-display text-3xl ${waiting ? "text-white" : "text-ink"}`}>{waiting}</dd>
            <dt className={`text-xs font-medium ${waiting ? "text-white/85" : "text-ink-soft"}`}>Waiting</dt>
          </div>
          <div className={`rounded-xl px-3 py-3 ${inProgress ? "chip-navy" : "bg-paper"}`}>
            <dd className={`font-display text-3xl ${inProgress ? "text-white" : "text-ink"}`}>{inProgress}</dd>
            <dt className={`text-xs font-medium ${inProgress ? "text-white/85" : "text-ink-soft"}`}>In progress</dt>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-soft">
          {oldestWaiting ? <>Oldest has waited {fmtAgo(oldestWaiting).replace(" ago", "")}</> : "Nothing waiting"}
          {total !== undefined && <> · {total} total</>}
        </p>
        {extra}
      </Card>
    </Link>
  );
}
