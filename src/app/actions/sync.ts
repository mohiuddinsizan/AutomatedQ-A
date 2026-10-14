"use server";

import { revalidatePath } from "next/cache";
import { requirePortal } from "@/lib/dal";
import { db, schema } from "@/db";
import { runStudentSync, type SyncReport } from "@/lib/external/sync";
import { runResultSync, type ResultSyncReport } from "@/lib/external/results-sync";

export type SyncState = { report?: SyncReport; error?: string } | undefined;

export async function syncNow(_: SyncState, formData: FormData): Promise<SyncState> {
  const admin = await requirePortal("admin");
  const full = formData.get("full") === "on";

  try {
    const report = await runStudentSync({ trigger: "manual", full });
    await db.insert(schema.auditLogs).values({
      actorId: admin.id, action: full ? "sync.run.full" : "sync.run", entity: "sync_run",
      entityId: String(report.runId), after: report as unknown as Record<string, unknown>,
    });
    revalidatePath("/admin/sync");
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export type ResultSyncState = { report?: ResultSyncReport; error?: string } | undefined;

export async function syncResultsNow(_: ResultSyncState, formData: FormData): Promise<ResultSyncState> {
  const admin = await requirePortal("admin");
  const courseId = Number(formData.get("courseId")) || null;
  const all = formData.get("all") === "on";

  try {
    const report = await runResultSync({ trigger: "manual", courseIds: courseId ? [courseId] : undefined, all });
    await db.insert(schema.auditLogs).values({
      actorId: admin.id, action: "sync.results", entity: "sync_run", entityId: String(report.runId),
      after: { status: report.status, courses: report.courses.length, results: report.resultsWritten },
    });
    revalidatePath("/admin", "layout");
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
