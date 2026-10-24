/**
 * Adds an SMTP/IMAP mailbox from the command line (same as the Mailboxes page).
 *
 *   npm run add:mailbox -- --email you@gmail.com --preset gmail --name "Your Name" --limit 20
 *
 * The app password is read from MAILBOX_PASSWORD rather than a command-line argument.
 * Custom servers: --smtp-host h --smtp-port 587 --starttls --imap-host h [--user login]
 */
import { config } from "dotenv";
import { mailboxInput } from "../src/lib/validation";

config({ path: ".env.local" });
config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { db, accounts } = await import("../src/db");
  const { encrypt } = await import("../src/lib/crypto");
  const { PRESETS, smtpTransport } = await import("../src/lib/providers/smtp");

  const email = arg("email");
  const pass = process.env.MAILBOX_PASSWORD;
  if (!email || !pass) throw new Error("Pass --email and set MAILBOX_PASSWORD.");
  const preset = PRESETS[arg("preset") ?? ""];
  const values = {
    label: arg("label") ?? email,
    email: email.toLowerCase(),
    fromName: arg("name") ?? null,
    kind: "smtp" as const,
    smtpHost: arg("smtp-host") ?? preset?.smtpHost,
    smtpPort: Number(arg("smtp-port") ?? preset?.smtpPort ?? 465),
    smtpSecure: process.argv.includes("--starttls") ? false : (preset?.smtpSecure ?? true),
    smtpUser: arg("user") ?? email,
    smtpPassEnc: encrypt(pass),
    imapHost: arg("imap-host") ?? preset?.imapHost ?? null,
    imapPort: Number(arg("imap-port") ?? preset?.imapPort ?? 993),
    dailyLimit: Number(arg("limit") ?? 20),
  };
  if (!values.smtpHost) throw new Error("Pass --preset (gmail, outlook, zoho, yahoo, icloud, fastmail) or --smtp-host.");
  mailboxInput.parse(values);
  if (!process.argv.includes("--skip-verify")) {
    await smtpTransport({ ...values, id: "", active: true, gmailRefreshTokenEnc: null, lastSyncedAt: null, lastSyncError: null, createdAt: new Date() }).verify();
  }
  const [row] = await db.insert(accounts).values(values).returning({ id: accounts.id });
  console.log(`Added ${email} (${row.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
