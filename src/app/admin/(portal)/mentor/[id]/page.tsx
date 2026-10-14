import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { mentorPhotoIds } from "@/lib/qa";
import { closeSession } from "@/app/actions/mentor";
import { fmtDateTime, dhakaToday } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ScheduleForm } from "@/components/ScheduleForm";
import { MentorPhotos } from "@/components/MentorPhotos";
import { BackLink, Badge, Card, TextArea } from "@/components/ui";

/** A Date as Bangladesh date and time strings, for the form's defaults. */
const dhakaParts = (d: Date) => {
  const iso = new Date(d.getTime() + 6 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

export default async function MentorDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [r] = await db.select({
    m: s.mentorSessions, student: s.users.name, roll: s.users.username, course: s.courses.name, subject: s.subjects.name,
  }).from(s.mentorSessions)
    .innerJoin(s.users, eq(s.users.id, s.mentorSessions.studentId))
    .innerJoin(s.courses, eq(s.courses.id, s.mentorSessions.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.mentorSessions.subjectId))
    .where(eq(s.mentorSessions.id, id)).limit(1);
  if (!r) notFound();
  const m = r.m;
  const open = m.status === "pending" || m.status === "scheduled";

  const [template, photos, teachers] = await Promise.all([
    getSetting("mentor.reply_template"),
    mentorPhotoIds([m.id]),
    db.select({
      id: s.users.id, name: s.users.name, phone: s.users.phone,
      teachesCourse: sql<boolean>`exists (select 1 from teacher_courses tc where tc.teacher_id = "users"."id" and tc.course_id = ${m.courseId})`,
      upcoming: sql<number>`(select count(*)::int from mentor_sessions ms where ms.mentor_teacher_id = "users"."id" and ms.status = 'scheduled' and ms.scheduled_at > now())`,
    }).from(s.users).where(and(eq(s.users.role, "teacher"), eq(s.users.status, "active"))).orderBy(asc(s.users.name)),
  ]);
  const when = m.scheduledAt ? dhakaParts(m.scheduledAt) : { date: "", time: "" };
  const today = dhakaToday();

  return (
    <>
      <BackLink href="/admin/mentor">Mentor sessions</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>{r.subject} · {r.course} · requested {fmtDateTime(m.createdAt)}</>}
          action={<Badge tone={m.status === "pending" ? "amber" : m.status === "scheduled" ? "green" : "neutral"}>{m.status}</Badge>}>
          {m.topic}
        </PageTitle>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Card className="p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-soft">Student</dt>
            <dd><Link href={`/admin/students/${m.studentId}`} className="text-pen hover:underline underline-offset-4">{r.student}</Link> <span className="text-ink-faint">({r.roll})</span></dd>
            <dt className="text-ink-soft">WhatsApp</dt><dd className="text-ink">{m.contactPhone ?? "—"}</dd>
            <dt className="text-ink-soft">Prefers</dt><dd className="text-ink">{m.preferredTime ?? "Any time"}</dd>
          </dl>
          <h2 className="mt-5 mb-1 text-sm font-semibold text-ink">Where they&apos;re stuck</h2>
          <p className="whitespace-pre-line text-ink">{m.problem}</p>
          {(photos.get(m.id)?.length ?? 0) > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Photos</h2>
              <MentorPhotos ids={photos.get(m.id)!} />
            </div>
          )}
          {m.status === "scheduled" && (
            <div className="mt-5 rounded-lg border border-ok/30 bg-ok/5 p-3 text-sm">
              <p className="text-ink"><strong className="font-semibold">{fmtDateTime(m.scheduledAt)}</strong> with {m.mentorName} ({m.mentorPhone})
                {m.mentorTeacherId && <Badge tone="blue">Teacher</Badge>}</p>
              {m.adminMessage && <p className="mt-1 text-ink-soft">{m.adminMessage}</p>}
            </div>
          )}
          {!open && m.adminMessage && <p className="mt-5 text-sm text-ink-soft">Note: {m.adminMessage}</p>}
        </Card>

        {open && (
          <div className="grid gap-4">
            <Card className="p-5">
              <h2 className="mb-4 text-xl text-ink">{m.status === "scheduled" ? "Reschedule" : "Schedule"}</h2>
              <ScheduleForm
                sessionId={m.id}
                teachers={teachers}
                rescheduling={m.status === "scheduled"}
                today={today}
                defaults={{
                  teacherId: m.mentorTeacherId, name: m.mentorName ?? "", phone: m.mentorPhone ?? "",
                  date: when.date, time: when.time, message: m.adminMessage ?? template,
                }}
              />
            </Card>
            <Card className="p-5">
              <ActionForm action={closeSession} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={m.id} />
                <TextArea label="Close the request" name="adminMessage" rows={2} placeholder="Reason, if cancelling (the student sees this)" />
                <div className="flex flex-wrap gap-2">
                  {m.status === "scheduled" && <SubmitButton name="outcome" value="completed" variant="secondary" pending="Saving…">Mark as done</SubmitButton>}
                  <SubmitButton name="outcome" value="cancelled" variant="danger" pending="Saving…">Cancel and refund</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
