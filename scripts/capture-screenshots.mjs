/** Used only by the disposable smoke fixture; never connects to an operator's database. */
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

export async function captureScreenshots({ pg, origin, cookie }) {
  // Replace assertion fixtures with readable, entirely fictional presentation data.
  await pg.exec("truncate messages, applications cascade");
  const companies = ["Cedar Labs", "Northstar Studio", "Harbor Systems", "Maple Works", "Juniper Software", "Atlas Research", "Willow Digital", "Birch Studio"];
  const stages = ["replied", "interviewing", "emailed", "emailed", "emailed", "emailed", "researching", "emailed"];
  for (const [index, company] of companies.entries()) {
    const { rows: [application] } = await pg.query(
      `insert into applications (company, role, contact_name, contact_email, status, notes)
       values ($1, 'Software Engineer', $2, $3, $4, 'Fictional screenshot fixture; no real contact or mailbox.') returning id`,
      [company, `Example Contact ${index + 1}`, `contact${index + 1}@example.com`, stages[index]],
    );
    if (stages[index] === "researching") continue;
    const opened = index < 5;
    const replied = index < 2;
    const { rows: [message] } = await pg.query(
      `insert into messages (tracking_id, application_id, channel, from_email, to_email, subject,
         body_text, sent_at, open_count, raw_open_count, open_confidence, open_sources,
         open_context_count, engagement_level, first_opened_at, last_opened_at, replied_at, reply_snippet)
       values ($1, $2, 'api', 'sender@example.com', $3, $4,
         'Hello, I would love to learn more about your engineering team. This is fictional example data.',
         now() - ($5::int * interval '1 day'), $6, $6, $7, $8::jsonb, $6, $9,
         case when $6 = 1 then now() - ($5::int * interval '1 day') + interval '1 hour' end,
         case when $6 = 1 then now() - ($5::int * interval '1 day') + interval '1 hour' end,
         case when $10::boolean then now() - ($5::int * interval '1 day') + interval '2 hours' end,
         case when $10::boolean then 'Thanks for reaching out. Let us arrange a conversation.' end) returning id`,
      [randomBytes(24).toString("hex"), application.id, `contact${index + 1}@example.com`,
        `Exploring engineering opportunities at ${company}`, index + 1, opened ? 1 : 0,
        opened ? "medium" : "none", JSON.stringify(opened ? ["gmail_proxy"] : []),
        replied ? "confirmed" : opened ? "possible" : "none", replied],
    );
    if (opened) await pg.query(
      `insert into opens (message_id, at, source, is_human, confidence, counted, reason)
       select id, first_opened_at, 'gmail_proxy', true, 'medium', true, 'Fictional screenshot fixture' from messages where id = $1`,
      [message.id],
    );
  }
  await mkdir("docs/screenshots", { recursive: true });
  await pg.query("insert into accounts (label,email,kind) values ('Example mailbox','sender@example.com','smtp')");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    const separator = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin }]);
    // Screenshots must never fetch external content embedded in a message.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const [name, path] of [["overview", "/"], ["applications", "/applications"], ["messages", "/messages"], ["bulk", "/bulk"], ["compose", "/compose"], ["settings", "/settings"], ["login", "/login"]]) {
      await page.goto(origin + path, { waitUntil: "networkidle" });
      if (path !== "/login") await page.getByRole("navigation", { name: "Dashboard" }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true, animations: "disabled" });
    }
    await page.evaluate(() => localStorage.setItem("mp-theme", "dark"));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.screenshot({ path: "docs/screenshots/overview-dark.png", fullPage: true, animations: "disabled" });
    await page.evaluate(() => localStorage.setItem("mp-theme", "light"));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, path] of [["overview", "/"], ["messages", "/messages"], ["bulk", "/bulk"], ["login", "/login"]]) {
      await page.goto(origin + path, { waitUntil: "networkidle" });
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflows) throw new Error(`Horizontal overflow on mobile ${path}`);
      await page.screenshot({ path: `docs/screenshots/${name}-mobile.png`, fullPage: true, animations: "disabled" });
    }
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("navigation", { name: "Dashboard" }).waitFor();
    await page.getByRole("link", { name: "Bulk mail", exact: true }).click();
    await page.getByRole("heading", { name: "Bulk mail", exact: true }).waitFor();
    if (await page.getByRole("button", { name: "Open navigation", exact: true }).count() !== 1) throw new Error("Mobile navigation did not close after selection");
    console.log("Captured desktop, mobile and dark-mode screens; mobile navigation and overflow checks passed with fictional data only.");
  } finally {
    await browser.close();
  }
}
