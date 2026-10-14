import { NextResponse, type NextRequest } from "next/server";
import { runStudentSync } from "@/lib/external/sync";
import { runResultSync } from "@/lib/external/results-sync";
import { closeIdleThreads } from "@/lib/housekeeping";

/**
 * Daily import, called by the hosting platform's scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/sync
 * Students first, so new rolls exist before their results arrive. Add ?all=1 to
 * also refresh results of archived courses.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const full = req.nextUrl.searchParams.get("full") === "1";
  const students = await runStudentSync({ trigger: "schedule", full });
  const results = await runResultSync({ trigger: "schedule", all: req.nextUrl.searchParams.get("all") === "1" });
  const housekeeping = await closeIdleThreads();
  const failed = students.status === "failed" || results.status === "failed";
  return NextResponse.json({ students, results, housekeeping }, { status: failed ? 500 : 200 });
}

export const dynamic = "force-dynamic";
