import "server-only";
import { z } from "zod";

/**
 * Client for the external student API.
 * The key is read from the environment and never leaves the server.
 */

export const externalItemSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  course_name: z.string(),
  course_code: z.string().nullish(),
  course_session: z.string().nullish(),
  course_is_archived: z.boolean().default(false),
  course_is_deleted: z.boolean().default(false),
  roll: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  phone_number: z.string().nullish(),
  guardian_phone_number: z.string().nullish(),
  branch: z.string().nullish(),
  is_deleted: z.boolean().default(false),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type ExternalItem = z.infer<typeof externalItemSchema>;

const responseSchema = z.object({
  success: z.boolean().optional(),
  generated_at: z.string().optional(),
  items: z.array(z.unknown()),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number().optional(),
    total_pages: z.number().optional(),
    has_more: z.boolean(),
  }),
});

export type BadRecord = { index: number; roll?: string; reason: string };

export function externalApiConfig() {
  const baseUrl = process.env.EXTERNAL_STUDENT_API_BASE_URL;
  const apiKey = process.env.EXTERNAL_STUDENT_API_KEY;
  if (!baseUrl) throw new Error("EXTERNAL_STUDENT_API_BASE_URL is not set in .env");
  if (!apiKey || apiKey.length < 32) throw new Error("EXTERNAL_STUDENT_API_KEY is missing or shorter than 32 characters");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function getJson(url: string, apiKey: string, attempt = 1): Promise<unknown> {
  const TIMEOUT_MS = 30_000;
  const MAX_ATTEMPTS = 3;
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("The external API rejected our key (check EXTERNAL_STUDENT_API_KEY).");
    }
    if (res.status === 429 || res.status >= 500) throw new Error(`External API returned ${res.status}`);
    if (!res.ok) throw new Error(`External API returned ${res.status}`);
    return await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const clientError = /returned 4\d\d/.test(message) && !message.includes("returned 429");
    const retryable = !message.includes("rejected our key") && !clientError;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // 1s, then 2s
      return getJson(url, apiKey, attempt + 1);
    }
    throw new Error(`${message} (after ${attempt} attempt${attempt > 1 ? "s" : ""})`);
  }
}

/**
 * Walks every page of the API, yielding validated records.
 * Records that don't match the documented shape are collected in `bad`
 * instead of stopping the whole import.
 */
export async function* fetchStudents(opts: { updatedSince?: string | null; limit?: number; bad: BadRecord[] }) {
  const { baseUrl, apiKey } = externalApiConfig();
  const limit = opts.limit ?? 500;
  const MAX_PAGES = 500; // safety net against an endless loop
  let page = 1;
  let seen = 0;

  while (page <= MAX_PAGES) {
    const url = new URL(`${baseUrl}/external/v1/students`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    // Ask for deleted records too, so we can disable accounts that were removed upstream.
    url.searchParams.set("include_deleted", "true");
    if (opts.updatedSince) url.searchParams.set("updated_since", opts.updatedSince);

    const body = responseSchema.parse(await getJson(url.toString(), apiKey));

    for (const raw of body.items) {
      const parsed = externalItemSchema.safeParse(raw);
      if (parsed.success) {
        yield parsed.data;
      } else {
        const r = raw as Record<string, unknown>;
        opts.bad.push({
          index: seen,
          roll: typeof r?.roll === "string" || typeof r?.roll === "number" ? String(r.roll) : undefined,
          reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      seen++;
    }

    if (!body.pagination.has_more) return;
    page++;
  }
  throw new Error(`Stopped after ${MAX_PAGES} pages — the API kept reporting more data.`);
}

/** Rolls with a live (not deleted) record in one course, used to double-check a deletion. */
export async function fetchLiveRolls(courseExternalId: string) {
  const { baseUrl, apiKey } = externalApiConfig();
  const rolls = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const url = new URL(`${baseUrl}/external/v1/students`);
    url.searchParams.set("course_id", courseExternalId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "1000");
    const body = responseSchema.parse(await getJson(url.toString(), apiKey));
    for (const raw of body.items) {
      const r = (raw as { roll?: unknown }).roll;
      if (typeof r === "string" || typeof r === "number") rolls.add(String(r).trim());
    }
    if (!body.pagination.has_more) return rolls;
  }
  throw new Error("Course roster kept reporting more pages.");
}

/* ---------- Results ---------- */

const num = z.number().nullish().transform((v) => v ?? null);

const examSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  exam_date: z.string().nullish(),
  full_mcq_mark: num,
  full_written_mark: num,
});

const examResultSchema = z.object({
  exam_id: z.string(),
  sat_mcq: z.boolean(),
  sat_written: z.boolean(),
  mcq_mark: num,
  written_mark: num,
  total_mark: num,
  correct: z.number().int().nullish().transform((v) => v ?? null),
  incorrect: z.number().int().nullish().transform((v) => v ?? null),
  skipped: z.number().int().nullish().transform((v) => v ?? null),
  questions: z.number().int().nullish().transform((v) => v ?? null),
});

const studentResultsSchema = z.object({
  roll: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  name: z.string().nullish(),
  phone_number: z.string().nullish(),
  enrolled: z.boolean(),
  results: z.array(examResultSchema),
});

const resultsPageSchema = z.object({
  exams: z.array(examSchema),
  items: z.array(studentResultsSchema),
  pagination: z.object({ has_more: z.boolean() }),
});

export type ExternalExam = z.infer<typeof examSchema>;
export type ExternalStudentResults = z.infer<typeof studentResultsSchema>;

/** Every exam and every student's results for one course, all pages read. */
export async function fetchCourseResults(courseExternalId: string) {
  const { baseUrl, apiKey } = externalApiConfig();
  let exams: ExternalExam[] = [];
  const students: ExternalStudentResults[] = [];

  for (let page = 1; page <= 200; page++) {
    const url = new URL(`${baseUrl}/external/v1/courses/${encodeURIComponent(courseExternalId)}/results`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "1000");
    const body = resultsPageSchema.parse(await getJson(url.toString(), apiKey));
    if (page === 1) exams = body.exams;
    students.push(...body.items);
    if (!body.pagination.has_more) return { exams, students };
  }
  throw new Error("Results kept reporting more pages.");
}
