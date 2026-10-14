"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { setStudentQuota, type AdminFormState } from "@/app/actions/admin";
import { Button } from "./ui";

function Stepper({ label, name, value, onChange, presets }: {
  label: string; name: string; value: number; onChange: (n: number) => void; presets: { label: string; to: (n: number) => number }[];
}) {
  const set = (n: number) => onChange(Math.max(0, Math.min(999, n)));
  const btn = "grid size-11 place-items-center rounded-xl text-xl font-bold transition active:scale-95";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-soft">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`One less ${label}`} onClick={() => set(value - 1)} className={`${btn} bg-paper text-ink ring-1 ring-rule hover:bg-pen-soft`}>−</button>
        <input name={name} type="number" inputMode="numeric" min={0} max={999} value={value} aria-label={label}
          onChange={(e) => set(Number(e.target.value) || 0)}
          className="h-11 w-20 rounded-xl border border-rule bg-sheet text-center text-xl font-bold text-ink focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15" />
        <button type="button" aria-label={`One more ${label}`} onClick={() => set(value + 1)} className={`${btn} chip-navy`}>+</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => set(p.to(value))}
            className="rounded-lg bg-paper px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-rule hover:bg-pen-soft hover:text-pen">
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One student's Q&A and mentor-session allowance in one course: tap, then save. */
export function AllowanceEditor({ studentId, courseId, qa, sessions }: { studentId: number; courseId: number; qa: number; sessions: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(setStudentQuota, undefined);
  const [q, setQ] = useState(qa);
  const [m, setM] = useState(sessions);
  const [saved, setSaved] = useState({ qa, sessions });
  const sent = useRef(saved);
  const changed = q !== saved.qa || m !== saved.sessions;

  // Only once the server confirms do the sent numbers count as saved.
  useEffect(() => {
    if (state?.ok) setSaved(sent.current);
  }, [state]);

  return (
    <form action={(fd) => { sent.current = { qa: q, sessions: m }; action(fd); }} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="courseId" value={courseId} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Stepper label="Q&A left" name="qa" value={q} onChange={setQ}
          presets={[{ label: "+5", to: (n) => n + 5 }, { label: "+10", to: (n) => n + 10 }, { label: "Set 20", to: () => 20 }, { label: "Set 0", to: () => 0 }]} />
        <Stepper label="Mentor sessions left" name="sessions" value={m} onChange={setM}
          presets={[{ label: "+1", to: (n) => n + 1 }, { label: "+2", to: (n) => n + 2 }, { label: "Set 0", to: () => 0 }]} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={!changed || pending} variant={changed ? "accent" : "secondary"}>
          {pending ? "Saving…" : changed ? "Save changes" : "Saved"}
        </Button>
        {changed && <button type="button" onClick={() => { setQ(saved.qa); setM(saved.sessions); }} className="text-sm text-ink-soft hover:text-ink">Undo</button>}
        {state?.error && <span className="text-sm text-error">{state.error}</span>}
        {state?.ok && !changed && <span className="text-sm font-medium text-ok">✓ {state.ok}</span>}
      </div>
    </form>
  );
}
