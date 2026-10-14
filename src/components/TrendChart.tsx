"use client";

import { useState } from "react";

type Point = { label: string; date: string; value: number };

/**
 * One series: the student's percentile in each exam, oldest to newest.
 * Percentile is used rather than marks because exams are out of different totals.
 */
export function TrendChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const W = 640, H = 180, L = 34, R = 12, T = 12, B = 22;
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const active = hover ?? points.length - 1;
  const ap = points[active];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
        <figcaption className="font-medium text-ink">Your standing over time</figcaption>
        <span className="text-ink-soft" aria-live="polite">
          {ap.label} · {ap.date} · <strong className="font-medium text-ink">ahead of {Math.round(ap.value)}%</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img"
        aria-label={`Percentile across ${points.length} exams, latest ${Math.round(points.at(-1)!.value)}`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-rule)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-faint)">{v}</text>
          </g>
        ))}
        <line x1={x(active)} x2={x(active)} y1={T} y2={H - B} stroke="var(--color-ink-faint)" strokeDasharray="3 3" strokeWidth={1} />
        <path d={line} fill="none" stroke="var(--color-pen)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={i === active ? 5 : 3}
            fill={i === active ? "var(--color-pen)" : "var(--color-sheet)"} stroke="var(--color-pen)" strokeWidth={2}
            style={{ stroke: "var(--color-pen)" }} />
        ))}
        <circle cx={x(active)} cy={y(ap.value)} r={7} fill="none" stroke="var(--color-sheet)" strokeWidth={2} />
        <text x={L} y={H - 4} fontSize={11} fill="var(--color-ink-faint)">{points[0].date}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize={11} fill="var(--color-ink-faint)">{points.at(-1)!.date}</text>
      </svg>
      <p className="mt-1 text-xs text-ink-faint">100 means top of the class in that exam. Tap or hover to see each exam.</p>
    </figure>
  );
}
