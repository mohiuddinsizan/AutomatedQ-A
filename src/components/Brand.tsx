import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { currentYear } from "@/lib/format";
import { FacebookIcon, PinIcon, WhatsAppIcon } from "./icons";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <Image src="/bigbang.png" alt="" width={size} height={size} className={`shrink-0 ${className}`} priority />;
}

/** Logo + name, used in every header (on the dark bar). */
export function BrandMark({ href, sub }: { href: string; sub?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5" aria-label={`${BRAND.name} home`}>
      <span className="rounded-full bg-white p-0.5 shadow-[0_0_0_3px_rgb(247_148_29/0.35),0_6px_18px_-4px_rgb(0_0_0/0.5)]"><Logo size={38} /></span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[0.95rem] font-bold tracking-wide text-white sm:text-base">{BRAND.name}</span>
        {sub && <span className="block text-xs font-semibold tracking-wide text-brand-orange">{sub}</span>}
      </span>
    </Link>
  );
}

/** WhatsApp and Facebook buttons, for "contact us to enroll" and the footer. */
export function ContactButtons({ size = "md" }: { size?: "md" | "sm" }) {
  const base = `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ${size === "md" ? "h-11 px-4" : "h-9 px-3 text-sm"}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a href={BRAND.whatsapp} target="_blank" rel="noreferrer" className={`${base} bg-[#25d366] text-white hover:bg-[#1fb457]`}>
        <WhatsAppIcon /> WhatsApp {BRAND.phone}
      </a>
      <a href={BRAND.facebook} target="_blank" rel="noreferrer" className={`${base} bg-[#1877f2] text-white hover:bg-[#0f63d1]`}>
        <FacebookIcon /> Facebook page
      </a>
    </div>
  );
}

export function SiteFooter({ withBottomNav = false }: { withBottomNav?: boolean }) {
  return (
    <footer className={`brand-hero relative mt-16 overflow-hidden text-white/80 ${withBottomNav ? "pb-24 md:pb-0" : ""}`}>
      <div className="brand-stripe h-1" aria-hidden />
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white p-1"><Logo size={44} /></span>
            <span className="text-lg font-bold tracking-wide text-white">{BRAND.name}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">
            Results, answers to your questions and one-to-one mentor help — everything for your exam preparation in one place.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-white uppercase">Contact</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <a href={BRAND.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                <WhatsAppIcon className="size-4 text-[#25d366]" /> {BRAND.phone}
              </a>
            </li>
            <li>
              <a href={BRAND.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                <FacebookIcon className="size-4 text-[#4b9bff]" /> facebook.com/BigBangExamCare
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-white uppercase">Visit us</h2>
          <p className="mt-3 flex gap-2 text-sm leading-relaxed">
            <PinIcon className="mt-0.5 size-4 shrink-0 text-brand-orange" /> {BRAND.address}
          </p>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-white/60">© {currentYear()} {BRAND.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}
