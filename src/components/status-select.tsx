"use client";

import { setApplicationStatus } from "@/app/actions";
import { STATUSES } from "@/lib/statuses";

export function StatusSelect({ id, status }: { id: string; status: string }) {
  return (
    <form action={setApplicationStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        aria-label="Application status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </form>
  );
}
