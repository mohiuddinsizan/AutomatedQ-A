import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { homeForRole } from "@/lib/roles";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Logo, SiteFooter } from "@/components/Brand";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <>
    <div className="brand-stripe h-1" aria-hidden />
    <main className="mx-auto min-h-[70vh] max-w-md px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo size={48} />
        <span className="font-bold tracking-wide text-pen">{BRAND.name}</span>
      </div>
      <h1 className="text-3xl text-ink">
        {user.mustChangePassword ? "Choose your own password" : "Change password"}
      </h1>
      <p className="mt-2 mb-8 text-ink-soft">
        {user.mustChangePassword
          ? "You signed in with your phone number. Pick a new password before continuing; you'll use it from now on."
          : "Changing your password signs you out on every other device."}
      </p>
      <ChangePasswordForm />
      {!user.mustChangePassword && (
        <Link href={homeForRole(user.role)} className="mt-6 inline-block text-sm text-pen hover:underline underline-offset-4">
          Back
        </Link>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
