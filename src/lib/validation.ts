import { isIP } from "node:net";
import { z } from "zod";
import { STATUSES } from "./statuses";

export const recordId = z.string().uuid();
export function pageNumber(value: string | string[] | undefined): number {
  const result = z.coerce.number().int().min(1).max(1000000).safeParse(typeof value === "string" ? value : 1);
  return result.success ? result.data : 1;
}
export const mailAddress = z.string().trim().max(254).email();
export const headerText = z.string().max(998).regex(/^[^\r\n]*$/, "Line breaks are not allowed in email headers");
export const shortText = z.string().max(500);
export const optionalId = recordId.nullish();
export const dailyLimit = z.coerce.number().int().min(1).max(10000);
export const port = z.coerce.number().int().min(1).max(65535);
const host = z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/, "Enter a hostname without a scheme or port");
export const webUrl = z.string().url().regex(/^[^\r\n]*$/).refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Use an HTTP or HTTPS URL without credentials");

export const mailboxInput = z.object({
  label: shortText.min(1), email: mailAddress, fromName: headerText.nullish(),
  kind: z.literal("smtp"), smtpHost: host, smtpPort: port, smtpSecure: z.boolean(),
  smtpUser: shortText.nullish(), smtpPassEnc: z.string().min(1),
  imapHost: host.nullish(), imapPort: port, dailyLimit,
});

export const applicationInput = z.object({
  company: shortText.min(1), role: shortText.nullish(), location: shortText.nullish(),
  region: shortText.nullish(), track: shortText.nullish(), priority: shortText.nullish(),
  contactName: shortText.nullish(), contactRole: shortText.nullish(),
  contactEmail: z.string().max(2048).refine((value) =>
    value.split(/[;,]/).every((email) => mailAddress.safeParse(email.trim()).success),
  "Enter valid email addresses separated by commas or semicolons").nullish(),
  link: webUrl.nullish(), source: z.string().max(2000).nullish(),
  status: z.enum(STATUSES),
  followUpOn: z.iso.date().nullish(), notes: z.string().max(50000).nullish(),
});

export const settingsInput = z.object({
  graceSeconds: z.number().int().min(0).max(3600),
  dedupeSeconds: z.number().int().min(0).max(86400),
  followUpAfterDays: z.number().int().min(1).max(365),
  selfIps: z.array(z.string().refine((value) => isIP(value) !== 0, "Invalid IP address")).max(100),
});
