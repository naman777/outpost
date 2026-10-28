"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { composeAction, type ActionState } from "@/app/actions";

type Opt = { id: string; label: string; email: string; kind: string };
type AppOpt = { id: string; company: string; contactEmail: string | null; contactName: string | null };
type Parent = { id: string; to: string; toName: string | null; subject: string; template: string | null; applicationId: string | null } | null;

export function ComposeForm({
  accounts,
  apps,
  parent,
  defaultVia,
  initialAppId = "",
}: {
  accounts: Opt[];
  apps: AppOpt[];
  parent: Parent;
  defaultVia: string;
  initialAppId?: string;
}) {
  const initialApp = apps.find((x) => x.id === initialAppId);
  const [state, action, pending] = useActionState<ActionState, FormData>(composeAction, null);
  const [via, setVia] = useState(defaultVia);
  const [to, setTo] = useState(parent?.to ?? initialApp?.contactEmail?.split(/[;,]/)[0].trim() ?? "");
  const [toName, setToName] = useState(parent?.toName ?? initialApp?.contactName?.split(/[;,]/)[0].trim() ?? "");
  const [appId, setAppId] = useState(parent?.applicationId ?? initialAppId);
  const formRef = useRef<HTMLFormElement>(null);

  function pickApp(id: string) {
    setAppId(id);
    const a = apps.find((x) => x.id === id);
    if (a?.contactEmail && !to) setTo(a.contactEmail.split(/[;,]/)[0].trim());
    if (a?.contactName && !toName) setToName(a.contactName.split(/[;,]/)[0].trim());
  }

  if (state?.ok && state.html) return <ManualResult html={state.html} id={state.id!} />;

  return (
    <form ref={formRef} action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        {parent && <input type="hidden" name="followUpOf" value={parent.id} />}
        <div>
          <label className="label">Send with</label>
          <select name="via" value={via} onChange={(e) => setVia(e.target.value)} className="input">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email} ({a.kind === "gmail" ? "Gmail API" : "SMTP"})
              </option>
            ))}
            <option value="manual">Any mail client: copy the tracked email and send it yourself</option>
          </select>
          {via === "manual" && (
            <p className="mt-1 text-xs text-zinc-500">
              No mailbox needed. You get the email with the pixel built in; paste it into Gmail, Outlook or anything else and hit send.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">To</label>
            <input name="to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="founder@company.com" />
          </div>
          <div>
            <label className="label">Name</label>
            <input name="toName" value={toName} onChange={(e) => setToName(e.target.value)} className="input" placeholder="Optional" />
          </div>
        </div>
        <div>
          <label className="label">Subject {parent && <span className="text-zinc-400">(blank keeps the thread: Re: {parent.subject})</span>}</label>
          <input name="subject" required={!parent} className="input" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0">Body</label>
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input type="checkbox" name="format" value="html" /> body is HTML
            </label>
          </div>
          <textarea name="body" required rows={14} className="input font-mono text-[13px] leading-relaxed" placeholder={"Hi Priya,\n\n…"} />
          <p className="mt-1 text-xs text-zinc-500">Plain text becomes simple HTML. Links stay clickable, and the plain-text part keeps them exactly as typed.</p>
        </div>
        {via !== "manual" && (
          <div>
            <label className="label">Attachments</label>
            <input name="attachments" type="file" multiple className="max-w-full text-sm" />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Application</label>
            <select name="applicationId" value={appId} onChange={(e) => pickApp(e.target.value)} className="input">
              <option value="">Match by recipient address</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.company}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Template</label>
              <input name="template" defaultValue={parent?.template ?? ""} className="input" placeholder="cold-v2" />
            </div>
            <div>
              <label className="label">Variant</label>
              <input name="variant" className="input" placeholder="short" />
            </div>
          </div>
          <p className="text-xs text-zinc-500">Tag emails with a template and variant to compare them on Content insights.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="trackClicks" className="mt-1" />
            <span>
              Track link clicks
              <span className="block text-xs text-zinc-500">Links go through this app first. Can hurt deliverability on a new domain; off by default.</span>
            </span>
          </label>
          {via === "manual" && (
            <div>
              <label className="label">Your address (for reply matching)</label>
              <input name="from" type="email" className="input" placeholder="you@yourdomain.com" />
            </div>
          )}
        </div>
        {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
        {state?.ok && !state.html && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {state.message} <Link href={`/messages/${state.id}`} className="underline">Open</Link>
          </div>
        )}
        <button className="btn w-full" disabled={pending}>
          {pending ? "Working…" : via === "manual" ? "Create tracked email" : "Send"}
        </button>
      </div>
    </form>
  );
}

function ManualResult({ html, id }: { html: string; id: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copyRich() {
    // Rich copy keeps the pixel when pasted into Gmail / Outlook web compose windows.
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" }) }),
    ]);
    setCopied("email");
  }
  async function copyHtml() {
    await navigator.clipboard.writeText(html);
    setCopied("html");
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Tracked. Copy the email, paste it into your mail client&apos;s compose window, and send. Opens will show up on the{" "}
        <Link href={`/messages/${id}`} className="underline">message page</Link>.
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={copyRich} className="btn">{copied === "email" ? "Copied" : "Copy email (paste into Gmail / Outlook)"}</button>
        <button onClick={copyHtml} className="btn-ghost">{copied === "html" ? "Copied" : "Copy raw HTML"}</button>
        <Link href="/compose" className="btn-ghost">Write another</Link>
      </div>
      <div className="card p-4">
        <div className="mb-2 text-xs text-zinc-500">Preview (the pixel is invisible at the end)</div>
        <iframe sandbox="" referrerPolicy="no-referrer" srcDoc={html.replace(/<img [^>]*\/t\/o\/[^>]*>/g, "")} className="h-96 w-full rounded-md bg-white" title="Email preview" />
      </div>
    </div>
  );
}
