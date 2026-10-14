import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { PortalHeader } from "@/components/PortalHeader";
import { SiteFooter } from "@/components/Brand";
import type { NavItem } from "@/components/NavLinks";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortal("admin");
  const [[{ waiting }], [{ pending }]] = await Promise.all([
    db.select({ waiting: count() }).from(schema.qaThreads).where(eq(schema.qaThreads.status, "escalated")),
    db.select({ pending: count() }).from(schema.mentorSessions).where(eq(schema.mentorSessions.status, "pending")),
  ]);

  const nav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: "home", exact: true },
    { href: "/admin/students", label: "Students", icon: "users" },
    { href: "/admin/courses", label: "Courses", icon: "book" },
    { href: "/admin/questions", label: "Q&A", icon: "chat", badge: waiting },
    { href: "/admin/mentor", label: "Mentor", icon: "calendar", badge: pending },
    { href: "/admin/teachers", label: "Teachers", icon: "teacher" },
    ...(user.role === "super_admin" ? [{ href: "/admin/admins", label: "Admins", icon: "shield" } as NavItem] : []),
    { href: "/admin/links", label: "Tools", icon: "link" },
    { href: "/admin/sync", label: "Import", icon: "refresh" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <>
      <PortalHeader portal="admin" name={user.name} sub={user.role === "super_admin" ? "Super admin" : "Admin"} nav={nav} />
      <main className="mx-auto min-h-[60vh] max-w-5xl px-4 py-6 sm:py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
