# Security policy

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting form](https://github.com/naman777/outpost/security/advisories/new)
to contact the maintainer. Do not post credentials, inbox content, or exploit details in public issues.

Include the affected version or commit, relevant configuration, reproduction steps using
fictional data, expected behavior, observed behavior, and potential impact. Redact secrets.
Test only installations you own or have permission to assess.

## Supported versions

Security fixes target the latest release and the `main` branch. Older releases do not
have a separate maintenance commitment. Update to the latest release when a fix is published.

## Deployment security

Read [security and stored data](docs/security.md) before exposing an installation.
Each installation is for one trusted operator. Keep independent secrets and databases
for development, production, and previews; never connect real mailboxes to an unrestricted demo.

CI scans Git history with Gitleaks. This detects patterns, not every possible credential,
and does not constitute a complete security audit. Revoke exposed credentials even if
their files have been removed.
