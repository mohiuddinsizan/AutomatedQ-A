import Link from "next/link";

export type Tab = { href: string; label: string; count?: number; active: boolean; urgent?: boolean };

/** Filter pills that wrap onto a second line on phones instead of scrolling out of sight. */
export function Tabs({ items, label }: { items: Tab[]; label: string }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all
            ${t.active ? "btn-primary border-transparent" : "border-rule bg-sheet text-ink-soft shadow-sm hover:border-brand-indigo/40 hover:text-pen"}`}>
          {t.label}
          {t.count !== undefined && (
            <span className={`min-w-5 rounded-full px-1.5 text-center text-xs font-medium
              ${t.active ? "bg-white/20 text-white" : t.urgent && t.count ? "bg-warn/15 text-warn" : "bg-paper text-ink-faint"}`}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
