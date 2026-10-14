import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { cancelOwnSession } from "@/app/actions/mentor";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, type BadgeTone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MentorPhotos } from "@/components/MentorPhotos";
import { mentorPhotoIds } from "@/lib/qa";

export const metadata = { title: "Mentor sessions" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting to be scheduled", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "green" },
  completed: { label: "Done", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export default async function MentorPage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
  const user = await requirePortal("student");
  const s = schema;
  const justRequested = Boolean((await searchParams).requested);

  const rows = await db.select({
    id: s.mentorSessions.id, topic: s.mentorSessions.topic, problem: s.mentorSessions.problem,
    status: s.mentorSessions.status, scheduledAt: s.mentorSessions.scheduledAt,
    mentorName: s.mentorSessions.mentorName, mentorPhone: s.mentorSessions.mentorPhone,
    adminMessage: s.mentorSessions.adminMessage, preferredTime: s.mentorSessions.preferredTime,
    createdAt: s.mentorSessions.createdAt, course: s.courses.name, subject: s.subjects.name,
  }).from(s.mentorSessions)
    .innerJoin(s.courses, eq(s.courses.id, s.mentorSessions.courseId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.mentorSessions.subjectId))
    .where(eq(s.mentorSessions.studentId, user.id))
    .orderBy(desc(s.mentorSessions.createdAt));

  const photos = await mentorPhotoIds(rows.map((r) => r.id));

  // Seeing this page counts as reading the scheduling notices.
  await db.update(s.notifications).set({ readAt: new Date() })
    .where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));

  return (
    <>
      <PageTitle sub="One-to-one help from a mentor on a topic you're stuck on."
        action={<LinkButton href="/student/mentor/new"><Icon name="plus" /> Request a session</LinkButton>}>
        Mentor sessions
      </PageTitle>
      {justRequested && <div className="mb-4"><Alert tone="ok">Request sent. The office will schedule it and you&apos;ll see the mentor&apos;s details here.</Alert></div>}

      {rows.length === 0 ? (
        <EmptyState title="No sessions yet" action={<LinkButton href="/student/mentor/new">Request a session</LinkButton>}>
          Tell us the topic and where you&apos;re stuck. We&apos;ll match you with a mentor and send you the time and contact.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.topic}</p>
                  <p className="text-sm text-ink-faint">{r.subject} · {r.course} · requested {fmtDateTime(r.createdAt)}</p>
                </div>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{r.problem}</p>
              {(photos.get(r.id)?.length ?? 0) > 0 && <div className="mt-3"><MentorPhotos ids={photos.get(r.id)!} size="sm" /></div>}

              {r.status === "scheduled" && (
                <div className="mt-4 grid gap-3 rounded-md border border-ok/30 bg-ok/5 p-4 sm:grid-cols-3">
                  <div><p className="text-xs text-ink-soft">When</p><p className="font-medium text-ink">{fmtDateTime(r.scheduledAt)}</p></div>
                  <div><p className="text-xs text-ink-soft">Mentor</p><p className="font-medium text-ink">{r.mentorName}</p></div>
                  <div>
                    <p className="text-xs text-ink-soft">Contact</p>
                    <a href={`https://wa.me/88${r.mentorPhone?.replace(/^\+?88/, "")}`} className="font-medium text-pen underline-offset-4 hover:underline">{r.mentorPhone}</a>
                  </div>
                  {r.adminMessage && <p className="text-sm text-ink sm:col-span-3">{r.adminMessage}</p>}
                </div>
              )}
              {r.status === "cancelled" && r.adminMessage && <p className="mt-3 text-sm text-ink-soft">Note: {r.adminMessage}</p>}
              {r.status === "pending" && (
                <form action={cancelOwnSession} className="mt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="ghost" size="sm">Cancel request</Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
