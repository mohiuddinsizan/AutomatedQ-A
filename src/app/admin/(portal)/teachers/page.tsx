import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { createTeacher } from "@/app/actions/admin";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { AssignmentFields } from "@/components/AssignmentFields";
import { Badge, Card, EmptyState, Field, SectionTitle, Stars, TableWrap, th, td } from "@/components/ui";

export const metadata = { title: "Teachers" };

export default async function TeachersPage() {
  await requirePortal("admin");
  const s = schema;
  const [teachers, courses, subjects] = await Promise.all([
    db.select({
      id: s.users.id, name: s.users.name, username: s.users.username, status: s.users.status,
      courses: sql<string>`(select string_agg(c.name, ', ' order by c.name) from teacher_courses tc join courses c on c.id = tc.course_id where tc.teacher_id = "users"."id")`,
      replies: sql<number>`(select count(*)::int from qa_messages m where m.sender_id = "users"."id" and m.sender_type = 'teacher')`,
      rating: sql<number | null>`(select avg(m.rating)::float from qa_messages m where m.sender_id = "users"."id" and m.sender_type = 'teacher')`,
    }).from(s.users).where(eq(s.users.role, "teacher")).orderBy(asc(s.users.name)),
    db.select({ id: s.courses.id, name: s.courses.name, status: s.courses.status }).from(s.courses).orderBy(asc(s.courses.status), asc(s.courses.name)),
    db.select({ id: s.subjects.id, name: s.subjects.name }).from(s.subjects).orderBy(asc(s.subjects.name)),
  ]);

  return (
    <>
      <PageTitle sub="Teachers answer the questions students forward from the AI.">Teachers</PageTitle>
      {teachers.length === 0 ? <EmptyState title="No teachers yet">Add the first one below.</EmptyState> : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-paper"><tr>
              <th className={th}>Teacher</th><th className={`${th} hidden md:table-cell`}>Courses</th>
              <th className={`${th} text-right`}>Replies</th><th className={th}>Rating</th><th className={th}>Status</th><th className={th}><span className="sr-only">Q&amp;A</span></th>
            </tr></thead>
            <tbody className="divide-y divide-rule">
              {teachers.map((t) => (
                <tr key={t.id} className="hover:bg-paper">
                  <td className={td}>
                    <Link href={`/admin/teachers/${t.id}`} className="font-medium text-ink hover:text-pen">{t.name}</Link>
                    <span className="block text-xs text-ink-faint">{t.username}</span>
                  </td>
                  <td className={`${td} hidden max-w-xs text-ink-soft md:table-cell`}>{t.courses ?? <span className="text-warn">None assigned</span>}</td>
                  <td className={`${td} text-right text-ink`}>{t.replies}</td>
                  <td className={td}><Stars value={t.rating} /></td>
                  <td className={td}>{t.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</td>
                  <td className={td}>
                    <Link href={`/admin/teachers/${t.id}#qa`} className="whitespace-nowrap rounded-lg bg-pen-soft px-2.5 py-1 text-xs font-semibold text-pen hover:bg-pen hover:text-white">View Q&amp;A</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <SectionTitle>Add a teacher</SectionTitle>
      <Card className="p-5">
        <ActionForm action={createTeacher} submit="Create teacher account" pending="Creating…" resetOnOk>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name" name="name" required />
            <Field label="Username" name="username" required autoCapitalize="none" hint="Used to sign in, e.g. rahim.physics" />
            <Field label="Phone (optional)" name="phone" inputMode="tel" />
          </div>
          <AssignmentFields courses={courses} subjects={subjects} />
          <p className="text-sm text-ink-soft">A one-time password is shown after creating. The teacher chooses their own at first sign-in.</p>
        </ActionForm>
      </Card>
    </>
  );
}
