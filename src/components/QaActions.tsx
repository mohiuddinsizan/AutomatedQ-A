"use client";

import { startTransition, useActionState, useState } from "react";
import { confirmQuestion, retryAnswer, rateReply, replyThread, discardDraft, forwardToTeacher, type QaFormState } from "@/app/actions/qa";
import { Alert, Button } from "./ui";
import { Icon } from "./icons";
import { AnswerProgress } from "./AnswerProgress";
import { useVoiceRecorder, mmss } from "./useVoiceRecorder";

function Thinking({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-pen/20 bg-pen-soft px-4 py-3 text-ink" role="status">
      <span className="thinking flex gap-1 text-2xl leading-none text-pen" aria-hidden><span>•</span><span>•</span><span>•</span></span>
      {children}
    </div>
  );
}

/** Lets the student correct the AI's reading of a voice note or photo before it's answered. */
export function ConfirmForm({ threadId, question }: { threadId: number; question: string }) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(confirmQuestion, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      <div>
        <label htmlFor="question" className="text-lg font-semibold text-ink">Is this your question?</label>
        <p className="text-sm text-ink-soft">We wrote it out from your photo or voice note. Fix anything that&apos;s wrong, then confirm.</p>
      </div>
      <textarea id="question" name="question" defaultValue={question} rows={5} maxLength={2000}
        className="rounded-xl border-2 border-brand-orange/40 bg-sheet px-4 py-3 text-base leading-relaxed text-ink focus:border-pen focus:outline-none" />
      {state?.error && <Alert>{state.error}</Alert>}
      {pending ? <AnswerProgress mode="answer" /> : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit"><Icon name="check" /> Yes, answer this</Button>
          {/* Same form, different action: one form can't sit inside another. */}
          <Button type="submit" variant="ghost" formAction={discardDraft} formNoValidate>Discard</Button>
        </div>
      )}
    </form>
  );
}

