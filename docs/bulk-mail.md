# Bulk mail

Open **Bulk mail** in the dashboard to import an Excel `.xlsx` file or CSV. The first
row contains column names; Excel imports use the first worksheet. Files may contain
up to 1,000 recipient rows, 40 columns, and 1 MiB of data. Older `.xls` files must be
saved as `.xlsx` or CSV first.

1. Import the file and choose the column holding recipient email addresses.
2. Choose a connected mailbox. Insert variables such as `{{name}}` and `{{company}}`
   into the subject and plain-text body. A header such as `First Name` becomes `first_name`.
3. Optionally choose shared attachments: up to 10 files totaling 2 MiB. Every recipient
   receives the same files. Open and click tracking can be selected independently.
4. Review the personalized previews and excluded rows, then press **Send N emails**.

Invalid email addresses, duplicate recipients, and rows missing a referenced variable
are excluded and shown for review. Variables are literal text substitutions. Plain-text
bodies become escaped HTML with clickable links, using the normal tracking pipeline.

## Sending and limits

Emails send individually while the tab stays open. Progress links to the normal message
details. **Stop after current email** lets the in-flight send finish and stops the remaining
recipients. A mailbox's existing daily limit is a rolling 24-hour limit shared with manual
and API sends. Capacity is reserved before contacting the mail provider to avoid concurrent
sends exceeding that limit.

When the limit is reached, remaining recipients stay unsent in the current tab. After
capacity becomes available, **Send N emails** sends only those remaining recipients.
There is no persistent queue, scheduled sending, or automatic next-day continuation.
Reloading or closing the tab discards the imported batch and local progress; sent messages
remain in Sent mail. Check that history before importing the same recipients again.

Each recipient has a request ID that prevents a repeated request from sending the same
message twice. If the network or provider response is ambiguous, the batch stops and marks
the attempted row **Needs review**. Check Outpost and the provider's Sent folder; it is not
retried automatically. A failed or interrupted attempt may remain visible as a draft until
you review it. Attachments are held in the browser for this batch and submitted per email;
Outpost does not retain their file contents for later sending.

Bulk mail is a manual sending tool. It does not add campaign scheduling, suppression lists,
unsubscribe management, or separate user accounts.
