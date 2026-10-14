"use client";

import { useActionState, useState } from "react";
import { scheduleSession, type MentorFormState } from "@/app/actions/mentor";
import { MENTOR_SLOTS } from "@/lib/constants";
import { Alert, Field, TextArea } from "./ui";
import { SubmitButton } from "./ActionForm";

export type MentorTeacher = { id: number; name: string; phone: string | null; teachesCourse: boolean; upcoming: number };

const inputClass = "h-12 w-full rounded-md border border-rule bg-sheet px-3 text-base text-ink focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/20";

/**
 * Pick a mentor (one of our teachers, or someone else), a date, and one of the
 * usual evening slots or a custom time.
 */
export function ScheduleForm({
  sessionId, teachers, rescheduling, defaults, today,
}: {
  sessionId: number;
  teachers: MentorTeacher[];
  rescheduling: boolean;
  today: string;
  defaults: { teacherId: number | null; name: string; phone: string; date: string; time: string; message: string };
}) {
  const [state, action] = useActionState<MentorFormState, FormData>(scheduleSession, undefined);
  const [who, setWho] = useState<string>(defaults.teacherId ? String(defaults.teacherId) : defaults.name ? "other" : "");
  const isSlot = MENTOR_SLOTS.some((s) => s.value === defaults.time);
  const [time, setTime] = useState(defaults.time || MENTOR_SLOTS[0].value);
  const [custom, setCustom] = useState(Boolean(defaults.time) && !isSlot);

  const teacher = teachers.find((t) => String(t.id) === who);
  const mine = teachers.filter((t) => t.teachesCourse);
  const others = teachers.filter((t) => !t.teachesCourse);
  const slotClass = (on: boolean) =>
    `h-11 whitespace-nowrap rounded-lg border px-2 text-sm font-semibold transition-colors ${on ? "border-pen bg-pen text-white shadow-sm" : "border-rule bg-sheet text-ink hover:border-pen/40 hover:bg-pen-soft"}`;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={sessionId} />
      <input type="hidden" name="time" value={time} />

      <div className="flex flex-col gap-1">
        <label htmlFor="mentorTeacherId" className="text-sm font-medium text-ink">Mentor</label>
        <select id="mentorTeacherId" name="mentorTeacherId" required value={who} onChange={(e) => setWho(e.target.value)} className={inputClass}>
          <option value="" disabled>Choose a teacher…</option>
          {mine.length > 0 && (
            <optgroup label="Teaches this course">
              {mine.map((t) => <option key={t.id} value={t.id}>{t.name}{t.upcoming ? ` · ${t.upcoming} upcoming` : ""}</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other teachers">
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}{t.upcoming ? ` · ${t.upcoming} upcoming` : ""}</option>)}
            </optgroup>
          )}
          <option value="other">Someone else (not a teacher here)</option>
        </select>
        {teacher && <p className="text-sm text-ink-soft">They&apos;ll see this session under &ldquo;Assigned sessions&rdquo; in the teacher portal.</p>}
      </div>

      {who === "other" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mentor's name" name="mentorName" required defaultValue={defaults.teacherId ? "" : defaults.name} />
          <Field label="Mentor's WhatsApp" name="mentorPhone" required inputMode="tel" defaultValue={defaults.teacherId ? "" : defaults.phone} placeholder="01712345678" />
        </div>
      )}
      {teacher && (teacher.phone ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm">
          <span className="text-ink-soft">WhatsApp from their profile</span>
          <span className="font-semibold text-ink">{teacher.phone}</span>
        </div>
      ) : (
        <Field key={teacher.id} label={`${teacher.name}'s WhatsApp`} name="mentorPhone" required inputMode="tel" placeholder="01712345678"
          hint="No number is saved for this teacher. Enter it here; it will be saved to their profile." />
      ))}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:w-60">
          <label htmlFor="date" className="text-sm font-medium text-ink">Date</label>
          <input id="date" name="date" type="date" required min={today} defaultValue={defaults.date || today} className={inputClass} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Time (Bangladesh)</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {MENTOR_SLOTS.map((slot) => (
              <button key={slot.value} type="button" aria-pressed={!custom && time === slot.value}
                onClick={() => { setCustom(false); setTime(slot.value); }} className={slotClass(!custom && time === slot.value)}>
                {slot.label}
              </button>
            ))}
            <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={slotClass(custom)}>Custom</button>
          </div>
          {custom && (
            <input type="time" aria-label="Custom time" required value={time} onChange={(e) => setTime(e.target.value)}
              className={`mt-2 ${inputClass} sm:w-48`} />
          )}
        </fieldset>
      </div>

      <TextArea label="Message to the student" name="adminMessage" rows={3} defaultValue={defaults.message} />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.ok}</Alert>}
      <div><SubmitButton pending="Saving…">{rescheduling ? "Update schedule" : "Schedule session"}</SubmitButton></div>
    </form>
  );
}
