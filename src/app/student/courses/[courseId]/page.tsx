import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { studentCourse, studentResults, percentOf } from "@/lib/results";
import { fmtDate, fmtMark } from "@/lib/format";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Badge, Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePortal("student");
  const course = await studentCourse(user.id, Number((await params).courseId));
  if (!course) notFound();

  const [results, [quota]] = await Promise.all([
    studentResults(user.id, course.id),
    db.select().from(schema.quotas).where(and(eq(schema.quotas.studentId, user.id), eq(schema.quotas.courseId, course.id))).limit(1),
  ]);
  const latest = results.find((r) => r.marks !== null);
  const active = course.status === "active" && course.enrollment === "active";
  const pct = latest ? percentOf(latest) : null;

  const tiles: { href: string; icon: IconName; title: string; text: string; meta: string; show: boolean; chip: string }[] = [
    {
      href: `/student/courses/${course.id}/results`, icon: "chart", title: "Results",
      text: latest ? `Latest: ${latest.title}` : "Your marks appear here after each exam.",
      meta: latest ? `${fmtMark(latest.marks)}${latest.totalMarks ? ` / ${fmtMark(latest.totalMarks)}` : ""}${pct !== null ? ` · ${pct}%` : ""}${latest.rank ? ` · rank ${latest.rank}` : ""}` : `${results.length} exams`,
      show: true, chip: "chip-navy",
    },
    {
      href: `/student/courses/${course.id}/leaderboard`, icon: "trophy", title: "Leaderboard",
      text: "See where you stand across every exam in this course.", meta: course.leaderboardPublished ? "Updated after each exam" : "Not published yet",
      show: true, chip: "chip-orange",
    },
    {
      href: `/student/questions/new?course=${course.id}`, icon: "chat", title: "Ask a question",
      text: "Type it, snap a photo or record a voice note. Get an answer in seconds, and a teacher if you need one.",
      meta: `${quota?.qaRemaining ?? 0} questions left`, show: active, chip: "chip-red",
    },
    {
      href: `/student/mentor/new?course=${course.id}`, icon: "calendar", title: "Mentor session",
      text: "Book one-to-one help on a topic you're stuck on.", meta: `${quota?.sessionRemaining ?? 0} sessions left`, show: active, chip: "chip-green",
    },
  ];

  return (
    <>
      <BackLink href="/student">Home</BackLink>
      <div className="mt-3">
        <PageTitle sub={<>{course.batch && <>Session {course.batch} · </>}{active ? "Active course" : "Past course — results only"}</>}>
          {course.name}
        </PageTitle>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.filter((t) => t.show).map((t) => (
          <Link key={t.title} href={t.href} className="group">
            <Card className="flex h-full gap-4 p-5 card-hover">
              <span className={`${t.chip} grid size-12 shrink-0 place-items-center rounded-2xl`}><Icon name={t.icon} className="size-6" /></span>
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-xl text-ink group-hover:text-pen">{t.title}</span>
                <span className="mt-1 text-sm text-ink-soft">{t.text}</span>
                <span className="mt-3 text-sm font-medium text-ink">{t.meta}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
      {course.resultsSyncedAt && (
        <p className="mt-6 text-xs text-ink-faint">Results last updated {fmtDate(course.resultsSyncedAt)}. {!active && <Badge>Past course</Badge>}</p>
      )}
    </>
  );
}
