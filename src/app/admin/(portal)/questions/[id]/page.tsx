import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { getThread } from "@/lib/qa";
import { fmtDateTime } from "@/lib/format";
import { releaseThread, setThreadHidden } from "@/app/actions/qa";
import { PageTitle } from "@/components/PortalHeader";
import { Alert, BackLink, Badge, Button, Card } from "@/components/ui";
import { StatusBadge, ThreadView } from "@/components/ThreadView";
import { ReplyForm } from "@/components/QaActions";

export const metadata = { title: "Question" };

export default async function AdminQuestion({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortal("admin");
  const thread = await getThread(user, Number((await params).id));
  if (!thread) notFound();
  const canReply = ["escalated", "teacher_claimed", "answered"].includes(thread.status);

  return (
    <>
      <BackLink href={`/admin/questions/course/${thread.courseId}`}>{thread.courseName}</BackLink>
      <div className="mt-3">
        <PageTitle
          sub={<><Link className="text-pen hover:underline underline-offset-4" href={`/admin/students/${thread.studentId}`}>{thread.studentName}</Link> (roll {thread.studentRoll}) · {thread.subjectName} · {thread.courseName} · {fmtDateTime(thread.createdAt)}</>}
          action={<span className="flex gap-2">{thread.hidden && <Badge tone="red">Hidden from teachers</Badge>}<StatusBadge status={thread.status} /></span>}>
          Question #{thread.id}
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

      <div className="mt-6 grid gap-4">
        {thread.status === "teacher_claimed" && (
          <Alert tone="info">{thread.teacherName ?? "A teacher"} has taken this question.</Alert>
        )}
        {canReply && (
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-lg text-ink">Reply as admin</h2>
            <ReplyForm threadId={thread.id} />
          </Card>
        )}
        <Card className="flex flex-wrap items-center gap-3 p-4">
          {thread.status === "teacher_claimed" && (
            <form action={releaseThread}>
              <input type="hidden" name="threadId" value={thread.id} />
              <Button variant="secondary" size="sm">Return to the teacher queue</Button>
            </form>
          )}
          <form action={setThreadHidden}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="hidden" value={thread.hidden ? "0" : "1"} />
            <Button variant={thread.hidden ? "secondary" : "danger"} size="sm">{thread.hidden ? "Show to teachers again" : "Hide from teachers"}</Button>
          </form>
          <p className="text-sm text-ink-soft">Hiding removes abusive or duplicate questions from the teacher queue. The student still sees it.</p>
        </Card>
      </div>
    </>
  );
}
