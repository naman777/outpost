/** Real browser form submissions exercise Origin behavior that fetch-based checks cannot. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

export async function checkBrowserAuth({ origin, password }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/login`);
    await page.locator("#password").fill(password);
    const loginResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const login = await loginResponse;
    assert.equal((await login.request().allHeaders()).origin, origin, "Native login form must preserve its Origin");
    assert.equal(login.status(), 303, "Browser login must succeed");
    await page.getByRole("navigation", { name: "Dashboard" }).waitFor();

    const logoutResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/auth/logout" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    const logout = await logoutResponse;
    assert.equal((await logout.request().allHeaders()).origin, origin, "Native logout form must preserve its Origin");
    assert.equal(logout.status(), 303, "Browser logout must succeed");
    await page.locator("#password").waitFor();
    console.log("Passed: real Chromium form login and logout preserve Origin and complete successfully.");
  } finally {
    await browser.close();
  }
}
