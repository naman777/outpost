# Set up your own Outpost

Outpost is a single-user application. Use a separate database and independent secrets for every installation. Connecting your personal inbox to a shared public demo is unsuitable; examples in this repository use fictional contacts.

## Local setup

1. Install Node.js 20.9 or newer (22 LTS recommended) and npm. Obtain an empty Postgres database, either a local server or a hosted service such as Neon. No Docker installation is required by the app.
2. Open a terminal in your checkout and run:

   ```sh
   npm ci
   npm run setup
   ```

   This generates four independent secrets in the ignored `.env.local`. It does not overwrite an existing file or print the secrets. On Windows, keep this file under your own user account's access controls.
3. Edit `.env.local`. Set `DATABASE_URL` to your own Postgres connection URL. Hosted databases typically provide an SSL connection string; retain their SSL options. For local Postgres, the format is `postgresql://USER:PASSWORD@localhost:5432/outpost`. Create that database first and URL-encode special characters in the username/password. Keep `APP_URL="http://localhost:3000"` for local use.
4. Run:

   ```sh
   npm run setup:check
   npm run db:push
   npm run dev
   ```

   `setup:check` checks values only; `db:push` connects to Postgres and creates/updates the schema. Review schema changes before accepting them on an existing database. The database user needs permission to create tables/indexes and use UUID generation (`gen_random_uuid()`).
5. Open `http://localhost:3000`. Read the generated `DASHBOARD_PASSWORD` from `.env.local` in your editor and use it to sign in. The other secrets stay on the server.

If you choose another port, change `APP_URL` to that exact origin before signing in. If you already have an env file, fill missing entries yourself; rerunning setup never replaces it.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Your Postgres database; required for dashboard data and durable login throttling. |
| `APP_URL` | The origin users visit and the base for tracking/OAuth URLs. HTTPS for public hosting. No path, query or credentials. |
| `DASHBOARD_PASSWORD` | At least 16 characters; setup generates a random 43-character value. Changing it invalidates existing sessions. |
| `APP_SECRET` | At least 32 random characters; encrypts mailbox secrets and signs sessions. Back it up securely alongside the database. |
| `API_KEY` | At least 32 random characters for script access. Grants access to messages, statistics and sending. |
| `CRON_SECRET` | Independent 32+ character bearer key for scheduled reply/bounce checks. |
| `APP_TIMEZONE` | IANA timezone for analytics, default `UTC`. For example `Asia/Kolkata`. |
| `DATABASE_POOL_MAX` | Connections per app instance, default 5 in the example. Tune to your database's limits. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Gmail OAuth credentials; set both or neither. |

Never prefix these secrets with `NEXT_PUBLIC_`. Losing or replacing `APP_SECRET` makes existing encrypted credentials unreadable; reconnect mailboxes after replacement. Keep local and hosted values separate.

## First mailbox: Gmail with an app password

