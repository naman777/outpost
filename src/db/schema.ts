import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * A mailbox you send from. `gmail` uses Google OAuth (Gmail API send + read),
 * `smtp` works with any provider (SMTP to send, optional IMAP to read replies).
 * Messages can also be tracked with no account at all (channel `manual` / `api`).
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  email: text("email").notNull(),
  fromName: text("from_name"),
  kind: text("kind", { enum: ["gmail", "smtp"] }).notNull(),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecure: boolean("smtp_secure").default(true),
  smtpUser: text("smtp_user"),
  /** AES-256-GCM encrypted (see lib/crypto). Also used for IMAP. */
  smtpPassEnc: text("smtp_pass_enc"),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  gmailRefreshTokenEnc: text("gmail_refresh_token_enc"),
  dailyLimit: integer("daily_limit").notNull().default(20),
  active: boolean("active").notNull().default(true),
  lastSyncedAt: ts("last_synced_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** One target company / role. Replaces the Excel tracker. */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalRef: text("external_ref"),
    company: text("company").notNull(),
    role: text("role"),
    location: text("location"),
    region: text("region"),
    track: text("track"),
    priority: text("priority"),
    contactName: text("contact_name"),
    contactRole: text("contact_role"),
    contactEmail: text("contact_email"),
    link: text("link"),
    source: text("source"),
    status: text("status").notNull().default("researching"),
    followUpOn: date("follow_up_on"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("applications_external_ref_idx").on(t.externalRef), index("applications_status_idx").on(t.status)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unguessable id used in the pixel / click URLs. */
    trackingId: text("tracking_id").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    followUpOf: uuid("follow_up_of"),
    /** gmail | smtp (sent by this app), api (registered by a script), manual (copy/paste), imported (no pixel) */
    channel: text("channel").notNull(),
    /** false for imported mail: excluded from open / click rates, still counts for replies */
    tracked: boolean("tracked").notNull().default(true),
    fromEmail: text("from_email"),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    template: text("template"),
    variant: text("variant"),
    wordCount: integer("word_count"),
    hasAttachment: boolean("has_attachment").notNull().default(false),
    trackClicks: boolean("track_clicks").notNull().default(false),
    status: text("status", { enum: ["draft", "sent", "failed", "bounced"] }).notNull().default("sent"),
    error: text("error"),
    sentAt: ts("sent_at"),
    messageIdHeader: text("message_id_header"),
    providerMessageId: text("provider_message_id"),
    providerThreadId: text("provider_thread_id"),
    firstOpenedAt: ts("first_opened_at"),
    lastOpenedAt: ts("last_opened_at"),
    /** confirmed | likely | possible | unknown | none */
    engagementLevel: text("engagement_level").notNull().default("unknown"),
    /** Distinct included pixel sources, not people or devices. */
    openSources: jsonb("open_sources").$type<string[]>().notNull().default([]),
    openContextCount: integer("open_context_count").notNull().default(0),
    openConfidence: text("open_confidence").notNull().default("none"),
    /** opens we believe were a person */
    openCount: integer("open_count").notNull().default(0),
    /** every pixel hit, including proxies, scanners and you */
    rawOpenCount: integer("raw_open_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    rawClickCount: integer("raw_click_count").notNull().default(0),
    firstClickedAt: ts("first_clicked_at"),
    repliedAt: ts("replied_at"),
    replySnippet: text("reply_snippet"),
    bouncedAt: ts("bounced_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_tracking_id_idx").on(t.trackingId),
    index("messages_sent_at_idx").on(t.sentAt),
    index("messages_to_idx").on(t.toEmail),
    index("messages_application_idx").on(t.applicationId),
    index("messages_template_idx").on(t.template),
  ],
);

export const opens = pgTable(
  "opens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    at: ts("at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** gmail_proxy | yahoo_proxy | apple | outlook | client | bot | self */
    source: text("source").notNull(),
    isHuman: boolean("is_human").notNull(),
    /** high | medium | low | none */
    confidence: text("confidence").notNull().default("none"),
    counted: boolean("counted").notNull().default(false),
    reason: text("reason"),
  },
  (t) => [index("opens_message_idx").on(t.messageId, t.at)],
);

export const links = pgTable(
  "links",
  {
    id: text("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull(),
    clickCount: integer("click_count").notNull().default(0),
  },
  (t) => [index("links_message_idx").on(t.messageId)],
);

export const clicks = pgTable(
  "clicks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    at: ts("at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    isHuman: boolean("is_human").notNull(),
    source: text("source").notNull().default("client"),
    confidence: text("confidence").notNull().default("none"),
    reason: text("reason"),
    counted: boolean("counted").notNull().default(false),
  },
  (t) => [index("clicks_message_idx").on(t.messageId)],
);

export const replies = pgTable(
  "replies",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    fromEmail: text("from_email"),
    snippet: text("snippet"),
    /** Gmail message id or IMAP Message-ID, so a sync never stores a reply twice */
    providerKey: text("provider_key").notNull(),
    kind: text("kind", { enum: ["reply", "bounce"] }).notNull().default("reply"),
  },
  (t) => [uniqueIndex("replies_provider_key_idx").on(t.providerKey)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Open = typeof opens.$inferSelect;