export function RetryForm({ threadId }: { threadId: number }) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(retryAnswer, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      {state?.error && <Alert>{state.error}</Alert>}
      {pending ? <AnswerProgress mode="answer" /> : (
        <>
          <p className="text-ink-soft">Your question was received but the answer didn&apos;t come through. You won&apos;t be charged again.</p>
          <div><Button type="submit"><Icon name="refresh" /> Try again</Button></div>
        </>
      )}
    </form>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const labels = ["", "Not helpful", "Poor", "Okay", "Good", "Excellent"];
  return (
    <fieldset>
      <legend className="text-lg font-semibold text-ink">Did this answer help you?</legend>
      <div className="mt-1 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span className={`grid size-12 place-items-center rounded-lg text-4xl leading-none transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-pen
              ${n <= value ? "scale-110 text-gold" : "text-rule hover:scale-105 hover:text-gold/60"}`} aria-hidden>★</span>
            <span className="sr-only">{n} star{n > 1 ? "s" : ""} — {labels[n]}</span>
          </label>
        ))}
        <span className="ml-2 text-sm text-ink-soft">{labels[value]}</span>
      </div>
    </fieldset>
  );
}

/** Rate the latest reply, then either settle the question or take it further. */
export function RateForm({ threadId, stage, alreadyRated }: { threadId: number; stage: "ai" | "teacher"; alreadyRated: boolean }) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(rateReply, undefined);
  const [rating, setRating] = useState(0);
  const [more, setMore] = useState(false);

  if (state?.ok) return <Alert tone="ok">{state.ok}</Alert>;

  function send(decision: string, e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form!;
    const fd = new FormData(form);
    fd.set("decision", decision);
    startTransition(() => action(fd));
  }

  const forward = stage === "ai" ? "escalate" : "followup";
  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <input type="hidden" name="threadId" value={threadId} />
      {!alreadyRated && <StarInput value={rating} onChange={setRating} />}

      {more && (
        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-sm font-medium text-ink">
            {stage === "ai" ? "What's still unclear? (optional, helps the teacher)" : "What's still unclear?"}
          </label>
          <textarea id="note" name="note" rows={3} maxLength={1000} autoFocus
            className="rounded-md border border-rule bg-sheet px-3 py-2.5 text-base text-ink focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/20" />
        </div>
      )}

      {state?.error && <Alert>{state.error}</Alert>}
      {pending ? <Thinking>Saving…</Thinking> : (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {!more ? (
            <>
              <Button type="button" onClick={(e) => send("resolved", e)} disabled={!alreadyRated && !rating}
                className="!bg-ok hover:!bg-ok/90">
                <Icon name="check" /> Yes, it&apos;s solved
              </Button>
              <Button type="button" variant="secondary" onClick={() => setMore(true)} disabled={!alreadyRated && !rating}>
                <Icon name="teacher" /> {stage === "ai" ? "Ask a teacher" : "Still unclear — reply"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={(e) => send(forward, e)}>
                {stage === "ai" ? "Send to a teacher" : "Send to teacher"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMore(false)}>Back</Button>
            </>
          )}
        </div>
      )}
      {!alreadyRated && !rating && <p className="-mt-2 text-xs text-ink-faint">Rate the answer first.</p>}
    </form>
  );
}

/** Teacher / admin reply: text, a voice note, photos of a worked solution, or any mix. */
export function ReplyForm({ threadId }: { threadId: number }) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(replyThread, undefined);
  const voice = useVoiceRecorder(180);
  const [text, setText] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (voice.recording) return;
    const fd = new FormData(e.currentTarget);
    voice.appendTo(fd);
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="threadId" value={threadId} />
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-semibold text-ink">Your reply</label>
        <textarea id="body" name="body" rows={6} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Explain step by step — Bangla, English or both. Or record a voice explanation below."
          className="w-full rounded-xl border border-rule bg-sheet px-4 py-3 text-base leading-relaxed text-ink focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {voice.recording ? (
          <button type="button" onClick={voice.stop}
            className="flex items-center gap-3 rounded-xl border-2 border-brand-red bg-brand-red/5 p-3 text-left">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-brand-red text-white">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-red/40" aria-hidden />
              <Icon name="stop" className="relative size-5" />
            </span>
            <span><span className="block font-semibold text-brand-red">Stop · {mmss(voice.elapsed)}</span>
              <span className="text-xs text-ink-soft">Up to {mmss(voice.maxSeconds)}</span></span>
          </button>
        ) : voice.audio ? (
          <div className="flex items-center gap-2 rounded-xl border border-rule bg-paper p-2">
            <audio src={voice.audio.url} controls className="h-10 min-w-0 flex-1" />
            <button type="button" aria-label="Delete voice note" onClick={voice.clear}
              className="grid size-10 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-sheet hover:text-error"><Icon name="trash" /></button>
          </div>
        ) : (
          <button type="button" onClick={voice.start}
            className="flex items-center gap-3 rounded-xl border-2 border-dashed border-rule bg-sheet p-3 text-left transition-colors hover:border-brand-orange/60 hover:bg-brand-orange/5">
            <span className="chip-orange grid size-11 shrink-0 place-items-center rounded-xl"><Icon name="mic" className="size-6" /></span>
            <span><span className="block font-semibold text-ink">Record a voice reply</span>
              <span className="text-xs text-ink-soft">Explain it the way you would in class</span></span>
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-rule bg-sheet p-3 transition-colors hover:border-brand-indigo/50 hover:bg-pen-soft">
          <span className="chip-navy grid size-11 shrink-0 place-items-center rounded-xl"><Icon name="camera" className="size-6" /></span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">Photos of the solution</span>
            <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple
              className="mt-0.5 block w-full text-xs text-ink-soft file:mr-2 file:rounded-md file:border-0 file:bg-pen-soft file:px-2 file:py-1 file:text-pen" />
          </span>
        </label>
      </div>
      {voice.error && <p className="text-sm text-error">{voice.error}</p>}

      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.ok}</Alert>}
      <div>
        <Button type="submit" variant="accent" disabled={pending || voice.recording || (!text.trim() && !voice.audio)}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}

/** Sends the question as it is (photo, voice and all) to a teacher. */
export function ForwardForm({ threadId, compact = false }: { threadId: number; compact?: boolean }) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(forwardToTeacher, undefined);
  const [open, setOpen] = useState(!compact);
  if (state?.ok) return <Alert tone="ok">{state.ok}</Alert>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-pen hover:underline">
        <Icon name="teacher" className="size-4" /> Or send it straight to a teacher
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor={`note-${threadId}`} className="text-sm font-semibold text-ink">Anything to add for the teacher? <span className="font-normal text-ink-faint">(optional)</span></label>
      <textarea id={`note-${threadId}`} name="note" rows={2} maxLength={1000} placeholder="e.g. প্রশ্নটা ছবির চিত্রের উপর, চিত্রটা দেখে বুঝিয়ে দিন"
        className="rounded-xl border border-rule bg-sheet px-4 py-3 text-base text-ink focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15" />
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={pending}><Icon name="teacher" /> {pending ? "Sending…" : "Send to a teacher"}</Button>
        <span className="text-sm text-ink-soft">Uses one question. The teacher sees your photo and hears your voice note.</span>
      </div>
    </form>
  );
}

/**
 * When the AI tutor couldn't handle a question: say why, and offer the way forward
 * instead of a dead end — a teacher, another try, or discard.
 */
export function AiIssuePanel({ threadId, verdict, note, question }: { threadId: number; verdict: string; note: string | null; question: string }) {
  const [retry, setRetry] = useState(false);
  const offTopic = verdict === "off_topic";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3 rounded-xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/12 to-transparent p-4">
        <span className="chip-orange grid size-11 shrink-0 place-items-center rounded-xl"><Icon name="sparkle" className="size-6" /></span>
        <div>
          <p className="font-bold text-ink">
            {offTopic ? "The AI tutor didn't recognise this as a study question" : "The AI tutor couldn't make this out clearly"}
          </p>
          {note && <p className="mt-1 text-ink">{note}</p>}
          <p className="mt-1 text-sm text-ink-soft">
            {offTopic ? "If it is a study question, a teacher can answer it." : "A teacher can look at your photo and listen to your voice note, so they can still help."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-rule p-4">
        <p className="mb-3 font-semibold text-ink">1. Send it to a teacher</p>
        <ForwardForm threadId={threadId} />
      </div>

      <div className="rounded-xl border border-rule p-4">
        <p className="mb-1 font-semibold text-ink">2. Or write it out and let the AI try again</p>
        {retry ? (
          <div className="mt-3"><ConfirmForm threadId={threadId} question={question} /></div>
        ) : (
          <button type="button" onClick={() => setRetry(true)} className="mt-1 text-sm font-semibold text-pen hover:underline">Type the question</button>
        )}
      </div>

      <form action={discardDraft}>
        <input type="hidden" name="threadId" value={threadId} />
        <Button type="submit" variant="ghost" size="sm">Discard this question</Button>
      </form>
    </div>
  );
}
