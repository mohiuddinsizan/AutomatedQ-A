import { fmtMark } from "@/lib/format";

/** Correct / incorrect / skipped as one thin bar with a 2px gap between parts. */
export function AnswerBar({ correct, incorrect, skipped }: { correct: number | null; incorrect: number | null; skipped: number | null }) {
  const c = correct ?? 0, w = incorrect ?? 0, sk = skipped ?? 0;
  const total = c + w + sk;
  if (!total) return null;
  const parts = [
    { n: c, label: "correct", cls: "bg-ok" },
    { n: w, label: "wrong", cls: "bg-error/80" },
    { n: sk, label: "skipped", cls: "bg-rule" },
  ];
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.filter((p) => p.n > 0).map((p) => (
          <span key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-soft">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1">
            <span className={`inline-block size-2 rounded-full ${p.cls}`} aria-hidden />{p.n} {p.label}
          </span>
        ))}
      </p>
    </div>
  );
}

export function MarkLine({ label, mark, full, sat }: { label: string; mark: number | null; full: number | null; sat: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="text-ink">
        {sat ? fmtMark(mark) : <span className="text-ink-faint">Absent</span>}
        {full !== null && <span className="text-ink-faint"> / {fmtMark(full)}</span>}
      </span>
    </div>
  );
}

export function RankBadge({ rank, of }: { rank: number | null; of: number | null }) {
  if (!rank) return null;
  const medal = rank <= 3;
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-sm ${medal ? "bg-gold/10 text-gold" : "bg-paper text-ink-soft"}`}>
      Rank <strong className="font-semibold">{rank}</strong>{of ? <span className="text-xs">of {of}</span> : null}
    </span>
  );
}
