import assert from "node:assert/strict";
import { classifyHit, classifyClick, type HitOptions } from "./tracking";
import { test } from "node:test";
import { messageInput } from "./api";
import { injectPixel, textToHtml } from "./tracking";

test("open tracking stays enabled for existing API clients", () => {
  const parsed = messageInput.parse({ to: "you@example.com", text: "Hello" });
  assert.equal(parsed.trackOpens, true);
  assert.equal(parsed.trackClicks, false);
});

test("an explicit false survives API validation, without truthy string coercion", () => {
  const input = { to: "you@example.com", text: "Hello", trackOpens: false };
  assert.equal(messageInput.parse(input).trackOpens, false);
  assert.equal(messageInput.safeParse({ ...input, trackOpens: "false" }).success, false);
});

test("pixel-off output preserves the same email content and links without a remote image", () => {
  const html = textToHtml("Hello\n\nMy work: https://example.com/");
  assert.equal(injectPixel(html, "test-id", false), html);
  assert.doesNotMatch(injectPixel(html, "test-id", false), /<img|\/t\/o\//);
  assert.match(html, /href="https:\/\/example.com\/"/);
});

test("pixel-on output inserts one pixel inside a complete HTML body", () => {
  const output = injectPixel("<html><body>Hello</body></html>", "test-id");
  assert.equal((output.match(/<img /g) ?? []).length, 1);
  assert.match(output, /\/t\/o\/test-id\.gif/);
  assert.match(output, /<img[^>]+>.*<\/body>/);
});

const hit: HitOptions = { userAgent: "Mozilla/5.0 Chrome/130 Safari/537.36", ip: "203.0.113.10", hasSelfCookie: false, selfIps: [], secondsSinceSend: 90, graceSeconds: 20 };
test("Gmail proxy requests are medium-confidence estimates and obey the grace period", () => {
  assert.equal(classifyHit({ ...hit, userAgent: "GoogleImageProxy" }).confidence, "medium");
  assert.equal(classifyHit({ ...hit, userAgent: "GoogleImageProxy", secondsSinceSend: 2 }).isHuman, false);
  assert.equal(classifyHit({ ...hit, userAgent: "YahooMailProxy" }).confidence, "medium");
});
test("Apple timing changes uncertainty without counting a read", () => {
  const apple = { ...hit, ip: "17.1.2.3", userAgent: "Mozilla/5.0 AppleWebKit/605.1.15" };
  assert.equal(classifyHit(apple).confidence, "none");
  const later = classifyHit({ ...apple, secondsSinceFirstAppleHit: 301 });
  assert.equal(later.confidence, "low");
  assert.equal(later.isHuman, false);
  assert.match(later.reason!, /cannot establish/);
});
test("automation, self views and explicit prefetch are excluded before source heuristics", () => {
  for (const userAgent of ["", "GoogleWebPreview", "Proofpoint scanner", "EmailOnAcid", "Litmus", "curl/8"]) {
    assert.equal(classifyHit({ ...hit, userAgent }).confidence, "none");
  }
  assert.equal(classifyHit({ ...hit, hasSelfCookie: true }).source, "self");
  assert.equal(classifyHit({ ...hit, selfIps: [hit.ip!] }).isHuman, false);
  assert.equal(classifyHit({ ...hit, isPrefetch: true }).confidence, "none");
});
test("broad cloud IPs and a missing language header are not definitive bot evidence", () => {
  assert.equal(classifyHit({ ...hit, ip: "40.90.12.34", hasAcceptLanguage: false }).isHuman, true);
  assert.equal(classifyHit({ ...hit, ip: "148.163.10.2" }).confidence, "medium");
  const htmlRequest = classifyHit({ ...hit, accept: "text/html" });
  assert.equal(htmlRequest.confidence, "low");
  assert.equal(htmlRequest.isHuman, false);
});
test("clicks use browser-navigation evidence and never inherit Apple open exemptions", () => {
  const apple = { ...hit, userAgent: "Mozilla/5.0 AppleWebKit/605.1.15", ip: "17.1.2.3" };
  assert.equal(classifyClick(apple).isHuman, false);
  assert.equal(classifyClick({ ...apple, accept: "text/html", hasAcceptLanguage: true }).confidence, "medium");
  assert.equal(classifyClick({ ...apple, accept: "text/html", hasAcceptLanguage: true, isPrefetch: true }).isHuman, false);
  assert.equal(classifyClick({ ...hit, userAgent: "GoogleImageProxy", accept: "text/html", hasAcceptLanguage: true }).isHuman, false);
});
