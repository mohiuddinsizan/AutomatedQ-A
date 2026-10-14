"use client";

import { useActionState } from "react";
import { syncNow, type SyncState } from "@/app/actions/sync";
import { Button, Alert } from "./ui";

export function SyncPanel() {
  const [state, action, pending] = useActionState<SyncState, FormData>(syncNow, undefined);
  const r = state?.report;

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import now"}</Button>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="full" className="size-4 accent-[var(--color-pen)]" />
          Read everything, not just what changed
        </label>
      </form>

      {pending && <p className="mt-4 text-sm text-ink-soft">Reading the result website. A first import of a thousand students takes a minute or two.</p>}
      {state?.error && <div className="mt-4"><Alert>{state.error}</Alert></div>}

      {r && (
        <div className="mt-6">
          <Alert tone={r.status === "failed" ? "error" : "ok"}>
            {r.status === "failed" ? `Import failed: ${r.error}`
              : `${r.mode === "full" ? "Full import" : "Update"} finished in ${r.seconds}s — ${r.read} records read.`}
          </Alert>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
            {[
              ["New students", r.studentsCreated],
              ["Students updated", r.studentsUpdated],
              ["New courses", r.coursesCreated],
              ["New enrollments", r.enrollmentsCreated],
              ["Enrollments ended", r.enrollmentsDropped],
              ["Accounts disabled", r.accountsDisabled],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-sheet p-4">
                <dd className="font-display text-2xl text-ink">{value as number}</dd>
                <dt className="mt-1 text-sm text-ink-soft">{label as string}</dt>
              </div>
            ))}
          </dl>

          {r.noPhone.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              <strong className="font-medium text-ink">{r.noPhone.length} new student{r.noPhone.length === 1 ? "" : "s"} arrived without a phone number</strong>{" "}
              so they have no usable password yet. Reset it for them when they ask. Rolls: {r.noPhone.slice(0, 20).join(", ")}
              {r.noPhone.length > 20 && ` and ${r.noPhone.length - 20} more`}.
            </p>
          )}
          {r.nameConflicts.length > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              {r.nameConflicts.length} student name{r.nameConflicts.length === 1 ? " was" : "s were"} changed upstream and updated here: {r.nameConflicts.slice(0, 20).join(", ")}.
            </p>
          )}
          {r.dropCheckSkipped && (
            <p className="mt-2 text-sm text-ink-soft">Ended enrollments were not applied this time: {r.dropCheckSkipped}</p>
          )}
          {r.bad.length > 0 && (
            <div className="mt-4 rounded-lg border border-rule bg-sheet p-4">
              <p className="font-medium text-ink">{r.bad.length} record{r.bad.length === 1 ? "" : "s"} could not be imported</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {r.bad.slice(0, 10).map((b, i) => (
                  <li key={i}>Roll {b.roll ?? "(unknown)"}: {b.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
