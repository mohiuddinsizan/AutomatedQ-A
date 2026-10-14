import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/dal";
import { canSeeThread } from "@/lib/qa";
import { readUpload } from "@/lib/uploads";

/** Serves a question attachment to someone allowed to see its thread. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const [file] = await db.select({
    key: schema.attachments.storageKey, mime: schema.attachments.mime,
    studentId: schema.qaThreads.studentId, courseId: schema.qaThreads.courseId,
    subjectId: schema.qaThreads.subjectId, hidden: schema.qaThreads.hidden, status: schema.qaThreads.status,
  })
    .from(schema.attachments)
    .innerJoin(schema.qaMessages, eq(schema.qaMessages.id, schema.attachments.messageId))
    .innerJoin(schema.qaThreads, eq(schema.qaThreads.id, schema.qaMessages.threadId))
    .where(eq(schema.attachments.id, id))
    .limit(1);

  if (!file || !(await canSeeThread(user, file))) return new Response("Not found", { status: 404 });

  try {
    const data = await readUpload(file.key);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": file.mime,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
