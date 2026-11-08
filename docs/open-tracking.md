# Open tracking and engagement evidence

An image request is an estimate, not a read receipt. Outpost keeps raw events, filtering decisions and deduplicated counts separate so you can inspect the evidence.

## Tracking controls

`POST /api/v1/send` and `POST /api/v1/messages` accept `trackOpens` (boolean, default `true`). Set it to `false` to omit Outpost's image. Leave `trackClicks: false` (the default) to avoid link rewriting too.

```json
{
  "from": "you@example.com",
  "to": "alex@example.com",
  "subject": "Hello",
  "text": "A short message.",
  "trackOpens": false,
  "trackClicks": false
}
```

Send history, Message-ID, application association and reply/bounce checks still work with pixels off. Disabled pixels return no new events; registration returns `pixelUrl: null` and `pixelHtml: null`. Only Outpost's own image is controlled: remote images supplied in your HTML remain.

## Confidence categories

These categories describe a classification rule, not a measured probability or proof of reading. The compatibility field `isHuman` means a request is eligible for an estimate, not that a person has been identified. `counted` indicates whether that eligible event actually contributes after deduplication.

| Confidence | Interpretation |
| --- | --- |
| `high` | Explicitly included by the operator. This does not make it a verified read. |
| `medium` | An image request passed available filters, or a link request looked like browser navigation. Automation can still pass. |
| `low` | Ambiguous early image load, HTML request at the pixel endpoint, repeat Apple load, or link fetch without enough navigation evidence. Excluded from estimated counts. |
| `none` | Self/operator activity, recognized automation, explicit prefetch or an initial possible Apple privacy load. Excluded. |

Gmail and Yahoo proxy requests receive at most `medium`. The grace period applies to Gmail too: rapid reading and prefetch cannot be reliably distinguished. Missing Accept-Language alone does not disqualify a pixel request. HTML Accept headers at an image endpoint lower confidence; explicit Purpose/Sec-Purpose prefetch hints exclude the request.

Apple-related sources remain excluded automatically. A repeat Apple load over five minutes after the first gets `low` confidence with an uncertainty explanation. It is not evidence of a re-open or a way to bypass Mail Privacy Protection. A subsequent click never retroactively upgrades an Apple image event.

Scanner user agents are matched heuristically. Broad Azure, Proofpoint-like or CDN network prefixes are not definitive scanner identities, so they are not blanket blocklists. Shared operator IP exclusions can also hide a genuine recipient on the same network.

## Clicks are separate evidence

The link classifier checks self activity, known automation and prefetch first. A browser-like request accepting HTML with a language header can be included as `medium`; other link fetches remain uncertain. Some clients omit headers and some scanners imitate browsers, so both missed and false clicks remain possible.

Clicks never increment `openCount`, set `firstOpenedAt`, or change stored pixel confidence. All link requests still redirect to the intended stored HTTP/HTTPS destination, including excluded requests. Per-link totals count only included, deduplicated requests.

## Engagement levels

`computeEngagement()` returns `{ level, signals }`, including the explanation for the result. The persisted level and API/dashboard use the same evidence rules.

| API level | Dashboard label | Evidence |
| --- | --- | --- |
| `confirmed` | Reply recorded | A reply was detected or manually recorded. This confirms a recorded reply event, not human reading; auto replies and matching mistakes remain possible. |
| `likely` | Likely activity | An included browser-like click, or at least two estimated opens across distinct sources/non-proxy network contexts. |
| `possible` | Possible activity | At least one included image load, without corroborating source/context evidence. Repeated requests from one proxy stay here. |
| `unknown` | Uncertain activity | Only excluded/uncertain loads, or open tracking is off with no stronger evidence. |
| `none` | No signal | No included or raw image/link signal, with open tracking enabled. Images might be blocked or cached. |

A request context is a source/IP combination for non-proxy client or Outlook requests. It is not a session, device, recipient or unique person. Proxy IP rotation alone does not create corroboration. Neither two sources nor a click proves interest. Estimated pixel/link activity does not automatically advance the application pipeline; recorded sends/replies still do.

