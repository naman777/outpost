import { asc } from "drizzle-orm";
import { deleteAccount, updateAccount } from "@/app/actions";
import { accounts, db } from "@/db";
import { SmtpForm } from "@/components/smtp-form";
import { SyncButton } from "@/components/sync-button";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ago } from "@/lib/format";
import { gmailConfigured, redirectUri } from "@/lib/providers/gmail";
import { PRESETS } from "@/lib/providers/smtp";
import { sentToday } from "@/lib/send";

export default async function Accounts({ searchParams }: PageProps<"/accounts">) {
  const sp = await searchParams;
  const list = await db.select().from(accounts).orderBy(asc(accounts.createdAt));
  const usage = await Promise.all(list.map((a) => sentToday(a.id)));
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <PageHeader title="Mailboxes" sub="Connect any number of mailboxes. Each one sends mail and is checked for replies and bounces.">
        <SyncButton />
      </PageHeader>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error === "google-not-configured" ? "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see below)." : error}
        </div>
      )}
      {sp.connected && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Gmail connected.</div>}

      {list.length === 0 ? (
        <Empty>No mailboxes yet. You can still track mail without one: use Compose → &quot;Any mail client&quot;, or the API.</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((a, i) => (
            <div key={a.id} className="card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.email}</span>
                <Badge tone={a.kind === "gmail" ? "blue" : "violet"}>{a.kind === "gmail" ? "Gmail API" : `SMTP · ${a.smtpHost}`}</Badge>
                {a.kind === "smtp" && <Badge tone={a.imapHost ? "green" : "amber"}>{a.imapHost ? "replies via IMAP" : "no reply tracking"}</Badge>}
                {!a.active && <Badge tone="amber">paused</Badge>}
                <span className="text-xs text-zinc-500">
                  {usage[i]}/{a.dailyLimit} sent in the last 24h · checked {ago(a.lastSyncedAt)}
                </span>
              </div>
              {a.lastSyncError && <p className="mb-3 text-xs text-red-600">Last check failed: {a.lastSyncError}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <form action={updateAccount} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={a.id} />
                  <div>
                    <label className="label">Label</label>
                    <input name="label" defaultValue={a.label} className="input w-48" />
                  </div>
                  <div>
                    <label className="label">Sender name</label>
                    <input name="fromName" defaultValue={a.fromName ?? ""} className="input w-44" />
                  </div>
                  <div>
                    <label className="label">Daily limit</label>
                    <input name="dailyLimit" type="number" min={1} defaultValue={a.dailyLimit} className="input w-24" />
                  </div>
                  <label className="flex items-center gap-1.5 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={a.active} /> active
                  </label>
                  <button className="btn-ghost">Save</button>
                </form>
                <form action={deleteAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-danger">Remove</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Any provider: SMTP + IMAP</h2>
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">
            Works with Gmail, Outlook, Zoho, Yahoo, iCloud, Fastmail or your own server. Sends over SMTP and reads replies and bounces over
            IMAP. For Gmail, make an app password at myaccount.google.com/apppasswords (2-step verification must be on). The password is
            stored encrypted.
          </p>
          <SmtpForm presets={Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label }))} />
        </section>
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Gmail via Google sign-in</h2>
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">
            Sends with the Gmail API (links are not rewritten) and finds replies by thread. No app password needed, but you need your own
            Google Cloud OAuth client.
          </p>
          {gmailConfigured() ? (
            <a href="/api/auth/google" className="btn">Connect a Gmail account</a>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-600">
              <li>In Google Cloud console, create a project and enable the Gmail API.</li>
              <li>OAuth consent screen: External. Add yourself as a test user, or publish the app so tokens don&apos;t expire after 7 days.</li>
              <li>Credentials → OAuth client ID → Web application. Authorized redirect URI:</li>
              <li className="list-none"><code className="break-all rounded bg-zinc-100 px-1">{redirectUri()}</code></li>
              <li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment and redeploy.</li>
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
