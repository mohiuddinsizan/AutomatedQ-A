import type { Thread } from "@/lib/qa";
import { STATUS_LABEL } from "@/lib/qa";
import { fmtDateTime } from "@/lib/format";
import { Badge, Stars, type BadgeTone } from "./ui";
import { RichText } from "./RichText";
import { Icon } from "./icons";

const TONE: Record<Thread["status"], BadgeTone> = {
  draft: "amber", awaiting_ai: "amber", ai_answered: "blue", escalated: "amber",
  teacher_claimed: "blue", answered: "blue", resolved: "green", closed_timeout: "neutral",
};

export function StatusBadge({ status }: { status: Thread["status"] }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

type Viewer = "student" | "staff";
type Message = Thread["messages"][number];

/** Where the question is in its life: asked → AI answer → teacher (only if needed) → solved. */
export function QuestionProgress({ thread }: { thread: Thread }) {
  const s = thread.status;
  const wentToTeacher = Boolean(thread.escalatedAt) || ["escalated", "teacher_claimed", "answered"].includes(s);
  const steps = [
    { label: "Asked", done: s !== "draft", current: s === "draft" },
    { label: "AI answer", done: !["draft", "awaiting_ai"].includes(s), current: s === "awaiting_ai" || s === "ai_answered" },
    ...(wentToTeacher ? [{ label: "Teacher", done: ["answered", "resolved", "closed_timeout"].includes(s), current: ["escalated", "teacher_claimed", "answered"].includes(s) }] : []),
    { label: "Solved", done: s === "resolved" || s === "closed_timeout", current: false },
  ];
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((st, i) => (
        <li key={st.label} className="relative flex flex-col items-center gap-1.5 text-center">
          {i < steps.length - 1 && (
            <span className={`absolute top-3.5 left-1/2 h-0.5 w-full ${st.done ? "bg-ok" : "bg-rule"}`} aria-hidden />
          )}
          <span className={`relative grid size-7 place-items-center rounded-full text-xs font-bold
            ${st.done ? "bg-ok text-white" : st.current ? "bg-brand-orange text-white ring-4 ring-brand-orange/20" : "bg-rule text-ink-faint"}`}>
            {st.done ? "✓" : i + 1}
          </span>
          <span className={`text-xs font-semibold sm:text-sm ${st.done || st.current ? "text-ink" : "text-ink-faint"}`}>{st.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Files({ files, onDark }: { files: Message["files"]; onDark?: boolean }) {
  if (!files.length) return null;
  const images = files.filter((f) => f.kind === "image");
  const audio = files.filter((f) => f.kind === "audio");
  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${f.id}`} alt={`Attached photo ${i + 1}`} loading="lazy"
                className="max-h-56 w-auto max-w-full rounded-lg border border-white/20 bg-white object-contain sm:max-h-72" />
            </a>
          ))}
        </div>
      )}
      {audio.map((f) => (
        <div key={f.id} className={`rounded-lg p-1.5 ${onDark ? "bg-white/15" : "bg-paper"}`}>
          {/* Browser recordings often carry no length, so the player shows 0:00; show the real one. */}
          <p className={`px-1.5 pb-1 text-xs font-semibold ${onDark ? "text-white/80" : "text-ink-soft"}`}>
            🎙 Voice note{f.durationSec ? ` · ${Math.floor(f.durationSec / 60)}:${String(f.durationSec % 60).padStart(2, "0")}` : ""}
          </p>
          <audio src={`/api/files/${f.id}`} controls preload="metadata" className="h-10 w-full" />
          {f.transcript && (
            <details className="mt-1 px-1.5 text-sm">
              <summary className={`cursor-pointer ${onDark ? "text-white/80" : "text-ink-soft"}`}>What you said</summary>
              <p className="mt-1">{f.transcript}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function Avatar({ type, name }: { type: Message["senderType"]; name: string }) {
  if (type === "ai") {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-orange to-brand-red text-white shadow-sm">
        <Icon name="sparkle" className="size-5" />
      </span>
    );
  }
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white shadow-sm ${type === "student" ? "bg-pen" : "bg-ok"}`}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The conversation as chat bubbles. For the student, their own messages sit on the
 * right; AI and teacher replies on the left. Staff see it the other way round.
 */
export function ThreadView({ thread, viewer }: { thread: Thread; viewer: Viewer }) {
  const [first] = thread.messages;
  const understood = thread.question && first && first.files.length > 0 && thread.question.trim() !== (first.body ?? "").trim();

  return (
    <div className="flex flex-col gap-5">
      {thread.messages.map((m, i) => {
        const fromStudent = m.senderType === "student";
        const mine = viewer === "student" ? fromStudent : !fromStudent;
        const name = fromStudent ? thread.studentName
          : m.senderType === "ai" ? "AI tutor" : m.senderName ?? (m.senderType === "admin" ? "Admin" : "Teacher");
        const label = fromStudent ? (viewer === "student" ? "You" : `${thread.studentName} · ${thread.studentRoll}`)
          : m.senderType === "ai" ? "AI tutor" : `${name} · ${m.senderType === "admin" ? "Admin" : "Teacher"}`;

        const bubble = fromStudent
          ? (mine ? "bg-pen text-white rounded-tr-sm" : "bg-sheet border border-rule text-ink rounded-tl-sm")
          : m.senderType === "ai"
            ? "bg-sheet text-ink border border-brand-orange/30 shadow-[0_8px_24px_-16px_rgb(247_148_29/0.6)] rounded-tl-sm"
            : "bg-sheet text-ink border border-ok/30 shadow-[0_8px_24px_-16px_rgb(21_128_61/0.5)] rounded-tl-sm";

        return (
          <article key={m.id} className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
            <Avatar type={m.senderType} name={name} />
            <div className={`flex min-w-0 max-w-[88%] flex-col sm:max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
              <div className={`mb-1 flex flex-wrap items-center gap-x-2 text-xs ${mine ? "justify-end" : ""}`}>
                <span className={`font-semibold ${m.senderType === "ai" ? "text-brand-orange" : m.senderType === "student" ? "text-pen" : "text-ok"}`}>{label}</span>
                <span className="text-ink-faint">{fmtDateTime(m.createdAt)}</span>
              </div>
              <div className={`w-full rounded-2xl px-4 py-3 ${bubble}`}>
                {m.body && (fromStudent
                  ? <p className="whitespace-pre-line [overflow-wrap:anywhere]">{m.body}</p>
                  : <RichText text={m.body} />)}
                <Files files={m.files} onDark={fromStudent && mine} />
                {i === 0 && understood && thread.status !== "draft" && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${mine ? "bg-white/15" : "bg-paper"}`}>
                    <p className={mine ? "text-white/70" : "text-ink-faint"}>Question as answered</p>
                    <p className="mt-0.5 whitespace-pre-line">{thread.question}</p>
                  </div>
                )}
              </div>
              {!fromStudent && (m.rating || m.ratingNote) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  {m.rating && <Stars value={m.rating} />}
                  {m.ratingNote && <span>“{m.ratingNote}”</span>}
                </div>
              )}
              {m.senderType === "ai" && viewer === "staff" && m.aiMeta && (
                <p className="mt-1 text-xs text-ink-faint">
                  {String(m.aiMeta.model ?? "")} · {String(m.aiMeta.inputTokens ?? "?")} in / {String(m.aiMeta.outputTokens ?? "?")} out tokens
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
