import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteUpload } from "./uploads";

const s = schema;
const DAY = 24 * 3600_000;

/**
 * Runs with the daily import. Answered questions the student never came back to
 * are closed after a week; unconfirmed drafts are thrown away after a day.
 */
export async function closeIdleThreads() {
  const closed = await db.update(s.qaThreads).set({ status: "closed_timeout" })
    .where(and(inArray(s.qaThreads.status, ["ai_answered", "answered"]), lt(s.qaThreads.updatedAt, new Date(Date.now() - 7 * DAY))))
    .returning({ id: s.qaThreads.id });

  const drafts = await db.select({ id: s.qaThreads.id }).from(s.qaThreads)
    .where(and(eq(s.qaThreads.status, "draft"), eq(s.qaThreads.quotaCharged, false), lt(s.qaThreads.updatedAt, new Date(Date.now() - DAY))));
  if (drafts.length) {
    const ids = drafts.map((d) => d.id);
    const files = await db.select({ key: s.attachments.storageKey }).from(s.attachments)
      .innerJoin(s.qaMessages, eq(s.qaMessages.id, s.attachments.messageId))
      .where(inArray(s.qaMessages.threadId, ids));
    await db.delete(s.qaThreads).where(inArray(s.qaThreads.id, ids));
    await Promise.all(files.map((f) => deleteUpload(f.key)));
  }
  return { closed: closed.length, draftsRemoved: drafts.length };
}
