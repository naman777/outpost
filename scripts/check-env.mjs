import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const errors = [];
const warnings = [];
for (const key of ["DASHBOARD_PASSWORD", "APP_SECRET", "API_KEY", "CRON_SECRET"]) {
  const value = process.env[key];
  if (!value || value.length < (key === "DASHBOARD_PASSWORD" ? 16 : 32) || /^(change-me|your[-_]|replace[-_])/i.test(value)) errors.push(`${key}: set a strong, unique secret (npm run setup generates these).`);
}
const secrets = ["DASHBOARD_PASSWORD", "APP_SECRET", "API_KEY", "CRON_SECRET"].map((key) => process.env[key]).filter(Boolean);
if (new Set(secrets).size !== secrets.length) errors.push("Use different values for each secret.");
try {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
} catch { errors.push("DATABASE_URL: enter a Postgres connection URL with a database name."); }
try {
  const url = new URL(process.env.APP_URL || "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || (!local && url.protocol !== "https:")) throw new Error();
  if (local) warnings.push("APP_URL is local: remote email clients cannot load tracking URLs.");
} catch { errors.push("APP_URL: use an HTTPS origin without a path, query or credentials (HTTP localhost is allowed)."); }
try { new Intl.DateTimeFormat("en", { timeZone: process.env.APP_TIMEZONE || "UTC" }); }
catch { errors.push("APP_TIMEZONE: use an IANA timezone such as UTC or Asia/Kolkata."); }
if (Boolean(process.env.GOOGLE_CLIENT_ID) !== Boolean(process.env.GOOGLE_CLIENT_SECRET)) errors.push("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or leave both empty.");
if (process.env.DATABASE_POOL_MAX && (!/^\d+$/.test(process.env.DATABASE_POOL_MAX) || +process.env.DATABASE_POOL_MAX < 1 || +process.env.DATABASE_POOL_MAX > 100)) errors.push("DATABASE_POOL_MAX: use an integer from 1 to 100.");
for (const error of errors) console.error(error);
for (const warning of warnings) console.warn(warning);
if (errors.length) process.exitCode = 1;
else console.log("Environment values look valid. No secrets were printed. This check does not connect to Postgres or a mailbox.");
