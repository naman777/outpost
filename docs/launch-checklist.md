# Launch checklist

Use this checklist for each self-hosted installation. The repository release does not
create a hosted service or configure a mailbox.

## Repository release

- [ ] Tests, lint, type checking, build, and isolated smoke checks pass for the release commit.
- [ ] Gitleaks scans the complete Git history and the staged release diff.
- [ ] README screenshots contain fictional data only.
- [ ] Release notes describe supported behavior and known limitations.

## Production installation

- [ ] Create a separate hosting project and empty Postgres database.
- [ ] Configure `DATABASE_URL`, `APP_URL`, `DASHBOARD_PASSWORD`, `APP_SECRET`, `API_KEY`, and `CRON_SECRET`.
- [ ] Set `APP_URL` to the stable production HTTPS origin and `APP_TIMEZONE` as desired.
- [ ] Back up `APP_SECRET` securely alongside a separate, access-controlled database backup.
- [ ] Run `npm run setup:check` and manually initialize the intended database with `npm run db:push`.
- [ ] Deploy and confirm dashboard sign-in and empty pages work.
- [ ] Verify unauthenticated API and cron requests are rejected.
- [ ] Verify the scheduled authenticated reply/bounce sync works.
- [ ] Keep production credentials out of previews and contributor builds.

## Mailbox acceptance

- [ ] Connect a mailbox belonging to the operator.
- [ ] Send one test email to a second address the operator owns.
- [ ] Check public pixel/click behavior, including disabled tracking.
- [ ] Reply from the second address and confirm manual sync detects it.
- [ ] Check sync errors and provider restrictions before wider use.
- [ ] Configure exact callback URLs if using optional Gmail OAuth.

## Public presentation

Use the repository screenshots or a separate demo with fictional data. The application
has one operator per installation; it does not isolate users. A public demo needs its
own restrictions before allowing visitors to write data or connect mailboxes.

See [setup](setup.md) for commands and [security](security.md) for stored data and retention limitations.
