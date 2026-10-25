import assert from "node:assert/strict";
import { test } from "node:test";
import { computeEngagement } from "./engagement";

const empty = { openCount: 0, clickCount: 0, repliedAt: null, rawOpenCount: 0, tracked: true };
test("engagement distinguishes absent signals, excluded loads and disabled tracking", () => {
  assert.equal(computeEngagement(empty).level, "none");
  assert.equal(computeEngagement({ ...empty, rawOpenCount: 3 }).level, "unknown");
  assert.equal(computeEngagement({ ...empty, tracked: false }).level, "unknown");
});
test("repeated requests from one proxy never establish likely interest", () => {
  assert.equal(computeEngagement({ ...empty, openCount: 10, rawOpenCount: 10, openSources: ["gmail_proxy", "gmail_proxy"], openContextCount: 0 }).level, "possible");
  assert.equal(computeEngagement({ ...empty, openCount: 2, openSources: ["gmail_proxy", "client"] }).level, "likely");
  assert.equal(computeEngagement({ ...empty, openCount: 2, openSources: ["client"], openContextCount: 2 }).level, "likely");
});
test("clicks support likely activity; only a recorded reply uses confirmed", () => {
  assert.equal(computeEngagement({ ...empty, tracked: false, clickCount: 1 }).level, "likely");
  const reply = computeEngagement({ ...empty, tracked: false, repliedAt: new Date() });
  assert.equal(reply.level, "confirmed");
  assert.match(reply.signals[0], /not a read receipt/);
});
