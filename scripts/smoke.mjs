/** Isolated HTTP checks against a built app and a disposable in-memory Postgres engine. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

if (!existsSync(".next/BUILD_ID")) throw new Error("Run npm run build before npm run test:smoke.");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const pg = new PGlite();
const database = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
let app;
try {
  await database.start();
  const env = {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: `postgresql://postgres:postgres@${database.getServerConn()}/postgres`,
    DATABASE_POOL_MAX: "1", APP_URL: origin, APP_TIMEZONE: "UTC",
    DASHBOARD_PASSWORD: randomBytes(32).toString("base64url"),
    APP_SECRET: randomBytes(32).toString("base64url"),
    API_KEY: randomBytes(32).toString("base64url"),
    CRON_SECRET: randomBytes(32).toString("base64url"),
    GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  };
  const runNode = (args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Fixture command timed out")); }, 60000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => { clearTimeout(timer); if (code === 0) resolve(output); else reject(new Error(`Fixture command failed: ${args[0]}`)); });
  });
  // Exercise the actual documented schema command, without touching an external database.
  await runNode(["node_modules/drizzle-kit/bin.cjs", "push", "--force"]);
  const importArgs = ["--import", "tsx", "scripts/import-outreach.ts", "--file", "examples/import.json", "--from", "sender@example.com"];
  await runNode(importArgs);
  // Recreate the pre-confidence schema around existing fictional data, then upgrade it.
  await pg.exec(`
    alter table messages drop column engagement_level, drop column open_sources,
      drop column open_context_count, drop column open_confidence, drop column raw_click_count;
    alter table opens drop column confidence, drop column counted;
    alter table clicks drop column source, drop column confidence, drop column reason, drop column counted;
  `);
  await runNode(["node_modules/drizzle-kit/bin.cjs", "push", "--force"]);
  assert.match(await runNode(["--import", "tsx", "scripts/rebuild-tracking.ts"]), /Dry run/);
  await runNode(["--import", "tsx", "scripts/rebuild-tracking.ts", "--apply"]);
  const secondImport = await runNode(importArgs);
  assert.match(secondImport, /Imported 0 applications and 0 messages/);
  const counts = await pg.query("select (select count(*) from applications)::int as applications, (select count(*) from messages)::int as messages");
  assert.deepEqual(counts.rows[0], { applications: 1, messages: 1 });
  console.log("Passed: fresh schema, additive upgrade, historical rebuild and idempotent fictional import.");

  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  // Consume child output, keeping generated credentials and request data out of test output.
  app.stdout.on("data", () => {});
  app.stderr.on("data", () => {});
  const request = (path, options = {}) => fetch(origin + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(15000) });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await request("/login")).status === 200; } catch {}
    if (ready) break;
    if (app.exitCode !== null) throw new Error("Fixture app exited before startup");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Fixture app did not become ready");
  if (process.argv.includes("--browser")) {
    const { checkBrowserAuth } = await import("./browser-auth.mjs");
    await checkBrowserAuth({ origin, password: env.DASHBOARD_PASSWORD });
  }
  assert.equal((await request("/")).status, 307);
  for (const path of ["/api/v1/stats", "/api/v1/messages", "/api/cron/sync", "/api/auth/google"]) {
    assert.equal((await request(path)).status, 401, path);
  }
  assert.equal((await request("/login")).headers.get("x-frame-options"), "DENY");
  const signIn = (password, extra = {}) => request("/api/auth/login", {
    method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded", ...extra },
    body: new URLSearchParams({ password, next: "/\\evil.example" }),
  });
  assert.equal((await signIn("wrong", { origin: "https://evil.example" })).status, 403);
  assert.equal((await signIn("wrong")).status, 303);
  const signedIn = await signIn(env.DASHBOARD_PASSWORD);
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get("location"), origin + "/");
  const cookie = signedIn.headers.getSetCookie().find((value) => value.startsWith("mp_session="))?.split(";")[0];
  assert.ok(cookie);
  for (const path of ["/", "/messages", "/applications", "/compose", "/accounts", "/settings", "/insights"]) {
    assert.equal((await request(path, { headers: { cookie } })).status, 200, path);
  }
  console.log("Passed: dashboard authentication, safe login redirects and all dashboard pages.");
  for (const path of ["/messages/------------------------------------", "/applications/------------------------------------"]) {
    const missing = await request(path, { headers: { cookie } });
    // Next.js may have streamed the layout (200) before rendering notFound().
    assert.ok([200, 404].includes(missing.status));
    assert.match(await missing.text(), /This page could not be found|NEXT_HTTP_ERROR_FALLBACK;404/);
  }
  for (const path of ["/messages?page=Infinity", "/applications?page=1.5", "/compose?followUpOf=------------------------------------"]) {
    assert.equal((await request(path, { headers: { cookie } })).status, 200);
  }

  const apiHeaders = { authorization: `Bearer ${env.API_KEY}`, "content-type": "application/json" };
  assert.equal((await request("/api/v1/stats?days=-1", { headers: apiHeaders })).status, 400);
  assert.equal((await request("/api/v1/messages?limit=NaN", { headers: apiHeaders })).status, 400);
  const register = (patch) => request("/api/v1/messages", { method: "POST", headers: apiHeaders, body: JSON.stringify({ to: "alex@example.com", subject: "Fixture", text: "Test https://example.com", ...patch }) });
  assert.equal((await register({ subject: "Injected\r\nBcc: other@example.com" })).status, 400);
  const off = await register({ trackOpens: false });
  assert.equal(off.status, 201);
  const offData = await off.json();
  assert.equal(offData.pixelUrl, null);
  assert.ok(!offData.html.includes("/t/o/"));
  const on = await register({ trackOpens: true, trackClicks: true, sentAt: new Date(Date.now() - 60000).toISOString() });
  assert.equal(on.status, 201);
  const onData = await on.json();
  const pixel = await fetch(onData.pixelUrl, { headers: { "user-agent": "GoogleImageProxy" } });
  assert.equal(pixel.headers.get("content-type"), "image/gif");
  const link = onData.html.match(/href="([^"]*\/t\/c\/[^" ]+)"/)[1];
  const browserHeaders = { "user-agent": "Mozilla/5.0 Chrome/130 Safari/537.36", accept: "text/html", "accept-language": "en" };
  const clicked = await fetch(link, { redirect: "manual", headers: browserHeaders });
  assert.equal(clicked.status, 302);
  assert.equal(clicked.headers.get("location"), "https://example.com");
  const stats = await request("/api/v1/stats", { headers: apiHeaders });
  assert.equal(stats.status, 200);
  const tracked = await pg.query("select open_count from messages where id = $1", [onData.id]);
  assert.ok(tracked.rows[0].open_count >= 1);
  await Promise.all(Array.from({ length: 8 }, () => fetch(onData.pixelUrl, { headers: { "user-agent": "GoogleImageProxy" } })));
  const repeated = await pg.query("select open_count, raw_open_count, engagement_level from messages where id = $1", [onData.id]);
  assert.equal(repeated.rows[0].open_count, 1);
  assert.equal(repeated.rows[0].raw_open_count, 9);
  assert.equal(repeated.rows[0].engagement_level, "likely", "The separate browser-like click supplies the likely signal");
  const apple = await (await register({ subject: "Apple fixture", trackClicks: true, sentAt: new Date(Date.now() - 600000).toISOString() })).json();
  const appleHeaders = { "user-agent": "Mozilla/5.0 AppleWebKit/605.1.15" };
  await fetch(apple.pixelUrl, { headers: appleHeaders });
  await pg.query("update opens set at = now() - interval '6 minutes' where message_id = $1", [apple.id]);
  await fetch(apple.pixelUrl, { headers: appleHeaders });
  const appleLink = apple.html.match(/href="([^"]*\/t\/c\/[^" ]+)"/)[1];
  await fetch(appleLink, { redirect: "manual", headers: browserHeaders });
  const appleEvents = await pg.query("select id, confidence from opens where message_id = $1 order by at", [apple.id]);
  assert.deepEqual(appleEvents.rows.map((event) => event.confidence), ["none", "low"]);
  const appleSummary = await pg.query("select open_count, first_opened_at, engagement_level from messages where id = $1", [apple.id]);
  assert.equal(appleSummary.rows[0].open_count, 0);
  assert.equal(appleSummary.rows[0].first_opened_at, null);
  assert.equal(appleSummary.rows[0].engagement_level, "likely");
  const list = await (await request("/api/v1/messages", { headers: apiHeaders })).json();
  const apiMessage = list.messages.find((message) => message.id === apple.id);
  assert.equal(apiMessage.openConfidence, "none");
  assert.deepEqual(apiMessage.openSources, []);
  assert.equal(apiMessage.rawOpenCount, 2);
  assert.ok(apiMessage.engagementSignals.length);
  const detail = await request(`/messages/${apple.id}`, { headers: { cookie } });
  assert.match(await detail.text(), /Image-load sources/);
  console.log("Passed: API validation, optional pixels, public pixel/click endpoints and statistics.");

  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const invokeAction = async (name, values) => {
    const entry = Object.entries(manifest.node).find(([, value]) => value.exportedName === name);
    assert.ok(entry, name);
    const form = new FormData();
    form.set(`$ACTION_ID_${entry[0]}`, "");
    for (const [key, value] of Object.entries(values)) form.set(key, String(value));
    const response = await request(`/messages/${apple.id}`, { method: "POST", headers: { origin, cookie }, body: form });
    assert.ok([200, 303].includes(response.status), `${name}: ${response.status}`);
    await response.arrayBuffer();
  };
  const clickEvent = (await pg.query("select id from clicks where message_id = $1 and counted limit 1", [apple.id])).rows[0];
  assert.ok(clickEvent);
  await invokeAction("toggleClick", { messageId: apple.id, clickId: clickEvent.id, human: false });
  let clickSummary = (await pg.query("select click_count, open_count, engagement_level from messages where id = $1", [apple.id])).rows[0];
  assert.deepEqual(clickSummary, { click_count: 0, open_count: 0, engagement_level: "unknown" });
  const excludedClickPage = await request(`/messages/${apple.id}`, { headers: { cookie } });
  assert.match(await excludedClickPage.text(), /Include this click/);
  await invokeAction("toggleClick", { messageId: apple.id, clickId: clickEvent.id, human: true });
  clickSummary = (await pg.query("select click_count, open_count, engagement_level from messages where id = $1", [apple.id])).rows[0];
  assert.deepEqual(clickSummary, { click_count: 1, open_count: 0, engagement_level: "likely" });
  const includedClickPage = await request(`/messages/${apple.id}`, { headers: { cookie } });
  assert.match(await includedClickPage.text(), /Exclude this click/);
  await invokeAction("markReplied", { id: apple.id });
  await invokeAction("toggleOpen", { messageId: apple.id, openId: appleEvents.rows[0].id, human: true });
  let corrected = await pg.query("select open_count, open_confidence, engagement_level from messages where id = $1", [apple.id]);
  assert.deepEqual(corrected.rows[0], { open_count: 1, open_confidence: "high", engagement_level: "confirmed" });
  await invokeAction("toggleOpen", { messageId: apple.id, openId: appleEvents.rows[0].id, human: false });
  corrected = await pg.query("select open_count, first_opened_at, engagement_level from messages where id = $1", [apple.id]);
  assert.deepEqual(corrected.rows[0], { open_count: 0, first_opened_at: null, engagement_level: "confirmed" });
  const engagementStats = await (await request("/api/v1/stats", { headers: apiHeaders })).json();
  assert.equal(Object.values(engagementStats.engagementCounts).reduce((sum, count) => sum + count, 0), engagementStats.sent);
  assert.ok(engagementStats.engagementCounts.confirmed >= 1);
  console.log("Passed: concurrent deduplication, Apple uncertainty, API evidence, manual corrections and reply separation.");
  const action = Object.entries(manifest.node).find(([, value]) => value.exportedName === "syncNow");
  assert.ok(action);
  const directAction = await request("/accounts", { method: "POST", headers: { origin, "next-action": action[0], "content-type": "text/plain;charset=UTF-8" }, body: "[]" });
  assert.ok([303, 307].includes(directAction.status), "Unauthenticated action must redirect to sign-in");
  const cron = await request("/api/cron/sync", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  assert.equal(cron.status, 200);
  if (process.argv.includes("--screenshots")) {
    const { captureScreenshots } = await import("./capture-screenshots.mjs");
    await captureScreenshots({ pg, origin, cookie });
  }
  for (let attempt = 0; attempt < 19; attempt++) await signIn("wrong");
  const limited = await signIn(env.DASHBOARD_PASSWORD);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await request("/api/auth/logout", { method: "POST", headers: { cookie, origin } })).status, 303);
  console.log("Passed: direct action protection, authenticated cron, durable login throttle and logout.");
  console.log("Smoke checks passed. No external database, mailbox, or real email was used.");
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await Promise.race([once(app, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  await database.stop();
  await pg.close();
}
