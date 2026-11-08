import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Uses a disposable mailbox and intercepted sends: never contacts an email provider. */
export async function checkBulkBrowser({ origin, cookie }) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const separator = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin }]);
    const requests = [];
    let stopAtLimit = true;
    await context.route("**/api/bulk/send", async (route) => {
      const body = route.request().postDataJSON(); requests.push(body);
      assert.equal(body.attachments[0].filename, "resume.txt");
      assert.equal(Buffer.from(body.attachments[0].contentBase64, "base64").toString(), "Fictional shared attachment");
      assert.equal(body.trackClicks, true);
      if (body.to === "sam@example.com" && stopAtLimit) await route.fulfill({ status: 429, json: { error: "Daily limit reached (fixture)." } });
      else await route.fulfill({ status: 201, json: { id: body.requestId, status: "sent" } });
    });
    const page = await context.newPage();
    await page.goto(origin + "/bulk");
    await page.getByLabel("Excel (.xlsx) or CSV file").setInputFiles({ name: "recipients.csv", mimeType: "text/csv", buffer: Buffer.from("email,name,company\nalex@example.com,Alex,Example\nsam@example.com,Sam,Sample\nalex@example.com,Duplicate,Example") });
    await page.getByRole("button", { name: "Import recipients", exact: true }).click();
    await page.getByLabel("Subject", { exact: true }).fill("Hello {{name}}");
    await page.getByLabel("Body (plain text)").fill("Hi {{name}} at {{company}}. My work: https://example.com");
    await page.getByLabel("Shared attachments").setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("Fictional shared attachment") });
    await page.getByLabel("Track link clicks").check();
    await page.getByRole("button", { name: "Review personalized emails", exact: true }).click();
    await page.getByRole("heading", { name: "Personalized preview" }).waitFor();
    assert.ok(await page.getByText("Hello Alex", { exact: true }).count());
    await page.getByRole("button", { name: "sam@example.com", exact: true }).click();
    assert.ok(await page.getByText("Hello Sam", { exact: true }).count());
    await page.getByRole("button", { name: "Send 2 emails", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Daily limit reached" }).waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].subject, "Hello Alex");
    assert.equal(requests[1].subject, "Hello Sam");
    stopAtLimit = false;
    await page.getByRole("button", { name: "Send 1 email", exact: true }).click();
    await page.getByRole("button", { name: "Send 0 emails", exact: true }).waitFor();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].requestId, requests[1].requestId);
    assert.equal(requests.filter((request) => request.to === "alex@example.com").length, 1);
    console.log("Passed: browser CSV import, personalized previews, shared attachments, duplicate exclusion, limit stop and remaining-only sends (mocked).");
  } finally { await browser.close(); }
}
