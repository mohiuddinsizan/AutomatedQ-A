import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { studentCourses } from "@/lib/results";
import { subjectsForCourse } from "@/lib/qa";
import { PageTitle } from "@/components/PortalHeader";
import { BackLink, Card, EmptyState } from "@/components/ui";
import { MentorRequestForm } from "@/components/MentorRequestForm";

export const metadata = { title: "Request a mentor session" };

export default async function NewMentorPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requirePortal("student");
  const courses = (await studentCourses(user.id)).filter((c) => c.active);
  const back = <BackLink href="/student/mentor">Mentor sessions</BackLink>;
  if (courses.length === 0) {
    return <>{back}<div className="mt-3"><PageTitle>Request a mentor session</PageTitle></div>
      <EmptyState title="No active course">Mentor sessions are available while you&apos;re enrolled in an active course.</EmptyState></>;
  }

  const wanted = Number((await searchParams).course);
  const subjects = Object.fromEntries(await Promise.all(courses.map(async (c) => [c.id, await subjectsForCourse(c.id)] as const)));
  const [me] = await db.select({ phone: schema.users.phone }).from(schema.users).where(eq(schema.users.id, user.id));

  return (
    <>
      {back}
      <div className="mt-3">
        <PageTitle sub="Tell us what you need help with. The office schedules a mentor and sends you the time and their number.">
          Request a mentor session
        </PageTitle>
      </div>
      <Card className="p-4 sm:p-6">
        <MentorRequestForm
          courses={courses.map((c) => ({ id: c.id, name: c.name, left: c.sessions ?? 0 }))}
          subjects={subjects}
          defaultCourse={courses.find((c) => c.id === wanted)?.id ?? courses[0].id}
          phone={me?.phone ?? ""}
        />
      </Card>
    </>
  );
}
