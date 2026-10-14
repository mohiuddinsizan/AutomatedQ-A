import Link from "next/link";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, EmptyState, Pagination, TableWrap, th, td, buttonClass } from "@/components/ui";

export const metadata = { title: "Students" };

const PER_PAGE = 25;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = sp.status === "disabled" ? "disabled" : sp.status === "all" ? "all" : "active";
  const page = Math.max(1, Number(sp.page) || 1);

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const where = and(
    eq(s.users.role, "student"),
    status === "all" ? undefined : eq(s.users.status, status),
    q ? or(ilike(s.users.username, like), ilike(s.users.name, like), ilike(s.users.phone, like)) : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(s.users).where(where),
    db.select({
      id: s.users.id, roll: s.users.username, name: s.users.name, phone: s.users.phone, status: s.users.status,
      branch: s.students.institution, mustChange: s.users.mustChangePassword,
      courses: sql<number>`(select count(*)::int from enrollments e where e.student_id = "users"."id" and e.status = 'active')`,
      qa: sql<number>`(select coalesce(sum(q.qa_remaining), 0)::int from quotas q join enrollments e on e.student_id = q.student_id and e.course_id = q.course_id and e.status = 'active' where q.student_id = "users"."id")`,
      sessions: sql<number>`(select coalesce(sum(q.session_remaining), 0)::int from quotas q join enrollments e on e.student_id = q.student_id and e.course_id = q.course_id and e.status = 'active' where q.student_id = "users"."id")`,
    }).from(s.users).leftJoin(s.students, eq(s.students.userId, s.users.id))
      .where(where).orderBy(asc(s.users.username)).limit(PER_PAGE).offset((page - 1) * PER_PAGE),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), status, page: String(p) })}`;

  return (
    <>
      <PageTitle sub={`${total.toLocaleString()} ${status === "all" ? "" : status} students`}>Students</PageTitle>

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search roll, name or phone" aria-label="Search students"
          className="h-11 flex-1 rounded-md border border-rule bg-sheet px-3 text-base focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/20" />
        <select name="status" defaultValue={status} aria-label="Status"
          className="h-11 rounded-md border border-rule bg-sheet px-3 text-base">
          <option value="active">Active</option><option value="disabled">Disabled</option><option value="all">All</option>
        </select>
        <button className={buttonClass("primary")} style={{ height: "2.75rem" }}>Search</button>
      </form>

      {rows.length === 0 ? <EmptyState title="No students found">Try another roll number, name or phone.</EmptyState> : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-paper"><tr>
              <th className={th}>Roll</th><th className={th}>Name</th><th className={`${th} hidden md:table-cell`}>Phone</th>
              <th className={`${th} hidden md:table-cell`}>Branch</th><th className={`${th} text-right`}>Courses</th><th className={`${th} text-right`}>Q&amp;A left</th><th className={`${th} hidden text-right sm:table-cell`}>Sessions left</th><th className={th}>Status</th><th className={th}><span className="sr-only">Edit</span></th>
            </tr></thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-paper">
                  <td className={`${td} font-mono text-ink`}><Link className="text-pen hover:underline underline-offset-4" href={`/admin/students/${r.id}`}>{r.roll}</Link></td>
                  <td className={`${td} text-ink`}><Link href={`/admin/students/${r.id}`}>{r.name}</Link></td>
                  <td className={`${td} hidden text-ink-soft md:table-cell`}>{r.phone ?? "—"}</td>
                  <td className={`${td} hidden text-ink-soft md:table-cell`}>{r.branch ?? "—"}</td>
                  <td className={`${td} text-right text-ink-soft`}>{r.courses}</td>
                  <td className={`${td} text-right font-semibold text-ink`}>{r.qa}</td>
                  <td className={`${td} hidden text-right font-semibold text-ink sm:table-cell`}>{r.sessions}</td>
                  <td className={td}>
                    {r.status === "disabled" ? <Badge tone="red">Disabled</Badge> : r.mustChange ? <Badge>Not signed in yet</Badge> : <Badge tone="green">Active</Badge>}
                  </td>
                  <td className={td}>
                    <Link href={`/admin/students/${r.id}`} className="whitespace-nowrap rounded-lg bg-pen-soft px-2.5 py-1 text-xs font-semibold text-pen hover:bg-pen hover:text-white">Edit Q&amp;A</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination page={page} pages={pages} href={href} />
    </>
  );
}
