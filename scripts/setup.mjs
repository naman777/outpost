import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

try {
  let contents = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const name of ["DASHBOARD_PASSWORD", "APP_SECRET", "API_KEY", "CRON_SECRET"]) {
    contents = contents.replace(new RegExp(`^${name}=.*$`, "m"), `${name}="${randomBytes(32).toString("base64url")}"`);
  }
  writeFileSync(new URL("../.env.local", import.meta.url), contents, { flag: "wx", mode: 0o600 });
  console.log("Created .env.local with four independent random secrets. Existing files are never overwritten.");
  console.log("Set DATABASE_URL in .env.local, then run npm run setup:check. Read DASHBOARD_PASSWORD locally to sign in.");
} catch (error) {
  console.error(error.code === "EEXIST" ? ".env.local already exists; kept unchanged. Run npm run setup:check." : "Could not create .env.local.");
  process.exitCode = 1;
}
