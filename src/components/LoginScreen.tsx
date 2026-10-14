import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { homeForRole } from "@/lib/roles";
import { LoginForm } from "./LoginForm";
import { Logo, SiteFooter } from "./Brand";
import { BRAND } from "@/lib/brand";

type Props = {
  portal: "student" | "teacher" | "admin";
  title: string;
  intro: string;
  usernameLabel: string;
  usernameHint?: string;
  passwordHint?: string;
  footer?: React.ReactNode;
};

export async function LoginScreen(props: Props) {
  // Already signed in with a valid session? Go straight to the right portal.
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/account/password" : homeForRole(user.role));

  return (
    <>
      <div className="brand-stripe h-1" aria-hidden />
      <main className="mx-auto grid min-h-[calc(100dvh-0.25rem)] max-w-5xl items-center gap-8 px-4 py-8 md:grid-cols-[1.1fr_1fr] md:py-12">
        <section className="brand-hero relative hidden overflow-hidden rounded-3xl p-10 text-white shadow-[0_30px_60px_-30px_rgb(20_22_74/0.9)] md:block">
          <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
          <span className="relative inline-block rounded-full bg-white p-2 shadow-[0_0_0_6px_rgb(247_148_29/0.3)]"><Logo size={88} /></span>
          <h2 className="relative mt-6 text-3xl font-bold tracking-wide">{BRAND.name}</h2>
          <p className="relative mt-2 max-w-sm text-white/80">Your exam preparation, all in one place.</p>
          <ul className="relative mt-8 space-y-3 text-white/90">
            {["Every result, rank and leaderboard", "Ask any question — by text, photo or voice", "One-to-one help from mentors"].map((x) => (
              <li key={x} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-brand-orange text-sm font-bold text-white" aria-hidden>✓</span>{x}
              </li>
            ))}
          </ul>
        </section>

        <div className="w-full">
          <div className="mb-6 flex flex-col items-center text-center md:hidden">
            <Logo size={84} />
            <p className="mt-3 text-lg font-bold tracking-wide text-pen">{BRAND.name}</p>
          </div>
          <div className="card overflow-hidden rounded-3xl">
            <div className="brand-stripe h-1.5" aria-hidden />
            <div className="border-b border-rule px-6 pt-7 pb-5 sm:px-8">
              <h1 className="text-gradient text-[1.9rem]">{props.title}</h1>
              <p className="mt-1 text-ink-soft">{props.intro}</p>
            </div>
            <div className="px-6 py-7 sm:px-8">
              <LoginForm
                portal={props.portal}
                usernameLabel={props.usernameLabel}
                usernameHint={props.usernameHint}
                passwordHint={props.passwordHint}
              />
              {props.footer && <div className="mt-8 border-t border-rule pt-5 text-sm text-ink-soft">{props.footer}</div>}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export function StaffLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-pen underline-offset-4 hover:underline">{children}</Link>;
}
