"use client";

import { useActionState } from "react";
import { syncResultsNow, type ResultSyncState } from "@/app/actions/sync";
import { Alert, Button } from "./ui";

export function ResultSyncPanel({ courseId, label = "Import results now" }: { courseId?: number; label?: string }) {
  const [state, action, pending] = useActionState<ResultSyncState, FormData>(syncResultsNow, undefined);
  const r = state?.report;

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-4">
        {courseId && <input type="hidden" name="courseId" value={courseId} />}
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Importing results…" : label}</Button>
        {!courseId && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="all" className="size-4 accent-[var(--color-pen)]" />
            Include archived courses
          </label>
        )}
      </form>
      {pending && <p className="mt-3 text-sm text-ink-soft">Reading results from BigBang. A large course takes 10–30 seconds.</p>}
      {state?.error && <div className="mt-3"><Alert>{state.error}</Alert></div>}
      {r && (
        <div className="mt-4 flex flex-col gap-3">
          <Alert tone={r.status === "success" ? "ok" : r.status === "failed" ? "error" : "warn"}>
            {r.status === "failed" ? `Import failed${r.error ? `: ${r.error}` : ""}.`
              : `Done in ${r.seconds}s — ${r.resultsWritten.toLocaleString()} results across ${r.courses.length} course${r.courses.length === 1 ? "" : "s"}, ${r.examsCreated} new exam${r.examsCreated === 1 ? "" : "s"}.`}
          </Alert>
          {r.courses.some((c) => c.error) && (
            <ul className="text-sm text-error">{r.courses.filter((c) => c.error).map((c) => <li key={c.id}>{c.name}: {c.error}</li>)}</ul>
          )}
          {r.unknownRolls.length > 0 && (
            <p className="text-sm text-ink-soft">
              Results for rolls with no portal account were skipped (usually a mistyped roll, or a student added after the last student import):{" "}
              {r.unknownRolls.slice(0, 20).join(", ")}{r.unknownRolls.length > 20 && " …"}
            </p>
          )}
          {r.identityConflicts.length > 0 && (
            <p className="text-sm text-warn">
              Some results were held back because the roll belongs to a different person in this course than the portal account
              (same roll, different name and phone): {r.identityConflicts.slice(0, 20).join(", ")}{r.identityConflicts.length > 20 && " …"}
            </p>
          )}
          {r.resultsWithdrawn > 0 && <p className="text-sm text-ink-soft">{r.resultsWithdrawn} results are no longer in BigBang and are now hidden.</p>}
        </div>
      )}
    </div>
  );
}
