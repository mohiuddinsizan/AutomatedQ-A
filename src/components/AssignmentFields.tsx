/** Checkbox grids for a teacher's courses and subjects (server-rendered inside a form). */
export function AssignmentFields({
  courses, subjects, courseIds = [], subjectIds = [],
}: {
  courses: { id: number; name: string; status: string }[];
  subjects: { id: number; name: string }[];
  courseIds?: number[];
  subjectIds?: number[];
}) {
  const box = "flex items-center gap-2 rounded-md border border-rule px-3 py-2 text-sm text-ink has-[:checked]:border-pen/40 has-[:checked]:bg-pen-soft";
  return (
    <>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">Courses</legend>
        <p className="mb-2 text-sm text-ink-soft">The teacher only sees questions from these courses.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {courses.map((c) => (
            <label key={c.id} className={box}>
              <input type="checkbox" name="courseIds" value={c.id} defaultChecked={courseIds.includes(c.id)} className="size-4 accent-[var(--color-pen)]" />
              <span className="min-w-0 truncate">{c.name}</span>
              {c.status !== "active" && <span className="ml-auto text-xs text-ink-faint">archived</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">Subjects</legend>
        <p className="mb-2 text-sm text-ink-soft">Narrow to these subjects. Leave all unticked for every subject in those courses.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {subjects.map((x) => (
            <label key={x.id} className={box}>
              <input type="checkbox" name="subjectIds" value={x.id} defaultChecked={subjectIds.includes(x.id)} className="size-4 accent-[var(--color-pen)]" />
              {x.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
