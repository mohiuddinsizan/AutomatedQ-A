"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, deleteSession } from "@/lib/session";
import { verifyPassword, hashPassword, PASSWORD_MIN } from "@/lib/password";
import { PORTALS, homeForRole, type Portal } from "@/lib/roles";
import { requireUser } from "@/lib/dal";
import { isLocked, recordFailure, clearFailures } from "@/lib/rate-limit";

export type FormState = { error?: string; ok?: string; username?: string } | undefined;

const loginSchema = z.object({
  portal: z.enum(["student", "teacher", "admin"]),
  username: z.string().trim().min(1, "Enter your username").max(64),
  password: z.string().min(1, "Enter your password").max(200),
});

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, username: String(formData.get("username") ?? "") };
  }

  const { portal, username, password } = parsed.data;
  const key = `${portal}:${username.toLowerCase()}`;
  const wrong = portal === "student"
    ? "Roll number or password is incorrect."
    : "Username or password is incorrect.";

  if (isLocked(key)) {
    return { error: "Too many failed attempts. Wait 15 minutes and try again, or ask an admin to reset your password.", username };
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = ${username.toLowerCase()}`)
    .limit(1);

  const allowed = PORTALS[portal as Portal].roles;
  const valid = user && allowed.includes(user.role) && (await verifyPassword(password, user.passwordHash));

  if (!valid) {
    recordFailure(key);
    return { error: wrong, username };
  }
  if (user.status !== "active") {
    return { error: "This account is disabled. Contact the admin office.", username };
  }

  clearFailures(key);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession({ uid: user.id, role: user.role, tv: user.tokenVersion });

  redirect(user.mustChangePassword ? "/account/password" : homeForRole(user.role));
}

export async function logout(formData: FormData) {
  const portal = (formData.get("portal") as Portal) ?? "student";
  await deleteSession();
  redirect(PORTALS[portal]?.login ?? "/login");
}

const changeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(PASSWORD_MIN, `New password must be at least ${PASSWORD_MIN} characters`).max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "The two new passwords don't match", path: ["confirm"] })
  .refine((d) => d.next !== d.current, { message: "Choose a password different from your current one", path: ["next"] });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }

  const newVersion = user.tokenVersion + 1; // logs out every other device
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false, tokenVersion: newVersion })
    .where(eq(schema.users.id, user.id));

  await db.insert(schema.auditLogs).values({
    actorId: user.id, action: "password.change", entity: "user", entityId: String(user.id), ip: await clientIp(),
  });

  await createSession({ uid: user.id, role: user.role, tv: newVersion });
  redirect(homeForRole(user.role));
}
