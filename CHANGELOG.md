# Changelog

## 0.1.0 — 2026-11-08

First open-source release of Outpost, previously named MailPulse.

- Single-user dashboard for outreach, sent messages, and job applications.
- Gmail API and SMTP sending, with Gmail/IMAP reply and bounce polling.
- Optional open and click tracking with source classification and engagement evidence.
- Authenticated message registration, sending, and statistics APIs.
- Portable JSON imports and a standard-library Python client.
- Local setup helper, Vercel configuration, and deployment/security documentation.
- MIT license, contributor templates, CI checks, and history secret scanning.

### Limitations

Tracking signals are estimates, not read receipts. Each installation belongs to one
trusted operator. Follow-ups are composed manually. There is no multi-user isolation,
campaign scheduler, unsubscribe/suppression system, or automatic data-retention expiry.
Production hosting and a real-mailbox acceptance check are the operator's responsibility.

The release dependency check reports no production advisories. Development tooling has
moderate advisories through Drizzle Kit's esbuild loader and ESLint's minimatch dependency.
The package manager proposes breaking toolchain downgrades rather than a compatible fix;
these were not applied. Do not expose development tooling publicly. Dependabot monitors updates.
