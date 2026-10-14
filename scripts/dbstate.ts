import { db, schema } from "../src/db";
import { count, eq, and, desc } from "drizzle-orm";
const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
async function main() {
  console.log("   db:", {
    students: await n(db.select({ n: count() }).from(schema.users).where(eq(schema.users.role, "student"))),
    disabled: await n(db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.role, "student"), eq(schema.users.status, "disabled")))),
    courses: await n(db.select({ n: count() }).from(schema.courses)),
    activeEnroll: await n(db.select({ n: count() }).from(schema.enrollments).where(eq(schema.enrollments.status, "active"))),
    droppedEnroll: await n(db.select({ n: count() }).from(schema.enrollments).where(eq(schema.enrollments.status, "dropped"))),
    quotas: await n(db.select({ n: count() }).from(schema.quotas)),
  });
  process.exit(0);
}
main();
