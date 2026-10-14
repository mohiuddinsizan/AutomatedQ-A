"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { askQuestion, type QaFormState } from "@/app/actions/qa";
import { Alert } from "./ui";
import { Icon } from "./icons";
import { AnswerProgress } from "./AnswerProgress";
import { compressImage as compress } from "@/lib/image-client";
import { useVoiceRecorder, mmss } from "./useVoiceRecorder";

type Course = { id: number; name: string; qa: number };
type Subject = { id: number; name: string };

const MAX_PHOTOS = 3;
const MAX_SECONDS = 120;


export function AskForm({
  courses, subjects, defaultCourse, chargeNote, needsQuota,
}: {
  courses: Course[];
  subjects: Record<number, Subject[]>;
  defaultCourse: number;
  chargeNote: string;
  needsQuota: boolean;
}) {
  const [state, action, pending] = useActionState<QaFormState, FormData>(askQuestion, undefined);
  const [courseId, setCourseId] = useState(defaultCourse);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const voice = useVoiceRecorder(MAX_SECONDS);
  const { audio, recording, elapsed, error: micError } = voice;
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const course = courses.find((c) => c.id === courseId);
  const hasMedia = photos.length > 0 || audio !== null;
  const outOfQuestions = needsQuota && (course?.qa ?? 0) <= 0;
  const ready = !recording && (text.trim().length > 0 || hasMedia) && !outOfQuestions;
  const courseSubjects = (subjects[courseId] ?? []).filter((x) => x.name !== "General");

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    const shrunk = await Promise.all(picked.map(compress));
    setPhotos((p) => [...p, ...shrunk.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    const fd = new FormData(e.currentTarget);
    photos.forEach((p, i) => fd.append("images", p.blob, `photo-${i + 1}.jpg`));
    voice.appendTo(fd);
    startTransition(() => action(fd));
  }

  if (pending) return <AnswerProgress mode={hasMedia ? "read" : "answer"} />;

  const chip = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors
     ${active ? "btn-primary border-transparent" : "border-rule bg-sheet text-ink-soft shadow-sm hover:border-brand-indigo/40 hover:text-pen"}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="subjectId" value={subjectId ?? ""} />

      {/* Course */}
      {courses.length > 1 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Course</p>
          <div className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <button key={c.id} type="button" onClick={() => { setCourseId(c.id); setSubjectId(null); }} className={chip(c.id === courseId)}>
                {c.name} <span className={`text-xs ${c.id === courseId ? "text-white/75" : "text-ink-faint"}`}>{c.qa} left</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="brand-hero flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-white">
          <span className="font-semibold">{course?.name}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">{course?.qa ?? 0} questions left</span>
        </div>
      )}

      {/* Subject */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Subject</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSubjectId(null)} className={chip(subjectId === null)}>
            <Icon name="sparkle" className="size-4" /> Detect for me
          </button>
          {courseSubjects.map((x) => (
            <button key={x.id} type="button" onClick={() => setSubjectId(x.id)} className={chip(subjectId === x.id)}>{x.name}</button>
          ))}
        </div>
      </div>

      {/* Question */}
      <div>
        <label htmlFor="text" className="mb-2 block text-sm font-semibold text-ink">Your question</label>
        <div className="rounded-xl border-2 border-rule bg-sheet transition-colors focus-within:border-pen">
          <textarea id="text" name="text" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="বাংলা বা English, যেভাবে সুবিধা লিখো। যেমন: একটি বস্তুর ভর 5 kg, 20 N বল প্রয়োগ করলে ত্বরণ কত?"
            className="block w-full resize-y rounded-xl bg-transparent px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none" />
          <div className="flex items-center justify-between border-t border-rule px-4 py-2 text-xs text-ink-faint">
            <span>Write the full question, with numbers and options</span>
            <span>{text.length}/2000</span>
          </div>
        </div>
      </div>

      {/* Photo and voice */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Or show / tell us <span className="font-normal text-ink-faint">— optional</span></p>
        <div className="grid grid-cols-2 gap-3">
          <input ref={fileInput} type="file" accept="image/*" multiple capture="environment" className="sr-only" id="photo"
            onChange={(e) => addPhotos(e.target.files)} disabled={photos.length >= MAX_PHOTOS} />
          <label htmlFor="photo"
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-rule bg-sheet p-4 text-center transition-colors hover:border-pen/50 hover:bg-pen-soft
              ${photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-50" : ""}`}>
            <span className="chip-navy grid size-12 place-items-center rounded-2xl"><Icon name="camera" className="size-6" /></span>
            <span className="font-semibold text-ink">Photo</span>
            <span className="text-xs text-ink-soft">{photos.length ? `${photos.length} of ${MAX_PHOTOS} added` : "Snap the question"}</span>
          </label>

          {recording ? (
            <button type="button" onClick={voice.stop}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-brand-red bg-brand-red/5 p-4 text-center">
              <span className="relative grid size-11 place-items-center rounded-full bg-brand-red text-white">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-red/40" aria-hidden />
                <Icon name="stop" className="relative size-5" />
              </span>
              <span className="font-semibold text-brand-red">Stop · {mmss(elapsed)}</span>
              <span className="text-xs text-ink-soft">Up to {mmss(MAX_SECONDS)}</span>
            </button>
          ) : (
            <button type="button" onClick={voice.start} disabled={audio !== null}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-rule bg-sheet p-4 text-center transition-colors hover:border-brand-orange/60 hover:bg-brand-orange/5 disabled:opacity-50">
              <span className="chip-orange grid size-12 place-items-center rounded-2xl"><Icon name="mic" className="size-6" /></span>
              <span className="font-semibold text-ink">Voice note</span>
              <span className="text-xs text-ink-soft">{audio ? "Recorded" : "Just say it"}</span>
            </button>
          )}
        </div>
        {micError && <p className="mt-2 text-sm text-error">{micError}</p>}

        {photos.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="size-24 rounded-lg border border-rule object-cover shadow-sm" />
                <button type="button" aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setPhotos((all) => all.filter((x) => x.url !== p.url))}
                  className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ink text-white shadow">×</button>
              </li>
            ))}
          </ul>
        )}
        {audio && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rule bg-paper p-2">
            <audio src={audio.url} controls className="h-10 min-w-0 flex-1" />
            <button type="button" aria-label="Delete voice note" onClick={voice.clear}
              className="grid size-10 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-sheet hover:text-error"><Icon name="trash" /></button>
          </div>
        )}
        {hasMedia && (
          <p className="mt-3 flex gap-2 rounded-lg bg-brand-orange/10 px-3 py-2 text-sm text-ink">
            <Icon name="sparkle" className="mt-0.5 size-4 shrink-0 text-brand-orange" />
            We&apos;ll write out your question from the {audio ? "voice note" : "photo"} first, so you can check it before it&apos;s answered.
          </p>
        )}
      </div>

      {state?.error && <Alert>{state.error}</Alert>}
      {outOfQuestions && <Alert tone="warn">You have no questions left in this course. Contact the office to get more.</Alert>}

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={!ready}
          className="btn-accent inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto sm:px-12">
          <Icon name="sparkle" /> {hasMedia ? "Read my question" : "Get my answer"}
        </button>
        <p className="text-sm text-ink-soft">{chargeNote}</p>
      </div>
    </form>
  );
}
