import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionToken, verifySessionToken, checkBearer } from "./session";
import { encrypt, decrypt } from "./crypto";
import { LOGIN_LIMIT, loginLimitResult, safeNextPath, sameOriginRequest } from "./request-security";
import { messageInput, parse, MAX_BODY_BYTES, readJsonBody } from "./api";
import { applicationInput, dailyLimit, settingsInput, webUrl } from "./validation";

test("sessions reject tampering, expiration, old versions and a changed password", () => {
  const oldSecret = process.env.APP_SECRET;
  const oldPassword = process.env.DASHBOARD_PASSWORD;
  const oldNow = Date.now;
  try {
    process.env.APP_SECRET = "test-only-app-secret-".repeat(3);
    process.env.DASHBOARD_PASSWORD = "test-only-dashboard-password";
    const token = createSessionToken();
    assert.equal(verifySessionToken(token), true);
    assert.equal(verifySessionToken(token + "tampered"), false);
    assert.equal(verifySessionToken(token.replace("v2.", "v1.")), false);
    Date.now = () => oldNow() + 31 * 864e5;
    assert.equal(verifySessionToken(token), false);
    Date.now = oldNow;
    process.env.DASHBOARD_PASSWORD = "different-test-only-password";
    assert.equal(verifySessionToken(token), false);
    process.env.DASHBOARD_PASSWORD = "short";
    assert.equal(verifySessionToken(token), false);
  } finally {
    Date.now = oldNow;
    if (oldSecret === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = oldSecret;
    if (oldPassword === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = oldPassword;
  }
});

test("encrypted mailbox secrets authenticate ciphertext and use independent IVs", () => {
  const previous = process.env.APP_SECRET;
  try {
    process.env.APP_SECRET = "test-only-encryption-key-".repeat(3);
    const first = encrypt("fictional-mailbox-password");
    const second = encrypt("fictional-mailbox-password");
    assert.notEqual(first, second);
    assert.equal(decrypt(first), "fictional-mailbox-password");
    const [iv, tag, data] = first.split(".");
    const bytes = Buffer.from(data, "base64url");
    bytes[0] ^= 1;
    assert.throws(() => decrypt(`${iv}.${tag}.${bytes.toString("base64url")}`));
  } finally {
    if (previous === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = previous;
  }
});

test("API keys require a Bearer scheme and never authorize an empty configuration", () => {
  assert.equal(checkBearer("Bearer example-key", "example-key"), true);
  assert.equal(checkBearer("example-key", "example-key"), false);
  assert.equal(checkBearer("Bearer wrong", "example-key"), false);
  assert.equal(checkBearer(null, "example-key"), false);
  assert.equal(checkBearer("Bearer anything", undefined), false);
});

test("login return URLs cannot leave the dashboard origin", () => {
  const origin = "https://mail.example.com";
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "///evil.example", "/\n/evil.example", "javascript:alert(1)"]) {
    assert.equal(safeNextPath(value, origin), "/", value);
  }
  assert.equal(safeNextPath("/messages?q=hello", origin), "/messages?q=hello");
});

test("login and logout require a matching browser origin", () => {
  const previous = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://mail.example.com";
    const req = (origin?: string) => new Request("https://mail.example.com/api/auth/login", { headers: origin ? { origin } : {} });
    assert.equal(sameOriginRequest(req("https://mail.example.com")), true);
    assert.equal(sameOriginRequest(req("https://evil.example")), false);
    assert.equal(sameOriginRequest(req("null")), false);
    assert.equal(sameOriginRequest(req()), false);
  } finally {
    if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous;
  }
});

test("login throttle rejects attempts after the limit and returns a bounded wait", () => {
  assert.equal(loginLimitResult({ attempts: LOGIN_LIMIT, resetAt: 10000 }, 1000).allowed, true);
  assert.deepEqual(loginLimitResult({ attempts: LOGIN_LIMIT + 1, resetAt: 10000 }, 1000), { allowed: false, retryAfter: 9 });
});

test("API validation rejects header injection, invalid IDs, huge text and unsafe URLs", () => {
  const valid = { to: "alex@example.com", subject: "Hello", text: "Fictional message" };
  assert.equal(messageInput.safeParse(valid).success, true);
  for (const patch of [{ subject: "Hello\r\nBcc: other@example.com" }, { to: "one@example.com,two@example.com" }, { applicationId: "bad-id" }, { text: "x".repeat(1000001) }]) {
    assert.equal(messageInput.safeParse({ ...valid, ...patch }).success, false);
  }
  assert.equal(webUrl.safeParse("javascript:alert(1)").success, false);
  assert.equal(webUrl.safeParse("https://user:password@example.com").success, false);
  assert.equal(dailyLimit.safeParse(-1).success, false);
  assert.equal(applicationInput.safeParse({ company: "Example", status: "unknown" }).success, false);
  assert.equal(settingsInput.safeParse({ graceSeconds: 0, dedupeSeconds: 60, followUpAfterDays: 5, selfIps: ["spoofed-ip"] }).success, false);
});

test("JSON handling rejects malformed and oversized streams without Content-Length", async () => {
  const malformed = await readJsonBody(new Request("https://mail.example.com", { method: "POST", body: "{" }));
  assert.equal("error" in malformed && malformed.error.status, 400);
  const oversized = await readJsonBody(new Request("https://mail.example.com", { method: "POST", body: "x".repeat(MAX_BODY_BYTES + 1) }));
  assert.equal("error" in oversized && oversized.error.status, 413);
  const missingText = await parse(new Request("https://mail.example.com", { method: "POST", body: JSON.stringify({ to: "alex@example.com" }) }), messageInput);
  assert.equal("error" in missingText && missingText.error.status, 400);
});
