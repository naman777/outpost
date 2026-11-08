"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { importBulkFile } from "@/app/bulk-actions";
import { prepareBulkRows, type BulkRow, type PreparedRecipient } from "@/lib/bulk-template";
import { Icon } from "./icon";

type Mailbox = { id: string; email: string; label: string; dailyLimit: number; remaining: number };
type Attachment = { filename: string; contentType?: string; contentBase64: string };
type Recipient = PreparedRecipient & { id: string; status: "ready" | "sending" | "sent" | "review"; messageId?: string; note?: string };
type Batch = { recipients: Recipient[]; skipped: PreparedRecipient[]; accountId: string; attachments: Attachment[]; trackOpens: boolean; trackClicks: boolean };

export function BulkMailForm({ accounts }: { accounts: Mailbox[] }) {
  const [state, action, pending] = useActionState(importBulkFile, {});
  if (!accounts.length) return <p className="card p-5">Connect a mailbox on the <Link href="/accounts" className="underline">Mailboxes page</Link> before sending bulk mail.</p>;
  if (state.rows && state.columns) return <BulkComposer accounts={accounts} rows={state.rows} columns={state.columns} />;
  return <><BulkSteps current={1} /><div className="bulk-import-grid"><form action={action} className="card bulk-upload">
    <h2 className="text-base font-semibold">Start with your recipients</h2>
    <p className="mt-2 text-sm leading-relaxed text-zinc-500">Upload a spreadsheet. You’ll personalize the email and review every recipient before anything is sent.</p>
    <div className="upload-area"><span className="upload-icon"><Icon name="upload" /></span><label htmlFor="recipients" className="label mb-0">Excel (.xlsx) or CSV file</label><input id="recipients" name="recipients" type="file" accept=".xlsx,.csv" required className="block max-w-full text-sm" /><span className="text-[10px] text-zinc-400">Up to 1,000 recipients · 1 MiB maximum</span></div>
    {state.error && <p role="alert" className="mb-4 text-sm text-red-600">{state.error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-4"><a href="/bulk-recipients-example.csv" download className="text-xs text-zinc-500 underline underline-offset-4">Download an example CSV</a><button className="btn" disabled={pending}>{pending ? "Reading file…" : "Import recipients"}<Icon name="arrow" /></button></div>
  </form><aside className="bulk-guide"><h3>A few columns. A personal touch.</h3><p>Include one email column and any details you’d like to use in your message. Headers become variables, such as <code>{"{{name}}"}</code> and <code>{"{{company}}"}</code>.</p><div className="sheet-sample"><table><thead><tr><th>email</th><th>name</th><th>company</th></tr></thead><tbody><tr><td>alex@example.com</td><td>Alex</td><td>Cedar</td></tr><tr><td>sam@example.com</td><td>Sam</td><td>Harbor</td></tr></tbody></table></div><p className="mt-4">Excel imports use the first worksheet. Duplicate addresses and missing details are flagged during review.</p></aside></div></>;
}

function BulkSteps({ current }: { current: number }) {
  return <ol className="bulk-steps" aria-label="Bulk mail steps">{["Import recipients", "Personalize", "Review & send"].map((label, index) => <li key={label} className={`bulk-step ${current === index + 1 ? "is-current" : current > index + 1 ? "is-complete" : ""}`} aria-current={current === index + 1 ? "step" : undefined}><span className="bulk-step-number">{current > index + 1 ? <Icon name="check" /> : index + 1}</span><span>{label}</span></li>)}</ol>;
}

function BulkComposer({ accounts, rows, columns }: { accounts: Mailbox[]; rows: BulkRow[]; columns: string[] }) {
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [emailColumn, setEmailColumn] = useState(columns.find((key) => ["email", "email_address", "to"].includes(key)) || columns[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [opens, setOpens] = useState(true);
  const [clicks, setClicks] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [preview, setPreview] = useState(0);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const stopRef = useRef(false);

  async function review(event: React.FormEvent) {
    event.preventDefault(); setError(""); setPreparing(true);
    try {
      if (files.length > 10 || files.reduce((n, file) => n + file.size, 0) > 2 * 1024 * 1024) throw new Error("Use at most 10 shared attachments totaling 2 MiB.");
      const prepared = prepareBulkRows(rows, emailColumn, subject, body);
      const valid = prepared.filter((row) => !row.error);
      if (!valid.length) throw new Error(prepared[0]?.error || "No valid recipients. Check your email column and variables.");
      const attachments = await Promise.all(files.map((file) => new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read an attachment."));
        reader.onload = () => resolve({ filename: file.name, contentType: file.type || undefined, contentBase64: String(reader.result).split(",")[1] });
        reader.readAsDataURL(file);
      })));
      setBatch({ recipients: valid.map((row) => ({ ...row, id: crypto.randomUUID(), status: "ready" })), skipped: prepared.filter((row) => row.error), accountId, attachments, trackOpens: opens, trackClicks: clicks });
      setPreview(0);
    } catch (e) { setError((e as Error).message); }
    finally { setPreparing(false); }
  }

  function updateRecipient(id: string, patch: Partial<Recipient>) {
    setBatch((current) => current && ({ ...current, recipients: current.recipients.map((row) => row.id === id ? { ...row, ...patch } : row) }));
  }

  async function send() {
    if (!batch || runningRef.current) return;
    runningRef.current = true; stopRef.current = false; setRunning(true); setError("");
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    try {
      for (const recipient of batch.recipients.filter((row) => row.status === "ready")) {
        if (stopRef.current) break;
        updateRecipient(recipient.id, { status: "sending" });
        try {
          const response = await fetch("/api/bulk/send", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ requestId: recipient.id, accountId: batch.accountId, to: recipient.to, subject: recipient.subject, text: recipient.text,
              trackOpens: batch.trackOpens, trackClicks: batch.trackClicks, attachments: batch.attachments, template: "bulk" }), signal: AbortSignal.timeout(75000) });
          const result = await response.json();
          if (response.ok && result.status === "sent") updateRecipient(recipient.id, { status: "sent", messageId: result.id });
          else if ([400, 401, 403, 413, 429].includes(response.status)) {
            updateRecipient(recipient.id, { status: "ready" });
            setError(result.error || "Sending stopped. Check the mailbox and message settings."); break;
          } else {
            updateRecipient(recipient.id, { status: "review", messageId: result.id, note: result.error || "Send could not be confirmed." });
            setError("Sending stopped. Review the attempted message in Sent mail before starting another batch."); break;
          }
        } catch {
          updateRecipient(recipient.id, { status: "review", note: "Connection interrupted. Check Sent mail before sending again." });
          setError("Connection interrupted. Sending stopped to avoid duplicate emails."); break;
        }
      }
    } finally {
      window.removeEventListener("beforeunload", beforeUnload);
      runningRef.current = false; setRunning(false);
    }
  }

  const ready = batch?.recipients.filter((row) => row.status === "ready").length || 0;
  const attempted = batch?.recipients.some((row) => row.status !== "ready");
  const selected = batch?.recipients[preview];
  return <div className="space-y-5">
    <BulkSteps current={batch ? 3 : 2} />
    {!batch ? <form onSubmit={review} className="grid gap-5 lg:grid-cols-3">
      <section className="card space-y-4 p-5 lg:col-span-2">
        <h2 className="font-semibold">2. Personalize your email</h2>
        <p className="text-sm text-zinc-500">{rows.length} imported rows. Column names use lowercase letters and underscores. Use the variables below in the subject or body.</p>
        <div className="flex flex-wrap gap-2">{columns.map((key) => <code key={key} className="rounded bg-zinc-100 px-2 py-1 text-xs">{`{{${key}}}`}</code>)}</div>
        <div><label htmlFor="bulk-subject" className="label">Subject</label><input id="bulk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={998} className="input" placeholder="Hello {{name}} — opportunities at {{company}}" /></div>
        <div><label htmlFor="bulk-body" className="label">Body (plain text)</label><textarea id="bulk-body" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={100000} rows={12} className="input font-mono text-sm" placeholder={"Hi {{name}},\n\nI’m interested in opportunities at {{company}}.\n\nMy work: https://example.com"} /><p className="mt-1 text-xs text-zinc-500">Links become clickable. Missing variables, invalid emails, and duplicates are excluded from the send list for review.</p></div>
      </section>
      <section className="card space-y-4 p-5">
        <div><label htmlFor="bulk-mailbox" className="label">Send from</label><select id="bulk-mailbox" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} — {account.email}</option>)}</select><p className="mt-1 text-xs text-zinc-500">{accounts.find((account) => account.id === accountId)?.remaining} available at page load. The server checks the rolling 24-hour limit before every send.</p></div>
        <div><label htmlFor="bulk-email-column" className="label">Recipient email column</label><select id="bulk-email-column" className="input" value={emailColumn} onChange={(e) => setEmailColumn(e.target.value)}>{columns.map((key) => <option key={key}>{key}</option>)}</select></div>
        <div><label htmlFor="bulk-attachments" className="label">Shared attachments</label><input id="bulk-attachments" type="file" multiple className="max-w-full text-sm" onChange={(e) => setFiles(Array.from(e.target.files || []))} /><p className="mt-1 text-xs text-zinc-500">The same files go to every recipient. Up to 10 files, 2 MiB total.</p></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={opens} onChange={(e) => setOpens(e.target.checked)} />Track estimated opens</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={clicks} onChange={(e) => setClicks(e.target.checked)} />Track link clicks</label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={preparing}>{preparing ? "Preparing…" : "Review personalized emails"}</button>
        <Link href="/bulk" className="block text-sm underline">Import another file</Link>
      </section>
    </form> : <>
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">3. Review and send</h2>
        <p className="text-sm">{batch.recipients.length} valid recipients · {batch.skipped.length} excluded · {batch.recipients.filter((row) => row.status === "sent").length} sent · {ready} remaining</p>
        <p className="text-sm text-zinc-500">From {accounts.find((account) => account.id === batch.accountId)?.email}. Attachments: {batch.attachments.map((file) => file.filename).join(", ") || "none"}.</p>
        <p className="text-xs text-zinc-500">Keep this tab open while sending. Stop finishes the current email first. Sending stops at the mailbox limit; remaining recipients stay in this tab for you to send later. There is no background queue or scheduled sending.</p>
        {batch.skipped.length > 0 && <details><summary className="cursor-pointer text-sm">Review excluded rows</summary><ul className="mt-2 max-h-48 overflow-auto text-xs text-zinc-500">{batch.skipped.map((row) => <li key={row.row}>Row {row.row} · {row.to || "no email"} · {row.error}</li>)}</ul></details>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button className="btn" disabled={running || !ready} onClick={send}>{running ? "Sending…" : `Send ${ready} email${ready === 1 ? "" : "s"}`}</button>
          {running && <button className="btn-ghost" onClick={() => { stopRef.current = true; }}>Stop after current email</button>}
          {!running && !attempted && <button className="btn-ghost" onClick={() => setBatch(null)}>Edit template</button>}
          {!running && <Link href="/bulk" className="btn-ghost">Import another file</Link>}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card max-h-[36rem] overflow-auto p-5"><h3 className="mb-3 font-semibold">Recipients and progress</h3><table className="w-full text-left text-sm"><thead><tr><th className="pb-2">Recipient</th><th className="pb-2">Status</th></tr></thead><tbody>{batch.recipients.map((row, index) => <tr key={row.id} className="border-t border-zinc-100"><td className="py-2 pr-2"><button className="text-left underline" onClick={() => setPreview(index)}>{row.to}</button>{row.note && <p className="text-xs text-zinc-500">{row.note}</p>}</td><td className="py-2">{row.messageId ? <Link href={`/messages/${row.messageId}`} className="underline">{row.status === "review" ? "Needs review" : row.status}</Link> : row.status === "review" ? "Needs review" : row.status}</td></tr>)}</tbody></table></section>
        {selected && <section className="card space-y-3 p-5"><h3 className="font-semibold">Personalized preview</h3><p className="break-all text-xs text-zinc-500">To: {selected.to}</p><p className="font-medium">{selected.subject}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.text}</p></section>}
      </div>
    </>}
  </div>;
}
