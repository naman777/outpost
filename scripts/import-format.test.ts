import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { importInput } from "./import-format";

const example = JSON.parse(readFileSync(new URL("../examples/import.json", import.meta.url), "utf8"));
test("fictional import example validates with explicit timestamps and stable IDs", () => {
  assert.equal(importInput.safeParse(example).success, true);
});
test("imports reject duplicate IDs, missing references and dates without a timezone", () => {
  assert.equal(importInput.safeParse({ ...example, applications: [...example.applications, ...example.applications] }).success, false);
  assert.equal(importInput.safeParse({ ...example, messages: [{ ...example.messages[0], applicationId: "missing" }] }).success, false);
  assert.equal(importInput.safeParse({ ...example, messages: [{ ...example.messages[0], sentAt: "2026-01-15T10:00:00" }] }).success, false);
});
test("imports reject cyclic follow-up relationships", () => {
  assert.equal(importInput.safeParse({ version: 1, messages: [
    { ...example.messages[0], applicationId: undefined, id: "a", followUpOf: "b" },
    { ...example.messages[0], applicationId: undefined, id: "b", followUpOf: "a" },
  ] }).success, false);
});
