# Import applications and sent history

The public importer accepts a versioned JSON file, not a particular spreadsheet or folder from the original developer's job search. Convert spreadsheet/send-log data into the format below first. The older hardcoded spreadsheet and resend-date assumptions have been removed.

```sh
npm run import:tracker -- --file examples/import.json --from you@example.com --dry-run
```

The included file contains fictional data. Dry run validates the whole file without a database connection or any email sending. `--from` is required; there is no personal sender default. To import your own export, put it under the ignored `data/` directory, back up your database, then omit `--dry-run`:

```sh
npm run import:tracker -- --file data/my-export.json --from you@example.com
```

## File format, version 1

The root contains `version: 1` and optional `applications` and `messages` arrays (up to 10,000 items each, 20 MiB per file). Unknown fields are rejected. See [the complete fictional example](../examples/import.json).

| Application field | Format |
| --- | --- |
| `id` | Required stable external identifier, 1–200 characters; unique in this array. |
| `company` | Required company name, up to 500 characters. |
| `status` | Defaults to `researching`; one of `researching`, `emailed`, `opened`, `replied`, `interviewing`, `offer`, `rejected`, `ghosted`, `closed`. |
| `role`, `location`, `region`, `track`, `priority`, `contactName`, `contactRole` | Optional strings up to 500 characters each. |
| `contactEmail` | Optional email address, or comma/semicolon-separated addresses. |
| `link` | Optional HTTP/HTTPS URL without credentials. |
| `source`, `notes` | Optional text, up to 2,000 / 50,000 characters. |
| `followUpOn` | Optional calendar date, `YYYY-MM-DD`. |

| Message field | Format |
| --- | --- |
| `id` | Required stable external identifier, unique in this array. |
| `toEmail` | Required single recipient email address. |
| `sentAt` | Required ISO timestamp with `Z` or an explicit offset, e.g. `2026-01-15T10:00:00+05:30`. No inferred date/timezone. |
| `subject`, `toName`, `messageIdHeader` | Optional header strings without line breaks; up to 998 characters. Preserve the original Message-ID if known for better reply matching. |
| `bodyText` | Optional plain text, up to 1,000,000 characters. Imported HTML is not accepted by this format. |
| `status` | `sent` (default), `failed` or `bounced`. A bounced message uses `sentAt` as its approximate bounce timestamp. |
| `applicationId` | Optional external application `id` from the same file. |
| `followUpOf` | Optional external message `id` from the same file. Self references and cycles are rejected. |
| `template` | Optional grouping label up to 500 characters. |

## Behavior and privacy

- An import never sends email, connects to a mailbox, or retroactively adds tracking pixels. Imported mail is excluded from open-rate denominators. Connect the matching sender and sync to look for replies to eligible recent sent messages.
- Stable identifiers are namespaced by the explicit sender. Reimporting the same IDs for the same sender skips existing records and preserves dashboard edits/statuses; it does not update old records. Keep identifiers stable and back up before importing.
- The transaction is all-or-nothing. Validate first with `--dry-run`. References must be included in the file, even if you imported those records earlier.
- Private exports can contain contact addresses and message content. Keep them out of Git and screenshots. `data/`, spreadsheets, CSVs and common database dumps are ignored by default; this does not protect files already committed or files saved under other names.
