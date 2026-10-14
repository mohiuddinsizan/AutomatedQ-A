"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean; also?: string[] };

function isActive(path: string, item: NavItem) {
  if (item.also?.some((p) => path === p || path.startsWith(p + "/"))) return true;
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}

function Count({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-brand-orange to-brand-red px-1.5 text-[0.7rem] font-bold text-white shadow">{n}</span>;
}

/** Tabs on the dark header bar. */
export function TopNav({ items, alwaysVisible }: { items: NavItem[]; alwaysVisible?: boolean }) {
  const path = usePathname();
  return (
    <nav className={`${alwaysVisible ? "flex" : "hidden md:flex"} gap-1 overflow-x-auto pb-2.5`} aria-label="Main">
      {items.map((item) => {
        const active = isActive(path, item);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors
              ${active ? "bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
            <Icon name={item.icon} className={`size-4 ${active ? "text-brand-orange" : ""}`} />
            {item.label}
            <Count n={item.badge} />
            {active && <span className="absolute inset-x-3 -bottom-2.5 h-0.5 rounded-full bg-gradient-to-r from-brand-orange to-brand-red" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Students on phones: a floating tab bar within thumb reach. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 md:hidden">
      <ul className="brand-bar grid rounded-2xl p-1.5 shadow-[0_16px_40px_-10px_rgb(20_22_74/0.7)] ring-1 ring-white/10"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(path, item);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[0.7rem] font-semibold transition-colors
                  ${active ? "bg-gradient-to-br from-brand-orange to-brand-red text-white shadow-lg" : "text-white/65"}`}>
                <Icon name={item.icon} className="size-6" />
                {item.label}
                {item.badge ? (
                  <span className={`absolute top-1 right-[18%] grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold
                    ${active ? "bg-white text-brand-red" : "bg-brand-red text-white"}`}>{item.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Staff portals on phones: one button that opens the full menu, instead of a cut-off row. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const current = items.find((i) => isActive(path, i)) ?? items[0];
  const pending = items.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <details className="group relative pb-2.5 md:hidden" key={path}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
        <Icon name={current.icon} className="size-4 text-brand-orange" /> {current.label}
        <Count n={pending} />
        <span className="ml-auto inline-flex items-center gap-1 text-white/70">
          Menu <Icon name="chevron" className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {items.map((item) => {
          const active = isActive(path, item);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium
                  ${active ? "bg-gradient-to-br from-brand-orange to-brand-red text-white" : "bg-white/10 text-white/85"}`}>
                <Icon name={item.icon} className="size-4" />
                {item.label}
                <span className="ml-auto"><Count n={item.badge} /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
