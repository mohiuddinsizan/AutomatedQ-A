"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions/auth";
import { Field, Button, Alert } from "./ui";

export function LoginForm({
  portal, usernameLabel, usernameHint, passwordHint,
}: {
  portal: "student" | "teacher" | "admin";
  usernameLabel: string;
  usernameHint?: string;
  passwordHint?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="portal" value={portal} />
      <Field
        label={usernameLabel} name="username" autoComplete="username" required
        defaultValue={state?.username}
        inputMode={portal === "student" ? "numeric" : undefined} hint={usernameHint}
      />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required hint={passwordHint} />
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
