# Security and stored data

## Intended use and trust boundary

Each Outpost installation belongs to one trusted operator. All authenticated dashboard users and API-key holders can access that installation's outreach data. There are no separate user accounts, tenant isolation or role permissions. Do not offer an installation as a shared public service or connect real mailboxes to an unrestricted demo.

Run public installations over HTTPS. The proxy gates dashboard requests; every exported dashboard server action also validates the signed session before accessing data. Google connection routes check the dashboard session independently and the callback checks the state cookie. Login/logout require a matching browser origin.

Sessions expire after 30 days and use HTTP-only, SameSite=Lax cookies, with Secure on HTTPS. Changing DASHBOARD_PASSWORD invalidates existing sessions. Log out on shared devices; logout clears that browser's cookie but does not revoke a stolen copy of the same token. API and cron keys are independent bearer credentials. Do not grant untrusted people access to either.

## Login throttling

A single atomic Postgres upsert counts attempts in the `settings` row `login-rate-limit`. It allows 20 sign-in attempts per 15-minute window for the whole dashboard, including successful attempts. A blocked request returns 429 and Retry-After. It uses no claimed client IP and persists across restarts and serverless instances. If Postgres is unavailable, login returns 503 instead of bypassing the limit.

This shared limit fits a single-user app and also means an attacker can temporarily exhaust the sign-in allowance. Put host/WAF rate limiting in front of the app if it is targeted; this limiter is not DDoS protection. Public tracking URLs must remain reachable by mail clients and should have host-level abuse controls as appropriate.

## Data stored in Postgres

| Data | Storage |
| --- | --- |
| SMTP/app passwords and Gmail refresh tokens | AES-256-GCM encrypted with a key derived from APP_SECRET. |
| Mailbox addresses, provider hosts, send limits, sync errors | Ordinary database fields. |
| Recipient/contact addresses, subjects, bodies, application details and notes | Ordinary database fields; not encrypted by Outpost. |
| Tracking events | Timestamp, IP when supplied by a trusted proxy, bounded user-agent, classification, and message/link relationship. |
| Replies | Sender, timestamp, provider identifier and a snippet. |
| Settings | Operator IP exclusions, tracking thresholds, follow-up interval and the aggregate login throttle. |

Database transport security, storage encryption and backups depend on your database provider and deployment. APP_SECRET is also required to decrypt backed-up mailbox credentials; keep its backup separate and access-controlled. Rotating it requires reconnecting mailboxes and invalidates sessions.

Deleting a message removes its related opens, links, clicks and replies through database cascades. Deleting an application or mailbox does not delete message history. There is no automatic retention expiry, bulk privacy export or complete erase workflow. Database backups may retain deleted data until the operator expires them. Decide and implement an appropriate retention process before collecting data.

## Public endpoints and content

Tracking identifiers are randomly generated, and tracking routes do not return the stored email body or address. Anyone who obtains a pixel/link URL can replay it or influence event counts. Tracking signals are heuristic, and forwarding can change attribution; an open is not proof of reading.

Click redirects accept only stored HTTP/HTTPS URLs without credentials; they do not accept an arbitrary destination query parameter. Tracking paths validate identifier shape before querying. User-agent storage and JSON request sizes are bounded. The app does not implement comprehensive per-endpoint traffic quotas.

HTML previews run inside sandboxed iframes rather than the dashboard document. Supplied HTML can still load remote images; only Outpost's own pixel is controlled by `trackOpens`. Review untrusted HTML before sending it. SMTP/IMAP hosts are chosen by the trusted operator and can reach networks accessible to the host; do not expose mailbox creation to untrusted users.

## Deployment practices

- Use separate secrets and databases for production, previews and local development. Review code before making secrets available to a contributor's build.
- Expose only the application through your reverse proxy. Do not expose Postgres, Drizzle Studio or a development server publicly. Trust forwarded IP headers only when your proxy overwrites them.
- Keep dependencies patched. `npm audit` includes development-tool findings as well as runtime findings; review each and verify updates. Do not apply forced major downgrades without assessing compatibility.
- `.gitignore` is a convenience, not a secret scanner. Before publishing, inspect every staged file and run a dedicated scanner such as Gitleaks. If a real credential was ever exposed, revoke it even if you remove the file later.
- This public checkout starts without the original private repository's history. That avoids publishing those commits; it does not establish that the original history or this code has passed an independent security audit.

Outpost has no unsubscribe/suppression mechanism or campaign consent management. Use it for appropriate individual outreach, honor recipients' requests, and assess your obligations before using tracking. Publishing source code is separate from deploying a public service.
