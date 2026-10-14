"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "@/app/actions/auth";
import { Field, Button, Alert } from "./ui";
import { PASSWORD_MIN } from "@/lib/constants";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Field label="New password" name="next" type="password" autoComplete="new-password" required
        minLength={PASSWORD_MIN} hint={`At least ${PASSWORD_MIN} characters.`} />
      <Field label="Type the new password again" name="confirm" type="password" autoComplete="new-password" required />
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save new password"}</Button>
    </form>
  );
}
