import { saveSettingsAction } from "@/app/actions";
import { Badge, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/tracking";

export default async function SettingsPage() {
  const s = await getSettings();
  const base = appUrl();
  const local = /localhost|127\.0\.0\.1/.test(base);
  const env = [
    { k: "APP_URL", ok: !local, note: local ? "pixels point at localhost, so recipients' opens can't reach you. Deploy and set your public URL." : base },
    { k: "API_KEY", ok: Boolean(process.env.API_KEY), note: "needed for scripts and the API" },
    { k: "CRON_SECRET", ok: Boolean(process.env.CRON_SECRET), note: "lets Vercel Cron check for replies" },
    { k: "GOOGLE_CLIENT_ID", ok: Boolean(process.env.GOOGLE_CLIENT_ID), note: "optional, for Connect Gmail" },
  ];

  return (
    <>
      <PageHeader title="Settings & API" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">What counts as an estimated open</h2>
          <form action={saveSettingsAction} className="space-y-4">
            <div>
              <label className="label">Ignore pixel hits in the first … seconds after sending</label>
              <input name="graceSeconds" type="number" min={0} defaultValue={s.graceSeconds} className="input w-32" />
              <p className="mt-1 text-xs text-zinc-500">Catches security scanners and prefetches that fire on delivery.</p>
            </div>
            <div>
              <label className="label">Count repeat opens closer than … seconds once</label>
              <input name="dedupeSeconds" type="number" min={0} defaultValue={s.dedupeSeconds} className="input w-32" />
            </div>
            <div>
              <label className="label">Suggest a follow-up after … days without a reply</label>
              <input name="followUpAfterDays" type="number" min={1} defaultValue={s.followUpAfterDays} className="input w-32" />
            </div>
            <div>
              <label className="label">Your IP addresses (hits from these are yours)</label>
              <textarea name="selfIps" rows={3} defaultValue={s.selfIps.join("\n")} className="input font-mono text-xs" />
              <p className="mt-1 text-xs text-zinc-500">Filled in automatically from where you use this dashboard.</p>
            </div>
            <button className="btn">Save</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Environment</h2>
          <ul className="space-y-2 text-sm">
            {env.map((e) => (
              <li key={e.k} className="flex flex-wrap items-center gap-2">
                <code className="text-xs">{e.k}</code>
                <Badge tone={e.ok ? "green" : "amber"}>{e.ok ? "set" : "missing"}</Badge>
                <span className="text-xs text-zinc-500">{e.note}</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-6 text-sm font-semibold">Accuracy notes</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-600">
            <li>Gmail proxy image requests are estimates. Requests during the grace period are excluded; later requests can still include automated loads.</li>
            <li>Apple Mail Privacy Protection downloads every image on delivery. Those hits are shown but not counted.</li>
            <li>When you view your own email in your Sent folder, Gmail fetches the pixel too and it looks like the recipient. Use &quot;this was me&quot; on the message page.</li>
            <li>Recipients who block images never trigger the pixel. Clicks and replies are separate evidence; they never create pixel opens.</li>
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-1 text-sm font-semibold">Use it from anywhere (no mailbox connection)</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Register each email before you send it from your own script or client, then send the HTML you get back. Pass{" "}
          <code>from</code> with an address you&apos;ve connected on Mailboxes and replies are matched too.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-[#0b0b0d] p-4 text-xs leading-relaxed text-[#e4e4e7]">{`curl -X POST ${base}/api/v1/messages \\
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\
  -d '{"to":"founder@startup.com","from":"you@gmail.com","subject":"Hello",
       "text":"Hi …","template":"cold-v1","variant":"short","company":"Startup"}'

# → { "id": "…", "html": "<div>…<img src=\\"${base}/t/o/….gif\\"></div>",
#     "messageId": "<…@gmail.com>", "pixelHtml": "<img …>" }
# Send "html" as the HTML part and "messageId" as the Message-ID header.

# Or let Outpost send through a connected mailbox:
curl -X POST ${base}/api/v1/send -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\
  -d '{"from":"you@gmail.com","to":"founder@startup.com","subject":"Hello","text":"Hi …",
       "attachments":[{"filename":"resume.pdf","contentBase64":"…"}]}'

# Stats
curl ${base}/api/v1/stats?days=30 -H "Authorization: Bearer $API_KEY"`}</pre>
        <p className="mt-3 text-xs text-zinc-500">
          A ready-made Python helper is in <code>clients/outpost_client.py</code> in the repo.
        </p>
      </section>
    </>
  );
}
