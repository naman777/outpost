# Contributing to Outpost

Bug reports, documentation improvements, and focused pull requests are welcome.
For substantial features, open an issue first so the scope can be discussed.
Report suspected vulnerabilities through [SECURITY.md](SECURITY.md), rather than a public issue.

## Local development

Use Node.js 22 and npm. Fork the repository, clone your fork, and create a branch.
Follow [docs/setup.md](docs/setup.md) for a separate local Postgres database and generated secrets.
Never use a production database or personal mailbox to test someone else's changes.

```sh
npm ci
npm run setup
# Set DATABASE_URL in the generated .env.local.
npm run setup:check
npm run db:push
npm run dev
```

Read [AGENTS.md](AGENTS.md) and the installed Next.js guides in `node_modules/next/dist/docs/`
before changing Next.js behavior. These guides match the installed version.

## Checks before a pull request

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:smoke
npx playwright install chromium
npm run test:browser
```

Unit and smoke checks require no external database or mailbox. The smoke script starts a
built app with a disposable in-memory Postgres engine and independent random secrets.
It never sends email. Use fictional data and example.com addresses in tests and screenshots.
Screenshot regeneration instructions are in the README.

Keep pull requests focused. Describe the problem, resulting behavior, and checks run.
Include screenshots for visible changes and setup/upgrade instructions for schema or
configuration changes. Add a regression test for behavior fixes when it would catch the bug.
Do not commit `.env.local`, private exports, generated build output, tokens, or mailbox data.

## Database changes

The schema lives in `src/db/schema.ts`. The documented installation process uses
`npm run db:push`; builds do not update the database. Explain any required manual steps,
data rebuild, or destructive operation. Verify fresh setup and upgrades with fictional data.

## Scope

Outpost is a single-user, self-hosted tool. Preserve the separation between estimated
tracking signals and confirmed replies. Changes must not imply that pixels prove reading.
Multi-user hosting, campaigns, and suppression management require separate design work.

By contributing, you agree that your contribution is available under the project's [MIT license](LICENSE).
