"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "./ui";

type State = { error?: string; ok?: string; secret?: string } | undefined;

export function SubmitButton({
  children, pending: pendingLabel, variant, size, className, name, value,
}: {
  children: React.ReactNode; pending?: string; variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm"; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className} name={name} value={value}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </Button>
  );
}

/**
 * A form bound to a server action that returns { error | ok | secret }.
 * Fields are passed as children so the page can render them on the server.
 */
export function ActionForm({
  action, children, submit, pending, className = "flex flex-col gap-4", variant, size, resetOnOk, footer,
}: {
  action: (state: State, fd: FormData) => Promise<State>;
  children?: React.ReactNode;
  submit?: string;
  pending?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  resetOnOk?: boolean;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<State, FormData>(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state?.ok) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && (
        <Alert tone="ok">
          {state.ok}
          {state.secret && (
            <code className="mt-2 block select-all rounded border border-ok/30 bg-sheet px-3 py-2 font-mono text-base text-ink">{state.secret}</code>
          )}
        </Alert>
      )}
      {(submit || footer) && (
        <div className="flex flex-wrap items-center gap-3">
          {submit && <SubmitButton pending={pending} variant={variant} size={size}>{submit}</SubmitButton>}
          {footer}
        </div>
      )}
    </form>
  );
}