## Counts, corrections and concurrency

Within a source/IP context, eligible image loads less than `dedupeSeconds` apart belong to one burst. A gap at least that long begins a new burst. Click bursts are additionally scoped to the link. Unknown IPs share a context for their source. Duplicate raw events are kept with `counted: false` for inspection.

A message row lock serializes pixel, click, reply and manual-correction writes. One database derivation rebuilds counts, source summaries, confidence and engagement from stored events. The same rules are used for live requests and rebuilds. Manual inclusion/exclusion updates confidence and derived fields in both directions while preserving the original source. A reply does not manufacture a pixel open, including when pixels are off.

Message details show raw loads, included estimates, event confidence/reasons and a source breakdown. Displayed estimates and rates can change when classifications or deduplication settings are reviewed and rebuilt.

## API and Python client

Existing message fields remain. `GET /api/v1/messages` additionally returns:

- `rawOpenCount`, `rawClickCount`: all stored image/link requests.
- `openConfidence`: best confidence among included, deduplicated pixels, or `none`.
- `openSources`: distinct included pixel sources.
- `openContextCount`: distinct non-proxy source/IP contexts.
- `engagementLevel`, `engagementSignals`: level and explanatory text.

`GET /api/v1/stats` includes `engagementCounts`, with a count for each of the five levels over the same sent-message range as the other totals. Registration/send responses include the initial engagement level, pixel confidence and source list. The Python client's `messages(to=..., limit=...)` returns these fields without interpretation; `track_opens=False` remains available when registering messages.

## Upgrade an existing database

All new columns have defaults and are additive. Back up the database and keep its APP_SECRET before applying the schema. Deploy schema changes before serving the new code; defaults alone do not recompute historical events.

```sh
npm run db:push
npm run tracking:rebuild
# Review the dry-run count and back up before applying:
npm run tracking:rebuild -- --apply
```

The default rebuild is read-only. `--apply` reclassifies stored pixels using available UA/IP/timing evidence, preserves explicit operator decisions and recorded header-based exclusions, and rebuilds summaries transactionally per message. Legacy link requests without navigation evidence are excluded rather than treated as proven clicks. Historic headers/cookies that were not stored cannot be reconstructed, and results may differ from old totals. The process is resumable and sends no email. Restart/redeploy after applying the schema; if rebuilding fails, completed message transactions remain saved and the current transaction rolls back.

## Limitations and accuracy

- Blocked images, privacy protection, proxy caches and stripped remote content can hide reads.
- Scanners, previews, forged user agents and forwarded messages can produce misleading loads or navigation.
- Apple timing cannot distinguish a genuine view from background fetching. Apple's [Mail Privacy Protection explanation](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/) describes background loads regardless of engagement.
- Google [documents image scanning and configurable loading](https://support.google.com/mail/answer/145919); Gmail proxy identity does not establish a human read.
- Replies are stronger evidence of a response, but sender-based matching is weaker than exact thread matching and automatic responses may be included.
- Do not optimize follow-ups solely on estimated opens, infer reading duration, or label repeat loads as proof of interest.

## Verification

### Correcting clicks

On a message's timeline, use **Include this click** for a request you recognize that was excluded,
or **Exclude this click** for an included request you know was yours or automated.
An **excluded: dashboard IP match** label means the request shared an IP with dashboard activity;
people on the same Wi-Fi or office network can share an IP. This is a heuristic, not identity proof.
Corrections update message/link counts and engagement, preserve the event's source and raw history,
and still respect deduplication and disabled click tracking. They do not create image opens or replies.

### Automated checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

Tests exercise categories, exclusions, Apple uncertainty, separate click handling, source/context correlation, SQL summaries, operator corrections and reply recording. The smoke check uses a disposable Postgres engine and fictional data. Real Gmail/Apple behavior and delivery still require controlled mailbox tests; no automated test sends real mail.
