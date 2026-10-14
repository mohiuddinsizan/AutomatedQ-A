import Link from "next/link";

/** Small shared building blocks so every screen looks consistent. */

const inputClass = `w-full rounded-xl border border-rule bg-sheet px-3.5 text-base text-ink shadow-[inset_0_1px_2px_rgb(22_25_70/0.04)]
  placeholder:text-ink-faint transition-colors hover:border-pen/30
  focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15 disabled:bg-paper disabled:text-ink-faint`;

export function Field({
  label, hint, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <input id={id} {...props} className={`h-12 ${inputClass} ${props.className ?? ""}`} />
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label, hint, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>}
      <textarea id={id} rows={4} {...props} className={`py-2.5 leading-relaxed ${inputClass} ${props.className ?? ""}`} />
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Select({
  label, hint, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <select id={id} {...props} className={`h-12 ${inputClass} ${props.className ?? ""}`}>{children}</select>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type AllVariants = Variant | "accent";
const variants: Record<AllVariants, string> = {
  primary: "btn-primary",
  accent: "btn-accent",
  secondary: "border border-rule bg-sheet text-ink shadow-sm hover:border-brand-indigo/40 hover:bg-pen-soft hover:text-pen",
  ghost: "text-pen hover:bg-pen-soft",
  danger: "border border-error/30 bg-sheet text-error hover:bg-error/5",
};
export const buttonClass = (variant: AllVariants = "primary", size: "md" | "sm" = "md") =>
  `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[.98]
   disabled:cursor-not-allowed disabled:opacity-55 ${size === "md" ? "h-12 px-5" : "h-9 rounded-lg px-3.5 text-sm"} ${variants[variant]}`;

export function Button({
  children, className = "", variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AllVariants; size?: "md" | "sm" }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`}>{children}</button>;
}

export function LinkButton({
  href, children, variant = "primary", size = "md", className = "",
}: { href: string; children: React.ReactNode; variant?: AllVariants; size?: "md" | "sm"; className?: string }) {
  return <Link href={href} className={`${buttonClass(variant, size)} ${className}`}>{children}</Link>;
}

type Tone = "error" | "ok" | "info" | "warn";
const alertTones: Record<Tone, string> = {
  error: "border-error/25 bg-gradient-to-r from-error/10 to-error/[0.03] text-error",
  ok: "border-ok/25 bg-gradient-to-r from-ok/10 to-ok/[0.03] text-ok",
  info: "border-brand-indigo/20 bg-gradient-to-r from-brand-indigo/10 to-transparent text-ink",
  warn: "border-warn/25 bg-gradient-to-r from-brand-orange/15 to-brand-orange/[0.03] text-warn",
};
export function Alert({ tone = "error", children }: { tone?: Tone; children: React.ReactNode }) {
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-medium ${alertTones[tone]}`}>{children}</div>;
}

export function Card({ children, className = "", as: Tag = "section" }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

const badgeTones = {
  neutral: "bg-paper text-ink-soft border-rule",
  blue: "bg-brand-indigo/10 text-pen border-brand-indigo/20",
  green: "bg-ok/10 text-ok border-ok/25",
  amber: "bg-brand-orange/15 text-warn border-brand-orange/30",
  red: "bg-brand-red/10 text-error border-brand-red/25",
} as const;
export type BadgeTone = keyof typeof badgeTones;
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card relative overflow-hidden px-6 py-12 text-center">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-indigo/[0.07] to-transparent" aria-hidden />
      <span className="chip-navy relative mx-auto mb-4 grid size-14 place-items-center rounded-2xl text-2xl" aria-hidden>✦</span>
      <p className="relative font-display text-xl text-ink">{title}</p>
      {children && <div className="relative mx-auto mt-2 max-w-md text-ink-soft">{children}</div>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}

const STAT_ACCENTS = [
  "from-brand-navy to-brand-indigo",
  "from-brand-orange to-[#ffb347]",
  "from-brand-red to-[#ff6b6b]",
  "from-[#15803d] to-[#34d399]",
  "from-brand-indigo to-brand-navy",
];

/** Headline numbers, each on its own card with a strip of a logo colour. */
export function StatGrid({ items, cols = 4 }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[]; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[cols];
  return (
    <dl className={`grid grid-cols-2 gap-3 ${grid}`}>
      {items.map((x, i) => (
        <div key={x.label} className="card relative flex flex-col overflow-hidden p-4 pt-5">
          <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${STAT_ACCENTS[i % STAT_ACCENTS.length]}`} aria-hidden />
          <dt className="order-2 mt-1 text-sm font-medium text-ink-soft">{x.label}</dt>
          <dd className="order-1 font-display text-2xl text-ink sm:text-3xl">{x.value}</dd>
          {x.sub && <dd className="order-3 text-xs text-ink-faint">{x.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-2">
      <h2 className="flex items-center gap-2.5 text-xl text-ink">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-brand-orange to-brand-red" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-pen underline-offset-4 hover:underline">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/** Wide tables scroll sideways on phones instead of squashing. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><div className="card min-w-full overflow-hidden [&_thead]:bg-gradient-to-r [&_thead]:from-pen-soft [&_thead]:to-sheet">{children}</div></div>;
}

export const th = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-pen/70";
export const td = "px-3 py-3 align-top";

export function Stars({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  if (!value) return <span className="text-sm text-ink-faint">Not rated</span>;
  const v = Math.round(value * 10) / 10;
  return (
    <span className={`inline-flex items-center gap-1 ${size === "md" ? "text-base" : "text-sm"}`} aria-label={`${v} out of 5`}>
      <span className="tracking-tight text-gold" aria-hidden>
        {"★".repeat(Math.round(v))}<span className="text-rule">{"★".repeat(5 - Math.round(v))}</span>
      </span>
      <span className="text-ink-soft">{v}</span>
    </span>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pages">
      {page > 1 ? <Link className={buttonClass("secondary", "sm")} href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-ink-soft">Page {page} of {pages}</span>
      {page < pages ? <Link className={buttonClass("secondary", "sm")} href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
