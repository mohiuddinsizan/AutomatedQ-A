import Link from "next/link";
import { buttonClass } from "./ui";

/**
 * Search box, course picker and status pills for the all-questions lists.
 * A plain GET form, so filters live in the URL and the back button works.
 */
export function QuestionFilters({
  q, course, status, courses, statuses, counts, teachers, teacher = null,
}: {
  q: string;
  course: number | null;
  status: string;
  teachers?: { id: number; name: string }[];
  teacher?: number | null;
  courses: { id: number; name: string }[];
  statuses: { key: string; label: string }[];
  counts?: Record<string, number>;
}) {
  const href = (next: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { q, course, teacher, status, ...next };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "status" && v === "all")) p.set(k, String(v));
    return `?${p}`;
  };
  return (
    <div className="mb-5 flex flex-col gap-3">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search question, student name or roll" aria-label="Search questions"
          className="h-11 flex-1 rounded-xl border border-rule bg-sheet px-3.5 text-base focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15" />
        {courses.length > 1 && (
          <select name="course" defaultValue={course ?? ""} aria-label="Course"
            className="h-11 rounded-xl border border-rule bg-sheet px-3 text-base sm:max-w-64">
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {teachers && teachers.length > 0 && (
          <select name="teacher" defaultValue={teacher ?? ""} aria-label="Teacher"
            className="h-11 rounded-xl border border-rule bg-sheet px-3 text-base sm:max-w-56">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <button className={buttonClass("primary")} style={{ height: "2.75rem" }}>Search</button>
      </form>
      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {statuses.map((s) => {
          const active = s.key === status;
          return (
            <Link key={s.key} href={href({ status: s.key, page: null })} aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-all
                ${active ? "btn-primary border-transparent" : "border-rule bg-sheet text-ink-soft shadow-sm hover:border-brand-indigo/40 hover:text-pen"}`}>
              {s.label}
              {counts?.[s.key] !== undefined && (
                <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-paper text-ink-faint"}`}>{counts[s.key]}</span>
              )}
            </Link>
          );
        })}
        {(q || course || teacher) && (
          <Link href={href({ q: null, course: null, teacher: null, page: null })} className="inline-flex h-9 items-center px-2 text-sm text-pen hover:underline">
            Clear search
          </Link>
        )}
      </nav>
    </div>
  );
}
