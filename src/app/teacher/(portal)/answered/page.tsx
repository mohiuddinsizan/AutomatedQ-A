import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { teacherScope, scopeWhere, questionRows } from "@/lib/qa";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, EmptyState } from "@/components/ui";
import { QuestionList } from "@/components/QuestionList";

export const metadata = { title: "Answered questions" };

export default async function TeacherAnswered() {
  const user = await requirePortal("teacher");
  const scope = await teacherScope(user.id);
  const t = schema.qaThreads;
  const rows = await questionRows(
    and(scopeWhere(scope), eq(t.teacherId, user.id), inArray(t.status, ["answered", "resolved", "closed_timeout"])),
    { order: "newest" },
  );

  return (
    <>
      <BackLink href="/teacher">All courses</BackLink>
      <div className="mt-3"><PageTitle sub="Your replies across every course, with the students' ratings.">Answered by you</PageTitle></div>
      {rows.length === 0 ? <EmptyState title="Nothing answered yet" /> : <QuestionList rows={rows} href={(id) => `/teacher/questions/${id}`} showCourse />}
    </>
  );
}
