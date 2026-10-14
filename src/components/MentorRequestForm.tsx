"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { requestSession, type MentorFormState } from "@/app/actions/mentor";
import { compressImage } from "@/lib/image-client";
import { MENTOR_MAX_PHOTOS } from "@/lib/constants";
import { Alert, Button, Field, Select, TextArea } from "./ui";
import { Icon } from "./icons";

type Subject = { id: number; name: string };

export function MentorRequestForm({
  courses, subjects, defaultCourse, phone,
}: {
  courses: { id: number; name: string; left: number }[];
  subjects: Record<number, Subject[]>;
  defaultCourse: number;
  phone: string;
}) {
  const [state, action, pending] = useActionState<MentorFormState, FormData>(requestSession, undefined);
  const [courseId, setCourseId] = useState(defaultCourse);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const left = courses.find((c) => c.id === courseId)?.left ?? 0;

  async function add(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, MENTOR_MAX_PHOTOS - photos.length);
    const shrunk = await Promise.all(picked.map(compressImage));
    setPhotos((p) => [...p, ...shrunk.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("picker");
    photos.forEach((p, i) => fd.append("images", p.blob, `problem-${i + 1}.jpg`));
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Course" name="courseId" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}
          hint={`${left} session${left === 1 ? "" : "s"} left in this course`}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Subject" name="subjectId" key={courseId} required defaultValue="">
          <option value="" disabled>Choose a subject</option>
          {(subjects[courseId] ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </div>
      <Field label="Topic" name="topic" required maxLength={200} placeholder="e.g. Projectile motion, জারণ-বিজারণ" />
      <TextArea label="Where are you stuck?" name="problem" required rows={5} maxLength={2000}
        placeholder="Describe what you don't understand and what you've already tried."
        hint="The more specific you are, the better the mentor can prepare." />

      <div>
        <p className="text-sm font-medium text-ink">Photos of the problem <span className="font-normal text-ink-faint">(optional, up to {MENTOR_MAX_PHOTOS})</span></p>
        <p className="mb-2 text-sm text-ink-soft">Your notes, a book page, or the question you couldn&apos;t solve.</p>
        <input ref={input} id="picker" name="picker" type="file" accept="image/*" multiple className="sr-only"
          onChange={(e) => add(e.target.files)} disabled={photos.length >= MENTOR_MAX_PHOTOS} />
        <ul className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <li key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-24 rounded-lg border border-rule object-cover shadow-sm" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((all) => all.filter((x) => x.url !== p.url))}
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ink text-white shadow">×</button>
            </li>
          ))}
          {photos.length < MENTOR_MAX_PHOTOS && (
            <li>
              <label htmlFor="picker"
                className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-rule bg-sheet text-center text-xs text-ink-soft transition-colors hover:border-pen/50 hover:bg-pen-soft hover:text-pen">
                <Icon name="camera" className="size-6" />
                {busy ? "Adding…" : photos.length ? `Add (${photos.length}/${MENTOR_MAX_PHOTOS})` : "Add photo"}
              </label>
            </li>
          )}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When suits you? (optional)" name="preferredTime" maxLength={200} placeholder="e.g. Weekdays after 7 pm" />
        <Field label="Your WhatsApp number" name="contactPhone" required inputMode="tel" defaultValue={phone}
          hint="The mentor will contact you on this number." />
      </div>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button type="submit" disabled={pending || busy}>{pending ? "Sending…" : "Send request"}</Button>
        <p className="text-sm text-ink-soft">Uses one session. If the office cancels it, you get it back.</p>
      </div>
    </form>
  );
}
