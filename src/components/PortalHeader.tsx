import Link from "next/link";
import { BrandMark } from "./Brand";
import { logout } from "@/app/actions/auth";
import type { Portal } from "@/lib/roles";
import { Icon } from "./icons";
import { TopNav, BottomNav, MobileMenu, type NavItem } from "./NavLinks";

const LABELS: Record<Portal, string> = { student: "Student", teacher: "Teacher", admin: "Admin" };

export function PortalHeader({
  portal, name, sub, nav = [],
}: {
  portal: Portal;
  name: string;
  sub?: string;
  nav?: NavItem[];
}) {
  return (
    <>
      <header className="brand-bar sticky top-0 z-30 text-white shadow-[0_8px_24px_-12px_rgb(20_22_74/0.6)]">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <BrandMark href={`/${portal}`} sub={`${LABELS[portal]} portal`} />
          <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
            <span className="mr-2 hidden text-right leading-tight sm:block">
              <span className="block font-medium text-white">{name}</span>
              {sub && <span className="block text-xs text-white/55">{sub}</span>}
            </span>
            <Link href="/account/password" title="Change password"
              className="grid size-10 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <Icon name="key" />
              <span className="sr-only">Change password</span>
            </Link>
            <form action={logout}>
              <input type="hidden" name="portal" value={portal} />
              <button title="Sign out" className="grid size-10 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                <Icon name="logout" />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
        {nav.length > 0 && (
          <div className="mx-auto max-w-5xl px-3 md:px-2">
            {/* A short menu fits on a phone; a long one folds into a Menu button there. */}
            <TopNav items={nav} alwaysVisible={portal !== "student" && nav.length <= 3} />
            {portal !== "student" && nav.length > 3 && <MobileMenu items={nav} />}
          </div>
        )}
        <div className="brand-stripe h-[3px]" aria-hidden />
      </header>
      {portal === "student" && nav.length > 0 && <BottomNav items={nav} />}
    </>
  );
}

export function PageTitle({ children, sub, action }: { children: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
      <div className="min-w-0">
        <h1 className="text-gradient pb-0.5 text-[1.85rem] leading-tight sm:text-[2.1rem]">{children}</h1>
        {sub && <p className="mt-1.5 text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
