import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, SESSION_COOKIE } from "./session";
import { PORTALS, type Portal } from "./roles";

/**
 * DATA ACCESS LAYER — the real security check.
 * Every protected page calls requirePortal(). It verifies the cookie,
 * then confirms against the database that the account still exists,
 * is active, and hasn't had its password reset since this login.
 */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);
  if (!session) return null;

  const [user] = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      name: schema.users.name,
      username: schema.users.username,
      status: schema.users.status,
      tokenVersion: schema.users.tokenVersion,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  if (!user || user.status !== "active" || user.tokenVersion !== session.tv) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requirePortal(portal: Portal, opts: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  const cfg = PORTALS[portal];
  if (!user || !cfg.roles.includes(user.role)) redirect(cfg.login);
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
