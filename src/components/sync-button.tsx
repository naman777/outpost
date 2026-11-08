"use client";

import { useActionState } from "react";
import { Icon } from "./icon";
import { syncNow, type ActionState } from "@/app/actions";

export function SyncButton() {
  const [state, action, pending] = useActionState<ActionState>(syncNow, null);
  return (
    <form action={action} className="flex min-w-0 flex-wrap items-center gap-2">
      {state?.message && !pending && <span className="text-xs text-zinc-500">{state.message}</span>}
      {state?.error && !pending && <span className="max-w-xs text-xs text-red-600" role="alert">{state.error}</span>}
      <button className="btn-ghost" disabled={pending}><Icon name="refresh" className={pending ? "animate-spin" : ""} />{pending ? "Checking inboxes…" : "Check for replies"}</button>
    </form>
  );
}
