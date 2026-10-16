import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/dal";
import { getThread } from "@/lib/qa";
import { fmtDateTime } from "@/lib/format";
import { BackLink, Badge, Card, LinkButton } from "@/components/ui";
import { QuestionProgress, ThreadView } from "@/components/ThreadView";
import { ConfirmForm, RetryForm, RateForm, ForwardForm, AiIssuePanel } from "@/components/QaActions";
import { Icon } from "@/components/icons";

export const metadata = { title: "Question" };

function Note({ icon, tone, title, children }: { icon: "teacher" | "check" | "inbox"; tone: "blue" | "green" | "grey"; title: string; children?: React.ReactNode }) {
  const styles = { blue: "border-pen/20 bg-pen-soft text-pen", green: "border-ok/25 bg-ok/10 text-ok", grey: "border-rule bg-paper text-ink-soft" }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${styles}`}>
      <Icon name={icon} className="mt-0.5 size-6 shrink-0" />
      <div><p className="font-semibold">{title}</p>{children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}</div>
    </div>
  );
}

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortal("student");
  const thread = await getThread(user, Number((await params).id));
  if (!thread) notFound();

  const lastReply = thread.messages.filter((m) => m.senderType !== "student").at(-1);

  return (
    <>
      <BackLink href="/student/questions">My Q&amp;A</BackLink>

      <Card className="mt-3 mb-6 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Badge tone="blue">{thread.subjectName}</Badge>
          <span>{thread.courseName}</span>
          <span className="text-ink-faint">· asked {fmtDateTime(thread.createdAt)}</span>
        </div>
        <QuestionProgress thread={thread} />
      </Card>

      <ThreadView thread={thread} viewer="student" />

      <div className="mt-6">
        {thread.status === "draft" && thread.aiVerdict && (
          <Card className="border-brand-orange/40 p-4 sm:p-6">
            <AiIssuePanel threadId={thread.id} verdict={thread.aiVerdict} note={thread.aiNote} question={thread.question ?? ""} />
          </Card>
        )}
        {thread.status === "draft" && !thread.aiVerdict && (
          <Card className="border-brand-orange/40 p-4 sm:p-6">
            <ConfirmForm threadId={thread.id} question={thread.question ?? ""} />
            {/* A figure the AI can't use well, or a voice note it misheard: a teacher is one tap away. */}
            <div className="mt-4 border-t border-rule pt-4"><ForwardForm threadId={thread.id} compact /></div>
          </Card>
        )}
        {thread.status === "awaiting_ai" && (
          <Card className="p-4 sm:p-6">
            <RetryForm threadId={thread.id} />
            <div className="mt-4 border-t border-rule pt-4"><ForwardForm threadId={thread.id} compact /></div>
          </Card>
        )}
        {(thread.status === "ai_answered" || thread.status === "answered") && lastReply && (
          <Card className="border-pen/25 p-4 shadow-[0_16px_40px_-28px_rgb(46_49_146/0.6)] sm:p-6">
            <RateForm threadId={thread.id} stage={thread.status === "ai_answered" ? "ai" : "teacher"} alreadyRated={Boolean(lastReply.rating)} />
          </Card>
        )}
        {thread.status === "escalated" && (
          <Note icon="teacher" tone="blue" title="Sent to a teacher">Their reply will appear right here. We&apos;ll also show it on your home page.</Note>
        )}
        {thread.status === "teacher_claimed" && (
          <Note icon="teacher" tone="blue" title={`${thread.teacherName ?? "A teacher"} is writing your answer`}>You can leave this page; the reply will be waiting for you.</Note>
        )}
        {thread.status === "resolved" && (
          <Note icon="check" tone="green" title="Solved — great work!">
            <div className="mt-2"><LinkButton href="/student/questions/new" size="sm"><Icon name="plus" className="size-4" /> Ask another question</LinkButton></div>
          </Note>
        )}
        {thread.status === "closed_timeout" && <Note icon="inbox" tone="grey" title="Closed">This question was closed after a week without activity.</Note>}
      </div>
    </>
  );
}
