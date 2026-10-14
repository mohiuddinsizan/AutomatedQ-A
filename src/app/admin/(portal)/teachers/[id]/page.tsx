import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { resetPassword, setAccountStatus, setTeacherAssignments } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { AssignmentFields } from "@/components/AssignmentFields";
import { BackLink, Badge, Card, SectionTitle } from "@/components/ui";

export default async function TeacherDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.role, "teacher"))).limit(1);
  if (!u) notFound();

  const [courses, subjects, mineC, mineS] = await Promise.all([
    db.select({ id: s.courses.id, name: s.courses.name, status: s.courses.status }).from(s.courses).orderBy(asc(s.courses.status), asc(s.courses.name)),
    db.select({ id: s.subjects.id, name: s.subjects.name }).from(s.subjects).orderBy(asc(s.subjects.name)),
    db.select({ id: s.teacherCourses.courseId }).from(s.teacherCourses).where(eq(s.teacherCourses.teacherId, id)),
    db.select({ id: s.teacherSubjects.subjectId }).from(s.teacherSubjects).where(eq(s.teacherSubjects.teacherId, id)),
  ]);

  return (
    <>
      <BackLink href="/admin/teachers">Teachers</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>{u.username}{u.phone && ` · ${u.phone}`} · last sign-in {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}</>}
          action={u.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}>
          {u.name}
        </PageTitle>
      </div>

      <Card className="p-5">
        <ActionForm action={setTeacherAssignments} submit="Save assignments">
          <input type="hidden" name="teacherId" value={u.id} />
          <AssignmentFields courses={courses} subjects={subjects} courseIds={mineC.map((c) => c.id)} subjectIds={mineS.map((x) => x.id)} />
        </ActionForm>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <ActionForm action={resetPassword} submit="Reset password" variant="secondary" className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <p className="text-sm text-ink-soft">Creates a one-time password and signs them out everywhere.</p>
        </ActionForm>
        <ActionForm action={setAccountStatus} submit={u.status === "active" ? "Disable account" : "Enable account"}
          variant={u.status === "active" ? "danger" : "secondary"} className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <input type="hidden" name="status" value={u.status === "active" ? "disabled" : "active"} />
          <p className="text-sm text-ink-soft">{u.status === "active" ? "They can't sign in until enabled again." : "Lets them sign in again."}</p>
        </ActionForm>
      </Card>
    </>
  );
}
