"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accounts, applications, db, messages } from "@/db";
import { encrypt } from "@/lib/crypto";
import { resolveApplication } from "@/lib/apps";
import { setClickInclusion, setOpenInclusion } from "@/lib/recount";
import { recordReply } from "@/lib/reply-events";
import { STATUSES } from "@/lib/pipeline";
import { PRESETS, smtpTransport } from "@/lib/providers/smtp";
import { createTrackedMessage, deliver, type Attachment } from "@/lib/send";
import { saveSettings } from "@/lib/settings";
import { syncAll } from "@/lib/sync";
import { requireDashboardSession } from "@/lib/auth";
import { applicationInput, dailyLimit, headerText, mailboxInput, recordId, settingsInput, shortText } from "@/lib/validation";
import { messageInput } from "@/lib/api";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export type ActionState = { ok?: boolean; error?: string; message?: string; html?: string; id?: string } | null;

// ---------- accounts ----------

export async function addSmtpAccount(_prev: ActionState, f: FormData): Promise<ActionState> {
  await requireDashboardSession();
  const email = str(f, "email");
  const pass = str(f, "password");
  if (!email || !pass) return { error: "Email and app password are required." };
  const preset = PRESETS[str(f, "preset") ?? ""];
  const values = {
    label: str(f, "label") ?? email,
    email: email.toLowerCase(),
    fromName: str(f, "fromName"),
    kind: "smtp" as const,
    smtpHost: str(f, "smtpHost") ?? preset?.smtpHost ?? null,
    smtpPort: Number(str(f, "smtpPort") ?? preset?.smtpPort ?? 465),
    smtpSecure: str(f, "smtpSecure") ? str(f, "smtpSecure") === "true" : (preset?.smtpSecure ?? true),
    smtpUser: str(f, "smtpUser") ?? email,
    smtpPassEnc: encrypt(pass),
    imapHost: str(f, "imapHost") ?? preset?.imapHost ?? null,
    imapPort: Number(str(f, "imapPort") ?? preset?.imapPort ?? 993),
    dailyLimit: Number(str(f, "dailyLimit") ?? 20),
  };
  if (!values.smtpHost) return { error: "Pick a provider or fill in the SMTP host." };
  const validated = mailboxInput.safeParse(values);
  if (!validated.success) return { error: validated.error.issues[0].message };
  try {
    await smtpTransport({ ...values, id: "", active: true, gmailRefreshTokenEnc: null, lastSyncedAt: null, lastSyncError: null, createdAt: new Date() }).verify();
  } catch (err) {
    return { error: `Could not log in to SMTP: ${(err as Error).message}` };
  }
  await db.insert(accounts).values(values);
  revalidatePath("/accounts");
  return { ok: true, message: `Connected ${email}.` };
}

export async function updateAccount(f: FormData) {
  await requireDashboardSession();
  const id = recordId.parse(str(f, "id"));
  await db
    .update(accounts)
    .set({
      label: shortText.nullish().parse(str(f, "label")) ?? undefined,
      fromName: headerText.nullish().parse(str(f, "fromName")),
      dailyLimit: dailyLimit.parse(str(f, "dailyLimit") ?? 20),
      active: f.get("active") === "on",
    })
    .where(eq(accounts.id, id));
  revalidatePath("/accounts");
}

export async function deleteAccount(f: FormData) {
  await requireDashboardSession();
  await db.delete(accounts).where(eq(accounts.id, recordId.parse(str(f, "id"))));
  revalidatePath("/accounts");
}

export async function syncNow(): Promise<ActionState> {
  await requireDashboardSession();
  const r = await syncAll();
  revalidatePath("/", "layout");
  const errors = r.filter((x) => x.error).map((x) => `${x.account}: ${x.error}`);
  const found = r.reduce((n, x) => n + x.found, 0);
  if (!r.length) return { error: "No connected mailboxes to sync. Add one on the Accounts page." };
  return errors.length ? { error: errors.join(" · "), message: `${found} new` } : { ok: true, message: `Synced ${r.length} mailbox(es): ${found} new replies/bounces.` };
}

// ---------- compose ----------

async function readAttachments(f: FormData): Promise<Attachment[]> {
  const files = f.getAll("attachments").filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length > 10 || files.reduce((total, file) => total + file.size, 0) > 2 * 1024 * 1024) {
    throw new Error("Use at most 10 attachments totaling 2 MiB.");
  }
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: file.type || undefined,
      contentBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })),
  );
}

