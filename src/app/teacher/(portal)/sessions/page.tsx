import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { mentorPhotoIds } from "@/lib/qa";
import { teacherCompleteSession } from "@/app/actions/mentor";
import { fmtDate, hoursSince } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { MentorPhotos } from "@/components/MentorPhotos";
import { WhatsAppIcon } from "@/components/icons";

export const metadata = { title: "Assigned sessions" };

const TZ = "Asia/Dhaka";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

function dayLabel(key: string, todayKey: string, tomorrowKey: string) {
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return new Date(`${key}T12:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

export default async function TeacherSessions({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePortal("teacher");
  const s = schema;
  const show = (await searchParams).show === "past" ? "past" : "upcoming";
  const mine = eq(s.mentorSessions.mentorTeacherId, user.id);
  // A session stays "upcoming" until an hour after it starts.
  const isUpcoming = and(eq(s.mentorSessions.status, "scheduled"), sql`${s.mentorSessions.scheduledAt} > now() - interval '1 hour'`);
  const isPast = sql`not (${s.mentorSessions.status} = 'scheduled' and ${s.mentorSessions.scheduledAt} > now() - interval '1 hour')`;

  const [[{ up }], [{ past }]] = await Promise.all([
    db.select({ up: sql<number>`count(*)::int` }).from(s.mentorSessions).where(and(mine, isUpcoming)),
    db.select({ past: sql<number>`count(*)::int` }).from(s.mentorSessions).where(and(mine, isPast, inArray(s.mentorSessions.status, ["scheduled", "completed", "cancelled"]))),
  ]);

  const rows = await db.select({
    id: s.mentorSessions.id, topic: s.mentorSessions.topic, problem: s.mentorSessions.problem,
    status: s.mentorSessions.status, scheduledAt: s.mentorSessions.scheduledAt,
    contactPhone: s.mentorSessions.contactPhone, preferredTime: s.mentorSessions.preferredTime,
    adminMessage: s.mentorSessions.adminMessage,
    student: s.users.name, roll: s.users.username, course: s.courses.name, subject: s.subjects.name,
  }).from(s.mentorSessions)
    .innerJoin(s.users, eq(s.users.id, s.mentorSessions.studentId))
    .innerJoin(s.courses, eq(s.courses.id, s.mentorSessions.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.mentorSessions.subjectId))
    .where(and(mine, show === "upcoming" ? isUpcoming : and(isPast, inArray(s.mentorSessions.status, ["scheduled", "completed", "cancelled"]))))
    .orderBy(show === "upcoming" ? asc(s.mentorSessions.scheduledAt) : desc(s.mentorSessions.scheduledAt))
    .limit(100);
  const photos = await mentorPhotoIds(rows.map((r) => r.id));

  // Group by day for the schedule view.
  const now = new Date();
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getTime() + 24 * 3600_000));
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.scheduledAt ? dayKey(r.scheduledAt) : "unscheduled";
    days.set(k, [...(days.get(k) ?? []), r]);
  }

  return (
    <>
      <PageTitle sub="One-to-one sessions the office has assigned to you. Contact the student on WhatsApp at the scheduled time.">
        Assigned sessions
      </PageTitle>
      <Tabs label="Sessions" items={[
        { href: "?show=upcoming", label: "Upcoming", count: up, active: show === "upcoming", urgent: true },
        { href: "?show=past", label: "Past", count: past, active: show === "past" },
      ]} />

      {rows.length === 0 ? (
        <EmptyState title={show === "upcoming" ? "No upcoming sessions" : "No past sessions"}>
          {show === "upcoming" ? "When the office assigns you a mentor session, it shows up here with the time and the student's details." : null}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {[...days.entries()].map(([key, list]) => (
            <section key={key}>
              <h2 className="mb-3 flex items-center gap-2 text-lg text-ink">
                {key === "unscheduled" ? "No date" : dayLabel(key, todayKey, tomorrowKey)}
                {key === todayKey && show === "upcoming" && <Badge tone="amber">{list.length} today</Badge>}
              </h2>
              <div className="grid gap-3">
                {list.map((r) => {
                  const started = r.scheduledAt && hoursSince(r.scheduledAt) > 0;
                  return (
                    <Card key={r.id} className="overflow-hidden">
                      <div className="flex flex-col sm:flex-row">
                        <div className={`flex shrink-0 items-center gap-3 px-5 py-4 sm:w-40 sm:flex-col sm:items-start sm:justify-center
                          ${r.status === "scheduled" ? "bg-pen text-white" : "bg-paper text-ink-soft"}`}>
                          <span className="text-2xl font-bold">{r.scheduledAt ? timeOf(r.scheduledAt) : "—"}</span>
                          <span className="text-xs opacity-80">{r.scheduledAt ? fmtDate(r.scheduledAt) : ""}</span>
                        </div>
                        <div className="min-w-0 flex-1 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-lg font-semibold text-ink">{r.topic}</p>
                              <p className="text-sm text-ink-soft">{r.student} · roll {r.roll} · {r.subject} · {r.course}</p>
                            </div>
                            {r.status === "completed" ? <Badge tone="green">Done</Badge>
                              : r.status === "cancelled" ? <Badge tone="red">Cancelled</Badge>
                              : started ? <Badge tone="amber">Started</Badge> : <Badge tone="blue">Scheduled</Badge>}
                          </div>
                          <details className="mt-3 text-sm">
                            <summary className="cursor-pointer font-medium text-pen">Where they&apos;re stuck</summary>
                            <p className="mt-2 whitespace-pre-line text-ink">{r.problem}</p>
                            {r.preferredTime && <p className="mt-2 text-ink-soft">Preferred time: {r.preferredTime}</p>}
                          </details>
                          {(photos.get(r.id)?.length ?? 0) > 0 && <div className="mt-3"><MentorPhotos ids={photos.get(r.id)!} size="sm" /></div>}
                          {r.adminMessage && <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink-soft">Note from the office: {r.adminMessage}</p>}
                          {r.status === "scheduled" && (
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              {r.contactPhone && (
                                <a href={`https://wa.me/88${r.contactPhone.replace(/^\+?88/, "")}`} target="_blank" rel="noreferrer"
                                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#25d366] px-3 text-sm font-medium text-white hover:bg-[#1fb457]">
                                  <WhatsAppIcon className="size-4" /> {r.contactPhone}
                                </a>
                              )}
                              <form action={teacherCompleteSession}>
                                <input type="hidden" name="id" value={r.id} />
                                <Button type="submit" variant="secondary" size="sm">Mark as done</Button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
