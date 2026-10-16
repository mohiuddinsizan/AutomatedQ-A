import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { getThread } from "@/lib/qa";
import { fmtDateTime } from "@/lib/format";
import { claimThread, releaseThread } from "@/app/actions/qa";
import { PageTitle } from "@/components/PortalHeader";
import { Alert, BackLink, Button, Card } from "@/components/ui";
import { StatusBadge, ThreadView } from "@/components/ThreadView";
import { ReplyForm } from "@/components/QaActions";

export const metadata = { title: "Question" };

export default async function TeacherQuestion({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortal("teacher");
  // getThread enforces the course/subject scope; outside it, the question doesn't exist.
  const thread = await getThread(user, Number((await params).id));
  if (!thread) notFound();

  const mine = thread.teacherId === user.id;

  return (
    <>
      <BackLink href={`/teacher/courses/${thread.courseId}`}>{thread.courseName}</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>{thread.subjectName} · {thread.courseName} · {thread.studentName} (roll {thread.studentRoll}) · {fmtDateTime(thread.createdAt)}</>}
          action={<StatusBadge status={thread.status} />}>
          Student question
        </PageTitle>
      </div>

      {(thread.aiVerdict || thread.aiNote) && !thread.messages.some((m) => m.senderType === "ai") && (
        <div className="mb-4">
          <Alert tone="warn">
            The AI tutor couldn&apos;t answer this{thread.aiVerdict === "off_topic" ? " (it didn't recognise a study question)" : " (it couldn't read or hear it clearly)"}
            {thread.aiNote ? <>: {thread.aiNote}</> : "."} Check the student&apos;s message{thread.messages[0]?.files.length ? ", photo or voice note" : ""} below.
          </Alert>
        </div>
      )}
      <ThreadView thread={thread} viewer="staff" />

      <div className="mt-6">
        {thread.status === "escalated" && (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-ink-soft">
              {thread.messages.some((m) => m.senderType === "ai")
                ? "The student read the AI answer and wants a teacher."
                : "The AI tutor couldn't answer this, so the student sent it straight to a teacher."} Take it so nobody else answers at the same time.
            </p>
            <form action={claimThread}>
              <input type="hidden" name="threadId" value={thread.id} />
              <Button type="submit">Take this question</Button>
            </form>
          </Card>
        )}
        {thread.status === "teacher_claimed" && mine && (
          <Card className="p-4 sm:p-5">
            <ReplyForm threadId={thread.id} />
            <form action={releaseThread} className="mt-3 border-t border-rule pt-3">
              <input type="hidden" name="threadId" value={thread.id} />
              <Button type="submit" variant="ghost" size="sm">Give it back to the queue</Button>
            </form>
          </Card>
        )}
        {thread.status === "teacher_claimed" && !mine && <Alert tone="info">{thread.teacherName ?? "Another teacher"} is answering this question.</Alert>}
        {thread.status === "answered" && <Alert tone="info">Reply sent. The student will rate it and can ask a follow-up.</Alert>}
        {thread.status === "resolved" && <Alert tone="ok">The student marked this as solved.</Alert>}
      </div>
    </>
  );
}
