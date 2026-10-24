import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { Account } from "@/db/schema";
import { decrypt } from "../crypto";

/** Host presets so connecting another mailbox only needs an address and an app password. */
export const PRESETS: Record<string, { label: string; smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number }> = {
  gmail: { label: "Gmail / Google Workspace (app password)", smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993 },
  outlook: { label: "Outlook / Microsoft 365", smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993 },
  zoho: { label: "Zoho Mail", smtpHost: "smtp.zoho.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.zoho.com", imapPort: 993 },
  yahoo: { label: "Yahoo Mail (app password)", smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.mail.yahoo.com", imapPort: 993 },
  icloud: { label: "iCloud Mail (app password)", smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecure: false, imapHost: "imap.mail.me.com", imapPort: 993 },
  fastmail: { label: "Fastmail (app password)", smtpHost: "smtp.fastmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.fastmail.com", imapPort: 993 },
};

const creds = (a: Account) => ({ user: a.smtpUser || a.email, pass: decrypt(a.smtpPassEnc!).replace(/\s+/g, "") });

export function smtpTransport(a: Account) {
  if (!a.smtpHost || !a.smtpPassEnc) throw new Error(`Account ${a.email} has no SMTP settings.`);
  return nodemailer.createTransport({
    host: a.smtpHost,
    port: a.smtpPort ?? 465,
    secure: a.smtpSecure ?? true,
    requireTLS: !(a.smtpSecure ?? true),
    auth: creds(a),
  });
}

export function imapClient(a: Account) {
  if (!a.imapHost || !a.smtpPassEnc) throw new Error(`Account ${a.email} has no IMAP settings.`);
  return new ImapFlow({
    host: a.imapHost,
    port: a.imapPort ?? 993,
    secure: true,
    auth: creds(a),
    logger: false,
  });
}