This is the documented first-provider path. It requires an account where Google permits app passwords. Enable 2-Step Verification and create a dedicated app password; do not use your regular Gmail password. Workspace administrators and some account protection settings can prevent app-password use. See [Google's app-password instructions](https://support.google.com/accounts/answer/185833).

1. Sign in to Outpost and open **Mailboxes**.
2. Choose **Gmail / Google Workspace (app password)**.
3. Enter your full address, the dedicated app password and your sender name. Keep the default limit of 20 while checking the installation.
4. Connect. Outpost verifies SMTP login before saving the encrypted credential. This does not yet verify IMAP, reply matching or inbox placement.
5. Send one harmless test email to another address you own. Reply from that second address, then press **Check for replies**. Confirm the reply appears on the message timeline. A sync error means IMAP access needs attention even if sending worked.

The Gmail preset uses SMTP 465 with TLS and IMAP 993 with TLS. SMTP servers configured for port 587 must support STARTTLS; Outpost requires the upgrade. Other presets supply hosts/ports, not provider-specific OAuth. In particular, a provider that requires OAuth for SMTP/IMAP will not work with this password-only transport. Use Gmail API OAuth below for Gmail accounts where that is more suitable.

## Optional Gmail API OAuth

1. Create a Google Cloud project, enable the Gmail API, and configure OAuth consent. Start with your own account as a test user.
2. Create a **Web application** OAuth client. Register the exact redirect URI `http://localhost:3000/api/auth/google/callback` for local work and `https://YOUR-HOST/api/auth/google/callback` for the hosted installation.
3. Set both Google env variables on the corresponding host and restart/redeploy.
4. Sign in to the Outpost dashboard, open Mailboxes and choose Connect Gmail. This connects the mailbox; it does not replace dashboard password authentication.

Outpost requests `gmail.send`, `gmail.readonly`, `openid` and `email`. Readonly access is a restricted Gmail scope. Testing-mode tokens can expire quickly; publishing an OAuth consent screen is not a substitute for Google's verification requirements. Review [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope verification and exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) before expanding access beyond your own installation.

## Deploy on Vercel

1. Import your own repository as a new Vercel project, using the Next.js preset. This does not require changing the separate repository or Vercel project you already use for personal outreach.
2. Provision a separate hosted Postgres database reachable from Vercel. Choose a nearby region; `vercel.json` currently selects `sin1` (Singapore), which you can change for your own database location.
3. Generate independent production secrets locally with Node's crypto API or a password manager. Add all required variables in the Vercel project settings. Set `APP_URL` to the stable production HTTPS origin, not localhost or a temporary preview URL. Do not paste production secrets into a public issue, screenshot or chat.
4. Initialize the empty hosted schema from a terminal with `DATABASE_URL` set for that database, using `npm run db:push`. Keep this operation manual; the build does not push database schema changes.
5. Deploy, sign in, connect a mailbox and perform the controlled check below. Keep preview deployments separate from production: use an isolated database/mailbox, or leave sensitive env values unavailable to previews. Review contribution code before running it with secrets.
6. The included cron expression requests one sync at **03:00 UTC daily**. Configure `CRON_SECRET` on Vercel; the route rejects unauthenticated calls. Plan limits and execution timing apply: consult [Vercel Cron documentation](https://vercel.com/docs/cron-jobs) and [cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs). On other hosts, schedule an HTTPS GET to `/api/cron/sync` with `Authorization: Bearer <CRON_SECRET>` using your scheduler's secret storage.

For a long-running Node host instead, run `npm run build`, then `npm start` behind an HTTPS reverse proxy. Forward only trusted client-IP headers, preserve the browser Origin/Host, and use the same `APP_URL` users visit. Configure the scheduler yourself.

## Controlled acceptance check

For a local check without a mailbox, run `npm run build`, then `npm run test:smoke`. This starts a temporary Next.js server and an isolated in-memory Postgres engine on loopback ports, applies the real schema and imports fictional data twice to verify deduplication. It checks dashboard/API authentication, pages, pixel/click routes, cron authentication and login throttling. It overrides database and secret env values for its child processes; it does not use your database, create an env file or send mail. It supplements, rather than replaces, the provider/deployment checks below.

- Fresh database: `db:push` completes, sign-in succeeds, empty dashboard pages load, and an example application can be created and edited.
- API auth: `/api/v1/stats` rejects a request without a bearer key. Use your own key in a local script to check authorized access; never put it in a browser URL.
- Mailbox: SMTP verification succeeds; one message sent to your own second inbox arrives; an actual reply appears after sync. No test suite in this repo sends mail automatically.
- Public tracking: with a public HTTPS origin and images enabled, opening that test message produces a signal. Self-open filtering, a 20-second grace period for some clients, proxy caching and privacy protection can affect results. An open cannot prove the recipient read the email.
- Tracking disabled: the API's `trackOpens: false` and `trackClicks: false` omit Outpost tracking URLs. Send history and reply/bounce checks remain available.
- Scheduled sync: an authenticated cron call runs; an unauthenticated call receives 401. Replies are polled, not pushed in real time.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-in returns 503 | Database connectivity, `npm run db:push`, and valid dashboard/app secrets. Login fails closed when its durable throttle is unavailable. |
| Sign-in returns 429 | The single dashboard allows 20 attempts per 15-minute window across all clients. Wait for Retry-After. The counter is in Postgres, so a restart does not clear it. |
| Sign-in/logout returns 403 | APP_URL must match the origin in the browser, including scheme and port. Check reverse-proxy configuration. |
| Opens never appear | Localhost cannot be reached by recipients; check public APP_URL, image blocking, self-open filtering and tracking settings. |
| SMTP connects but replies do not appear | Run manual sync and inspect the account's sync error. Check IMAP permissions and the sending address. Reply detection looks back 45 days for unanswered sent messages. |
| OAuth redirect mismatch | Register the exact APP_URL plus `/api/auth/google/callback`. |
| Encryption errors after migration | Restore the original APP_SECRET for that database, or reconnect the mailboxes. |
| Deployment body too large | API JSON is limited to 4 MiB; attachments are limited to 10 files and 2 MiB decoded total. The host may impose a lower limit. |

Imports are optional and are not part of installation. See [importing.md](importing.md).
