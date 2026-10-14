import { redirect } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { createAdmin, resetPassword, setAccountStatus } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, SectionTitle } from "@/components/ui";

export const metadata = { title: "Admins" };

export default async function AdminsPage() {
  const me = await requirePortal("admin");
  if (me.role !== "super_admin") redirect("/admin");
  const admins = await db.select().from(schema.users)
    .where(inArray(schema.users.role, ["admin", "super_admin"])).orderBy(asc(schema.users.role), asc(schema.users.name));

  return (
    <>
      <PageTitle sub="Admins can do everything except manage other admins.">Admins</PageTitle>
      <Card className="divide-y divide-rule">
        {admins.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{a.name} {a.id === me.id && <span className="text-ink-faint">(you)</span>}</p>
              <p className="text-sm text-ink-faint">{a.username} · last sign-in {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : "never"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {a.role === "super_admin" ? <Badge tone="blue">Super admin</Badge> : a.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
              {a.role === "admin" && (
                <>
                  <ActionForm action={resetPassword} submit="Reset password" size="sm" variant="secondary" className="flex flex-col gap-2">
                    <input type="hidden" name="userId" value={a.id} />
                  </ActionForm>
                  <ActionForm action={setAccountStatus} submit={a.status === "active" ? "Disable" : "Enable"} size="sm"
                    variant={a.status === "active" ? "danger" : "secondary"} className="flex flex-col gap-2">
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="status" value={a.status === "active" ? "disabled" : "active"} />
                  </ActionForm>
                </>
              )}
            </div>
          </div>
        ))}
      </Card>

      <SectionTitle>Add an admin</SectionTitle>
      <Card className="p-5">
        <ActionForm action={createAdmin} submit="Create admin account" pending="Creating…" resetOnOk>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name" name="name" required />
            <Field label="Username" name="username" required autoCapitalize="none" />
            <Field label="Phone (optional)" name="phone" inputMode="tel" />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
