import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { studentCourses, availableCourses } from "@/lib/results";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { ContactButtons } from "@/components/Brand";
import { Icon } from "@/components/icons";

export const metadata = { title: "Home" };

const TODO: Record<string, string> = {
  draft: "Check the question and confirm it",
  awaiting_ai: "The answer didn't arrive — tap to try again",
  answered: "A teacher replied — rate the reply",
  ai_answered: "Your answer is ready — rate it",
};

export default async function StudentHome() {
  const user = await requirePortal("student");
  const s = schema;

  const [courses, available, todo, upcoming] = await Promise.all([
    studentCourses(user.id),
    availableCourses(user.id),
    db.select({ id: s.qaThreads.id, status: s.qaThreads.status, question: s.qaThreads.question, updatedAt: s.qaThreads.updatedAt })
      .from(s.qaThreads)
      .where(and(eq(s.qaThreads.studentId, user.id), inArray(s.qaThreads.status, ["draft", "ai_answered", "answered", "awaiting_ai"])))
      .orderBy(desc(s.qaThreads.updatedAt)).limit(4),
    db.select({ id: s.mentorSessions.id, topic: s.mentorSessions.topic, scheduledAt: s.mentorSessions.scheduledAt, mentorName: s.mentorSessions.mentorName })
      .from(s.mentorSessions)
      .where(and(eq(s.mentorSessions.studentId, user.id), eq(s.mentorSessions.status, "scheduled"), sql`${s.mentorSessions.scheduledAt} > now() - interval '3 hours'`))
      .orderBy(s.mentorSessions.scheduledAt).limit(2),
  ]);

  const active = courses.filter((c) => c.active);
  const past = courses.filter((c) => !c.active && c.examsSat > 0);
  const qaLeft = active.reduce((n, c) => n + (c.qa ?? 0), 0);
  const sessionsLeft = active.reduce((n, c) => n + (c.sessions ?? 0), 0);

  return (
    <>
      {/* Welcome banner */}
      <section className="brand-hero rise relative -mx-4 -mt-6 overflow-hidden px-5 py-8 text-white shadow-[0_24px_50px_-24px_rgb(20_22_74/0.8)] sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-9 sm:py-10">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-brand-orange/25 blur-2xl" aria-hidden />
        <div className="relative">
        <p className="text-sm font-medium text-white/70">Roll {user.username}</p>
        <h1 className="mt-1 text-[1.9rem] leading-tight text-white sm:text-4xl">Hello, {user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1.5 max-w-lg text-white/80">Check your results, ask anything you&apos;re stuck on, or book a mentor.</p>
        {active.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/student/questions/new" className="btn-accent inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold transition active:scale-[.98]">
              <Icon name="sparkle" /> Ask a question
            </Link>
            <Link href="/student/results" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 font-semibold text-white transition hover:bg-white/20">
              <Icon name="chart" /> My results
            </Link>
          </div>
        )}
        <dl className="mt-6 grid max-w-md grid-cols-3 gap-2">
          {[["Courses", active.length], ["Questions left", qaLeft], ["Sessions left", sessionsLeft]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/10 px-3 py-3 ring-1 ring-white/15">
              <dd className="text-2xl font-bold">{value}</dd>
              <dt className="text-xs text-white/70">{label}</dt>
            </div>
          ))}
        </dl>
        </div>
      </section>

      {(todo.length > 0 || upcoming.length > 0) && (
        <>
          <SectionTitle>Waiting for you</SectionTitle>
          <Card className="divide-y divide-rule overflow-hidden">
            {upcoming.map((m) => (
              <Link key={`m${m.id}`} href="/student/mentor" className="flex items-center gap-3 p-4 transition-colors hover:bg-paper">
                <span className="chip-green grid size-10 shrink-0 place-items-center rounded-xl"><Icon name="calendar" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">Mentor session: {m.topic}</span>
                  <span className="block text-sm text-ink-soft">{fmtDateTime(m.scheduledAt)} with {m.mentorName}</span>
                </span>
                <span className="text-pen" aria-hidden>→</span>
              </Link>
            ))}
            {todo.map((t) => (
              <Link key={t.id} href={`/student/questions/${t.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-paper">
                <span className="chip-orange grid size-10 shrink-0 place-items-center rounded-xl"><Icon name="chat" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{t.question ?? "Your question"}</span>
                  <span className="block text-sm font-medium text-pen">{TODO[t.status]} <span className="font-normal text-ink-faint">· {fmtAgo(t.updatedAt)}</span></span>
                </span>
                <span className="text-pen" aria-hidden>→</span>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>My courses</SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="You're not in an active course right now">
          See the courses open for enrollment below, and contact us to join.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((c) => (
            <Card key={c.id} className="card-hover flex flex-col overflow-hidden">
              <div className="brand-stripe h-1.5" aria-hidden />
              <div className="flex flex-1 flex-col p-5">
                <Link href={`/student/courses/${c.id}`} className="group flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-xl font-bold text-ink group-hover:text-pen">{c.name}</span>
                    {c.batch && <span className="text-sm text-ink-faint">Session {c.batch}</span>}
                  </span>
                  <span className="text-pen" aria-hidden>→</span>
                </Link>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Exams taken", c.examsSat],
                    ["Questions left", c.qa ?? 0],
                    ["Sessions left", c.sessions ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-gradient-to-b from-pen-soft to-sheet px-2 py-3 ring-1 ring-brand-indigo/10">
                      <dd className="text-gradient text-2xl font-bold">{value}</dd>
                      <dt className="text-xs text-ink-soft">{label}</dt>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { href: `/student/courses/${c.id}/results`, icon: "chart" as const, label: "Results", chip: "chip-navy" },
                    { href: `/student/questions/new?course=${c.id}`, icon: "chat" as const, label: "Ask", chip: "chip-orange" },
                    { href: `/student/mentor/new?course=${c.id}`, icon: "calendar" as const, label: "Mentor", chip: "chip-red" },
                  ].map((a) => (
                    <Link key={a.label} href={a.href}
                      className="group flex flex-col items-center gap-1.5 rounded-xl border border-rule bg-sheet py-3 text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-brand-indigo/30 hover:shadow-md">
                      <span className={`${a.chip} grid size-9 place-items-center rounded-xl`}><Icon name={a.icon} className="size-5" /></span> {a.label}
                    </Link>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <SectionTitle>Past courses</SectionTitle>
          <Card className="divide-y divide-rule overflow-hidden">
            {past.map((c) => (
              <Link key={c.id} href={`/student/courses/${c.id}/results`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{c.name}</span>
                  <span className="text-sm text-ink-faint">{c.examsSat} exam{c.examsSat === 1 ? "" : "s"} · results only</span>
                </span>
                <span className="text-pen" aria-hidden>→</span>
              </Link>
            ))}
          </Card>
        </>
      )}

      {available.length > 0 && (
        <>
          <SectionTitle>Available courses</SectionTitle>
          <Card className="overflow-hidden">
            <div className="border-b border-rule bg-gradient-to-r from-brand-orange/10 via-brand-red/5 to-transparent p-5">
              <p className="font-semibold text-ink">Want to join another course?</p>
              <p className="mt-1 text-sm text-ink-soft">
                These courses are open for enrollment now. To enroll, message us on WhatsApp or our Facebook page — we&apos;ll get you started.
              </p>
              <div className="mt-4"><ContactButtons size="sm" /></div>
            </div>
            <ul className="grid gap-px bg-rule sm:grid-cols-2">
              {available.map((c) => (
                <li key={c.id} className="flex items-center gap-3 bg-sheet p-4">
                  <span className="chip-navy grid size-10 shrink-0 place-items-center rounded-xl"><Icon name="book" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{c.name}</span>
                    <span className="text-sm text-ink-faint">{c.batch ? `Session ${c.batch}` : c.code ?? "Open now"}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">Open</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
