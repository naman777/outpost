import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";

test("setup creates independent secrets, refuses overwrite and checks configuration without disclosure", () => {
  const output = resolve("test-results");
  mkdirSync(output, { recursive: true });
  const fixture = mkdtempSync(join(output, "setup-"));
  try {
    mkdirSync(join(fixture, "scripts"));
    copyFileSync(".env.example", join(fixture, ".env.example"));
    for (const name of ["setup.mjs", "check-env.mjs"]) copyFileSync(join("scripts", name), join(fixture, "scripts", name));
    const env = { ...process.env };
    for (const key of ["DASHBOARD_PASSWORD", "APP_SECRET", "API_KEY", "CRON_SECRET", "APP_URL", "DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DATABASE_POOL_MAX", "APP_TIMEZONE"]) delete env[key];
    const run = (script: string, extra = {}) => spawnSync(process.execPath, [join(fixture, "scripts", script)], { cwd: fixture, env: { ...env, ...extra }, encoding: "utf8" });
    const first = run("setup.mjs");
    assert.equal(first.status, 0, first.stderr);
    const contents = readFileSync(join(fixture, ".env.local"), "utf8");
    const values = parse(contents);
    const secrets = [values.DASHBOARD_PASSWORD, values.APP_SECRET, values.API_KEY, values.CRON_SECRET];
    assert.equal(new Set(secrets).size, 4);
    for (const value of secrets) {
      assert.ok(value.length >= 32);
      assert.ok(!(first.stdout + first.stderr).includes(value));
    }
    assert.equal(run("setup.mjs").status, 1);
    assert.equal(readFileSync(join(fixture, ".env.local"), "utf8"), contents);
    assert.equal(run("check-env.mjs").status, 1);
    const valid = run("check-env.mjs", { DATABASE_URL: "postgresql://test:fictional@localhost:5432/test" });
    assert.equal(valid.status, 0, valid.stderr);
    for (const value of secrets) assert.ok(!(valid.stdout + valid.stderr).includes(value));
    assert.equal(run("check-env.mjs", { DATABASE_URL: "not-a-url" }).status, 1);
    assert.equal(run("check-env.mjs", { DATABASE_URL: "postgresql://localhost/test", APP_URL: "http://public.example.com" }).status, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
