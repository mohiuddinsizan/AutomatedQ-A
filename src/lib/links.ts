import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Staff links a role may see: admins see all, teachers only the ones shared with staff. */
export function staffLinksFor(role: string) {
  const s = schema;
  return db.select().from(s.staffLinks)
    .where(role === "teacher" ? eq(s.staffLinks.audience, "staff") : undefined)
    .orderBy(asc(s.staffLinks.position), asc(s.staffLinks.title));
}
