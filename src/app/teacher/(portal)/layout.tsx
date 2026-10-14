import { and, count, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { teacherScope, scopeWhere } from "@/lib/qa";
import { PortalHeader } from "@/components/PortalHeader";
import { SiteFooter } from "@/components/Brand";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortal("teacher");
  const scope = await teacherScope(user.id);
  const [[{ waiting }], [{ upcoming }]] = await Promise.all([
    db.select({ waiting: count() }).from(schema.qaThreads).where(and(scopeWhere(scope), eq(schema.qaThreads.status, "escalated"))),
    db.select({ upcoming: count() }).from(schema.mentorSessions).where(and(
      eq(schema.mentorSessions.mentorTeacherId, user.id), eq(schema.mentorSessions.status, "scheduled"),
      sql`${schema.mentorSessions.scheduledAt} > now() - interval '1 hour'`,
    )),
  ]);

  return (
    <>
      <PortalHeader portal="teacher" name={user.name} sub={user.username} nav={[
        { href: "/teacher", label: "Q&A", icon: "chat", exact: true, also: ["/teacher/courses", "/teacher/questions", "/teacher/answered"], badge: waiting },
        { href: "/teacher/sessions", label: "Sessions", icon: "calendar", badge: upcoming },
        { href: "/teacher/links", label: "Tools", icon: "link" },
      ]} />
      <main className="mx-auto min-h-[60vh] max-w-5xl px-4 py-6 sm:py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
