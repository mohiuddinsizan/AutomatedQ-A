import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { resetPassword, setAccountStatus } from "@/app/actions/admin";
import { AllowanceEditor } from "@/components/AllowanceEditor";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { BackLink, Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { StatusBadge } from "@/components/ThreadView";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.role, "student"))).limit(1);
  if (!u) notFound();

  const [[profile], enrollments, threads, sessions] = await Promise.all([
    db.select().from(s.students).where(eq(s.students.userId, id)),
    db.select({
      courseId: s.courses.id, name: s.courses.name, courseStatus: s.courses.status, status: s.enrollments.status,
      qa: s.quotas.qaRemaining, sessions: s.quotas.sessionRemaining,
    }).from(s.enrollments)
      .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
      .leftJoin(s.quotas, and(eq(s.quotas.studentId, s.enrollments.studentId), eq(s.quotas.courseId, s.enrollments.courseId)))
      .where(eq(s.enrollments.studentId, id)).orderBy(s.enrollments.status, s.courses.name),
    db.select({ id: s.qaThreads.id, question: s.qaThreads.question, status: s.qaThreads.status, updatedAt: s.qaThreads.updatedAt })
      .from(s.qaThreads).where(eq(s.qaThreads.studentId, id)).orderBy(desc(s.qaThreads.updatedAt)).limit(10),
    db.select({ id: s.mentorSessions.id, topic: s.mentorSessions.topic, status: s.mentorSessions.status, createdAt: s.mentorSessions.createdAt })
      .from(s.mentorSessions).where(eq(s.mentorSessions.studentId, id)).orderBy(desc(s.mentorSessions.createdAt)).limit(10),
  ]);
  const meta = (profile?.meta ?? {}) as { guardianPhone?: string | null };

  return (
    <>
      <BackLink href="/admin/students">Students</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>Roll <span className="font-mono">{u.username}</span>{profile?.institution && ` · ${profile.institution}`}</>}
          action={u.status === "disabled" ? <Badge tone="red">Disabled{u.disabledBy === "import" ? " by import" : ""}</Badge> : <Badge tone="green">Active</Badge>}>
          {u.name}
        </PageTitle>
      </div>

      <SectionTitle>Q&amp;A and mentor sessions</SectionTitle>
      {enrollments.length === 0 ? <EmptyState title="Not enrolled in any course" /> : (
        <div className="grid gap-3">
          {enrollments.map((e) => (
            <Card key={e.courseId} className="relative overflow-hidden p-5">
              <span className={`absolute inset-y-0 left-0 w-1.5 ${e.status === "active" && e.courseStatus === "active" ? "bg-gradient-to-b from-brand-orange to-brand-red" : "bg-rule"}`} aria-hidden />
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Link href={`/admin/courses/${e.courseId}`} className="text-lg font-bold text-ink hover:text-pen">{e.name}</Link>
                {e.status === "dropped" ? <Badge tone="red">Dropped</Badge> : e.courseStatus === "archived" ? <Badge>Archived course</Badge> : <Badge tone="green">Active</Badge>}
              </div>
              <AllowanceEditor studentId={u.id} courseId={e.courseId} qa={e.qa ?? 0} sessions={e.sessions ?? 0} />
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Account</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-soft">Phone</dt><dd className="text-ink">{u.phone ?? "—"}</dd>
            <dt className="text-ink-soft">Guardian</dt><dd className="text-ink">{meta.guardianPhone ?? "—"}</dd>
            <dt className="text-ink-soft">Session</dt><dd className="text-ink">{profile?.batch ?? "—"}</dd>
            <dt className="text-ink-soft">Last sign-in</dt><dd className="text-ink">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</dd>
            <dt className="text-ink-soft">Password</dt><dd className="text-ink">{u.mustChangePassword ? "Still the phone number (must change)" : "Chosen by the student"}</dd>
          </dl>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <ActionForm action={resetPassword} submit="Reset password" pending="Resetting…" variant="secondary" className="flex flex-col gap-2">
            <input type="hidden" name="userId" value={u.id} />
            <p className="text-sm text-ink-soft">Sets the password back to the phone number and signs the student out everywhere.</p>
          </ActionForm>
          <ActionForm action={setAccountStatus} submit={u.status === "active" ? "Disable account" : "Enable account"}
            variant={u.status === "active" ? "danger" : "secondary"} className="flex flex-col gap-2 border-t border-rule pt-4">
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="status" value={u.status === "active" ? "disabled" : "active"} />
            <p className="text-sm text-ink-soft">
              {u.status === "active" ? "A disabled student can't sign in and is signed out now. The daily import won't re-enable it." : "Lets the student sign in again."}
            </p>
          </ActionForm>
        </Card>
      </div>

      <div className="grid gap-x-6 md:grid-cols-2">
        <div>
          <SectionTitle>Recent questions</SectionTitle>
          {threads.length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
            <Card className="divide-y divide-rule">
              {threads.map((t) => (
                <Link key={t.id} href={`/admin/questions/${t.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-paper">
                  <span className="min-w-0 flex-1 truncate text-ink">{t.question ?? "Question"}</span>
                  <span className="shrink-0 text-ink-faint">{fmtAgo(t.updatedAt)}</span>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </Card>
          )}
        </div>
        <div>
          <SectionTitle>Mentor requests</SectionTitle>
          {sessions.length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
            <Card className="divide-y divide-rule">
              {sessions.map((m) => (
                <Link key={m.id} href={`/admin/mentor/${m.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-paper">
                  <span className="min-w-0 flex-1 truncate text-ink">{m.topic}</span>
                  <Badge>{m.status}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
