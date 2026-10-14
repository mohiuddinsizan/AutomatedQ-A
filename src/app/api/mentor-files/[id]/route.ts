import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/dal";
import { readUpload } from "@/lib/uploads";

/** A mentor-request photo: for the student who sent it, admins, and the assigned teacher. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const [file] = await db.select({
    key: schema.mentorAttachments.storageKey, mime: schema.mentorAttachments.mime,
    studentId: schema.mentorSessions.studentId, teacherId: schema.mentorSessions.mentorTeacherId,
  })
    .from(schema.mentorAttachments)
    .innerJoin(schema.mentorSessions, eq(schema.mentorSessions.id, schema.mentorAttachments.sessionId))
    .where(eq(schema.mentorAttachments.id, id))
    .limit(1);

  const allowed = file && (
    user.role === "admin" || user.role === "super_admin" ||
    (user.role === "student" && file.studentId === user.id) ||
    (user.role === "teacher" && file.teacherId === user.id)
  );
  if (!allowed) return new Response("Not found", { status: 404 });

  try {
    const data = await readUpload(file.key);
    return new Response(new Uint8Array(data), {
      headers: { "content-type": file.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
