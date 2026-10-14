import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { PageTitle } from "@/components/PortalHeader";
import { SyncPanel } from "@/components/SyncPanel";
import { ResultSyncPanel } from "@/components/ResultSyncPanel";
import { Card } from "@/components/ui";

export const metadata = { title: "Data import" };
export const dynamic = "force-dynamic";

const dhaka = (d: Date) => d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });

export default async function SyncPage() {
  await requirePortal("admin");
  const runs = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(12);
  const configured = Boolean(process.env.EXTERNAL_STUDENT_API_BASE_URL && process.env.EXTERNAL_STUDENT_API_KEY);

  return (
    <>
      <PageTitle sub="Students, courses, enrollments and results are copied from BigBang. This runs automatically every day; use the buttons to run it now.">
        Data import
      </PageTitle>

      {!configured ? (
        <p className="rounded-lg border border-rule bg-sheet p-4 text-ink-soft">
          The result website isn&apos;t connected yet. Add <code className="text-ink">EXTERNAL_STUDENT_API_BASE_URL</code> and{" "}
          <code className="text-ink">EXTERNAL_STUDENT_API_KEY</code> to the server settings, then restart.
        </p>
      ) : (
        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="mb-1 text-xl text-ink">Students and courses</h2>
            <p className="mb-4 text-sm text-ink-soft">Run this first when new students have joined, so their results can be matched.</p>
            <SyncPanel />
          </Card>
          <Card className="p-5">
            <h2 className="mb-1 text-xl text-ink">Results</h2>
            <p className="mb-4 text-sm text-ink-soft">Every exam and mark of the active courses. Ranks are recalculated afterwards.</p>
            <ResultSyncPanel />
          </Card>
        </div>
      )}

      <h2 className="mt-12 mb-3 text-xl text-ink">Recent imports</h2>
      {runs.length === 0 ? (
        <p className="text-ink-soft">Nothing has been imported yet.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[34rem] border-y border-rule text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-2 font-medium">When</th>
              <th className="py-2 font-medium">What</th>
              <th className="py-2 font-medium">Started by</th>
              <th className="py-2 font-medium">Result</th>
              <th className="py-2 text-right font-medium">New</th>
              <th className="py-2 text-right font-medium">Updated</th>
              <th className="py-2 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-ink">{dhaka(r.startedAt)}</td>
                <td className="py-2 text-ink-soft">{r.kind === "results" ? "Results" : "Students"}</td>
                <td className="py-2 text-ink-soft">{r.trigger === "manual" ? "An admin" : "Daily schedule"}</td>
                <td className="py-2 text-ink-soft">{r.status}</td>
                <td className="py-2 text-right text-ink-soft">{r.created}</td>
                <td className="py-2 text-right text-ink-soft">{r.updated}</td>
                <td className="py-2 text-right text-ink-soft">{r.failed}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
