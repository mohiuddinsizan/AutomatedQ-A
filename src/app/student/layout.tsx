import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { PortalHeader } from "@/components/PortalHeader";
import { SiteFooter } from "@/components/Brand";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortal("student");
  // Questions that are waiting on the student: a draft to confirm, or a reply to rate.
  const [[{ waiting }], [{ unread }]] = await Promise.all([
    db.select({ waiting: count() }).from(schema.qaThreads)
      .where(and(eq(schema.qaThreads.studentId, user.id), inArray(schema.qaThreads.status, ["draft", "ai_answered", "answered"]))),
    db.select({ unread: count() }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt), eq(schema.notifications.type, "mentor.scheduled"))),
  ]);

  return (
    <>
      <PortalHeader portal="student" name={user.name} sub={`Roll ${user.username}`} nav={[
        { href: "/student", label: "Home", icon: "home", exact: true },
        { href: "/student/results", label: "Results", icon: "chart", also: ["/student/courses"] },
        { href: "/student/questions", label: "Q&A", icon: "chat", badge: waiting },
        { href: "/student/mentor", label: "Mentor", icon: "calendar", badge: unread },
      ]} />
      <main className="mx-auto min-h-[60vh] max-w-5xl px-4 pt-6 sm:pt-8">{children}</main>
      <SiteFooter withBottomNav />
    </>
  );
}
