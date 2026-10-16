/** Q&A and mentor-session rows for the bulk allowance tools: each can be left alone, added to, or set. */
function Row({ label, mode, value, hint }: { label: string; mode: string; value: string; hint: string }) {
  const opt = "cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft ring-1 ring-rule transition-colors has-[:checked]:bg-pen has-[:checked]:text-white has-[:checked]:ring-pen";
  return (
    <fieldset className="rounded-xl border border-rule p-4">
      <legend className="px-1 text-sm font-bold text-ink">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className={opt}><input type="radio" name={mode} value="keep" defaultChecked className="sr-only" />Don&apos;t change</label>
        <label className={opt}><input type="radio" name={mode} value="add" className="sr-only" />Add</label>
        <label className={opt}><input type="radio" name={mode} value="set" className="sr-only" />Set to</label>
        <input name={value} type="number" min={-999} max={999} defaultValue={0} aria-label={`${label} amount`}
          className="h-10 w-24 rounded-lg border border-rule bg-sheet px-3 text-center text-base font-bold text-ink focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15" />
      </div>
      <p className="mt-2 text-xs text-ink-faint">{hint}</p>
    </fieldset>
  );
}

export function BulkAllowanceFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Row label="Q&A" mode="qaMode" value="qa" hint="“Add” with a minus number takes some away (never below 0)." />
      <Row label="Mentor sessions" mode="sessionMode" value="sessions" hint="Example: Set to 2 gives everyone exactly 2 sessions." />
    </div>
  );
}