export async function composeAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  await requireDashboardSession();
  const to = str(f, "to");
  const via = str(f, "via") ?? "manual";
  const followUpOf = str(f, "followUpOf");
  if (followUpOf && !recordId.safeParse(followUpOf).success) return { error: "Invalid parent message." };
  if (via !== "manual" && !recordId.safeParse(via).success) return { error: "Invalid mailbox." };
  const parent = followUpOf ? (await db.select().from(messages).where(eq(messages.id, followUpOf)))[0] : undefined;
  const subject = str(f, "subject") ?? (parent ? (/^re:/i.test(parent.subject) ? parent.subject : `Re: ${parent.subject}`) : null);
  const body = str(f, "body");
  if (!to || !subject || !body) return { error: "To, subject and body are required." };
  const isHtml = f.get("format") === "html";
  const parsed = messageInput.safeParse({ to, subject, text: body, from: str(f, "from"),
    applicationId: str(f, "applicationId"), company: str(f, "company"),
    toName: str(f, "toName"), template: str(f, "template"), variant: str(f, "variant") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const applicationId = await resolveApplication({ applicationId: parsed.data.applicationId, to: parsed.data.to, company: parsed.data.company });
  const common = {
    to,
    toName: str(f, "toName"),
    subject,
    text: isHtml ? null : body,
    html: isHtml ? body : null,
    template: str(f, "template"),
    variant: str(f, "variant"),
    trackClicks: f.get("trackClicks") === "on",
    applicationId,
    followUpOf,
  };

  if (via === "manual") {
    // No mailbox connected: hand back HTML with the pixel to paste into any mail client.
    const { message, html } = await createTrackedMessage({ ...common, channel: "manual", from: str(f, "from") });
    revalidatePath("/messages");
    return { ok: true, id: message.id, html, message: "Tracked. Copy the email below into your mail client and send it." };
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, via));
  if (!account || !account.active) return { error: "That mailbox is missing or disabled." };
  let attachments: Attachment[];
  try { attachments = await readAttachments(f); }
  catch (err) { return { error: (err as Error).message }; }
  const { message, html, text } = await createTrackedMessage({
    ...common,
    channel: account.kind,
    accountId: account.id,
    from: account.email,
    hasAttachment: attachments.length > 0,
  });
  try {
    await deliver(message, html, text, attachments);
  } catch (err) {
    revalidatePath("/messages");
    return { error: `Send failed: ${(err as Error).message}`, id: message.id };
  }
  revalidatePath("/", "layout");
  return { ok: true, id: message.id, message: `Sent to ${to} from ${account.email}.` };
}

// ---------- messages ----------

export async function markReplied(f: FormData) {
  await requireDashboardSession();
  const id = recordId.parse(str(f, "id"));
  const [m] = await db.select().from(messages).where(eq(messages.id, id));
  if (!m) return;
  const at = new Date();
  await recordReply(m, { at, from: null, snippet: "Marked as replied by hand", key: `manual:${id}:${at.getTime()}`, kind: "reply" });
  revalidatePath(`/messages/${id}`);
}

export async function markBounced(f: FormData) {
  await requireDashboardSession();
  const id = recordId.parse(str(f, "id"));
  await db.update(messages).set({ status: "bounced", bouncedAt: new Date() }).where(eq(messages.id, id));
  revalidatePath(`/messages/${id}`);
}

export async function toggleOpen(f: FormData) {
  await requireDashboardSession();
  const id = Number(str(f, "openId"));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid open ID");
  const messageId = recordId.parse(str(f, "messageId"));
  const human = f.get("human") === "true";
  await setOpenInclusion(messageId, id, human);
  revalidatePath(`/messages/${messageId}`);
}

export async function toggleClick(f: FormData) {
  await requireDashboardSession();
  const id = Number(str(f, "clickId"));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid click ID");
  const messageId = recordId.parse(str(f, "messageId"));
  await setClickInclusion(messageId, id, f.get("human") === "true");
  for (const path of [`/messages/${messageId}`, "/messages", "/", "/insights"]) revalidatePath(path);
}

export async function deleteMessage(f: FormData) {
  await requireDashboardSession();
  await db.delete(messages).where(eq(messages.id, recordId.parse(str(f, "id"))));
  revalidatePath("/messages");
  redirect("/messages");
}

// ---------- applications ----------

export async function saveApplication(f: FormData) {
  await requireDashboardSession();
  const id = recordId.nullish().parse(str(f, "id"));
  const status = str(f, "status") ?? "researching";
  const values = {
    company: str(f, "company") ?? "(no name)",
    role: str(f, "role"),
    location: str(f, "location"),
    region: str(f, "region"),
    track: str(f, "track"),
    priority: str(f, "priority"),
    contactName: str(f, "contactName"),
    contactRole: str(f, "contactRole"),
    contactEmail: str(f, "contactEmail")?.toLowerCase() ?? null,
    link: str(f, "link"),
    source: str(f, "source"),
    status: (STATUSES as readonly string[]).includes(status) ? status : "researching",
    followUpOn: str(f, "followUpOn"),
    notes: str(f, "notes"),
    updatedAt: new Date(),
  };
  applicationInput.parse(values);
  if (id) await db.update(applications).set(values).where(eq(applications.id, id));
  else await db.insert(applications).values(values);
  revalidatePath("/applications");
  if (!id) redirect("/applications");
}

export async function setApplicationStatus(f: FormData) {
  await requireDashboardSession();
  await db
    .update(applications)
    .set({ status: applicationInput.shape.status.parse(str(f, "status")), updatedAt: new Date() })
    .where(eq(applications.id, recordId.parse(str(f, "id"))));
  revalidatePath("/applications");
}

export async function deleteApplication(f: FormData) {
  await requireDashboardSession();
  await db.delete(applications).where(eq(applications.id, recordId.parse(str(f, "id"))));
  revalidatePath("/applications");
  redirect("/applications");
}

// ---------- settings ----------

export async function saveSettingsAction(f: FormData) {
  await requireDashboardSession();
  await saveSettings(settingsInput.parse({
    graceSeconds: Number(str(f, "graceSeconds") ?? 20),
    dedupeSeconds: Number(str(f, "dedupeSeconds") ?? 60),
    followUpAfterDays: Number(str(f, "followUpAfterDays") ?? 5),
    selfIps: (str(f, "selfIps") ?? "").split(/[\s,]+/).filter(Boolean),
  }));
  revalidatePath("/settings");
}
