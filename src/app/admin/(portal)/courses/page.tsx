import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { fmtDate } from "@/lib/format";
import { Tabs } from "@/components/Tabs";
import { PageTitle } from "@/components/PortalHeader";
import { Badge, EmptyState, TableWrap, th, td } from "@/components/ui";

export const metadata = { title: "Courses" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePortal("admin");
  const s = schema;
  const status = (await searchParams).status === "archived" ? "archived" : (await searchParams).status === "all" ? "all" : "active";

  const rows = await db.select({
    id: s.courses.id, name: s.courses.name, code: s.courses.code, batch: s.courses.batch, status: s.courses.status,
    syncedAt: s.courses.resultsSyncedAt,
    students: sql<number>`(select count(*)::int from enrollments e where e.course_id = "courses"."id" and e.status = 'active')`,
    exams: sql<number>`(select count(*)::int from exams x where x.course_id = "courses"."id" and not x.removed_upstream)`,
  }).from(s.courses)
    .where(status === "all" ? undefined : eq(s.courses.status, status))
    .orderBy(asc(s.courses.status), asc(s.courses.name));

  return (
    <>
      <PageTitle sub="Courses come from BigBang. Set allowances, subjects and what students can see here.">Courses</PageTitle>
      <Tabs label="Filter" items={(["active", "archived", "all"] as const).map((k) => ({ href: `?status=${k}`, label: k[0].toUpperCase() + k.slice(1), active: status === k }))} />
      {rows.length === 0 ? <EmptyState title="No courses here" /> : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-paper"><tr>
              <th className={th}>Course</th><th className={`${th} text-right`}>Students</th><th className={`${th} text-right`}>Exams</th>
              <th className={`${th} hidden sm:table-cell`}>Results updated</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-rule">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-paper">
                  <td className={td}>
                    <Link href={`/admin/courses/${c.id}`} className="font-medium text-ink hover:text-pen">{c.name}</Link>
                    <span className="block text-xs text-ink-faint">{[c.code, c.batch].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={`${td} text-right text-ink`}>{c.students.toLocaleString()}</td>
                  <td className={`${td} text-right text-ink-soft`}>{c.exams}</td>
                  <td className={`${td} hidden text-ink-soft sm:table-cell`}>{c.syncedAt ? fmtDate(c.syncedAt) : "Never"}</td>
                  <td className={td}>{c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge>Archived</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
