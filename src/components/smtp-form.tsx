"use client";

import { useActionState, useState } from "react";
import { addSmtpAccount, type ActionState } from "@/app/actions";

type Preset = { key: string; label: string };

export function SmtpForm({ presets }: { presets: Preset[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSmtpAccount, null);
  const [preset, setPreset] = useState(presets[0]?.key ?? "custom");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Provider</label>
        <select name="preset" value={preset} onChange={(e) => setPreset(e.target.value)} className="input">
          {presets.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
          <option value="custom">Other (enter SMTP / IMAP hosts)</option>
        </select>
      </div>
      <div>
        <label className="label">Email address</label>
        <input name="email" type="email" required className="input" placeholder="you@gmail.com" />
      </div>
      <div>
        <label className="label">App password</label>
        <input name="password" type="password" required className="input" placeholder="16-character app password" autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Sender name</label>
        <input name="fromName" className="input" placeholder="Your Name" />
      </div>
      <div>
        <label className="label">Daily send limit</label>
        <input name="dailyLimit" type="number" min={1} defaultValue={20} className="input" />
      </div>
      {preset === "custom" && (
        <>
          <div>
            <label className="label">SMTP host</label>
            <input name="smtpHost" className="input" placeholder="smtp.example.com" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">SMTP port</label>
              <input name="smtpPort" type="number" defaultValue={465} className="input" />
            </div>
            <div>
              <label className="label">TLS</label>
              <select name="smtpSecure" defaultValue="true" className="input">
                <option value="true">SSL (465)</option>
                <option value="false">STARTTLS (587)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">IMAP host (for replies, optional)</label>
            <input name="imapHost" className="input" placeholder="imap.example.com" />
          </div>
          <div>
            <label className="label">Username (if not the address)</label>
            <input name="smtpUser" className="input" />
          </div>
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending}>{pending ? "Checking login…" : "Connect mailbox"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.message}</span>}
      </div>
    </form>
  );
}
