/** Display helpers, safe on server and browser. Times are shown in Bangladesh time. */
const TZ = "Asia/Dhaka";

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—";

export function fmtAgo(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}

/** 18.75 -> "18.75", 20 -> "20", null -> "—" */
export const fmtMark = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

export function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export const hoursSince = (d: Date | string) => (Date.now() - new Date(d).getTime()) / 3600_000;

export const currentYear = () => new Date().getFullYear();

/** Today's date in Bangladesh as YYYY-MM-DD, e.g. for a date input's minimum. */
export const dhakaToday = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
