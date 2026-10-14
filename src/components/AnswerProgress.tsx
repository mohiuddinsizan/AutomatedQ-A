"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const STEPS = {
  read: ["Uploading", "Reading your photo / voice", "Writing out the question"],
  answer: ["Reading your question", "Working it out", "Writing a clear answer"],
} as const;

/** Shown while the AI works (a few seconds), so the wait feels like progress, not a freeze. */
export function AnswerProgress({ mode }: { mode: keyof typeof STEPS }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS[mode].length - 1)), 2200);
    return () => clearInterval(t);
  }, [mode]);

  return (
    <div className="brand-hero overflow-hidden rounded-2xl p-6 text-white sm:p-8" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative grid size-12 place-items-center rounded-full bg-white/15">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-orange/40" aria-hidden />
          <Icon name="sparkle" className="relative size-6 text-brand-orange" />
        </span>
        <div>
          <p className="text-lg font-semibold">{mode === "read" ? "Reading your question…" : "Your answer is on its way…"}</p>
          <p className="text-sm text-white/70">This usually takes a few seconds. Please keep this page open.</p>
        </div>
      </div>
      <ol className="mt-6 space-y-3">
        {STEPS[mode].map((label, i) => (
          <li key={label} className={`flex items-center gap-3 transition-opacity ${i <= step ? "opacity-100" : "opacity-40"}`}>
            <span className={`grid size-6 place-items-center rounded-full text-xs font-bold
              ${i < step ? "bg-ok text-white" : i === step ? "bg-brand-orange text-white" : "bg-white/15 text-white"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            {label}
            {i === step && <span className="thinking ml-1 flex gap-0.5" aria-hidden><span>•</span><span>•</span><span>•</span></span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
