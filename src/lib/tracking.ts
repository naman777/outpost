import { randomId } from "./crypto";
import { isIP } from "node:net";

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const pixelUrl = (trackingId: string) => `${appUrl()}/t/o/${trackingId}.gif`;
export const clickUrl = (linkId: string) => `${appUrl()}/t/c/${linkId}`;

export function pixelHtml(trackingId: string): string {
  return `<img src="${pixelUrl(trackingId)}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;margin:0;padding:0;" />`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text → simple HTML: paragraphs on blank lines, <br> on single newlines, bare URLs become links. */
export function textToHtml(text: string): string {
  const linkify = (s: string) =>
    esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}">${u}</a>`);
  const paras = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${paras
    .map((p) => `<p style="margin:0 0 12px">${linkify(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href, label) =>
      label.replace(/<[^>]+>/g, "") === href ? href : `${label} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const wordCount = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

/** Appends the pixel unless open tracking is explicitly disabled. */
export function injectPixel(html: string, trackingId: string, trackOpens = true): string {
  if (!trackOpens) return html;
  const img = pixelHtml(trackingId);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${img}</body>`) : html + img;
}

export type RewrittenLink = { id: string; url: string; position: number };

/** Rewrites every http(s) href to the click redirect. mailto:, tel: and anchors are left alone. */
export function rewriteLinks(html: string): { html: string; links: RewrittenLink[] } {
  const links: RewrittenLink[] = [];
  const out = html.replace(/(<a\b[^>]*?\bhref=)(["'])(https?:\/\/[^"']+)\2/gi, (_m, pre, q, url: string) => {
    const id = randomId(12);
    links.push({ id, url: url.replace(/&amp;/g, "&"), position: links.length });
    return `${pre}${q}${clickUrl(id)}${q}`;
  });
  return { html: out, links };
}

export type OpenSource = "gmail_proxy" | "yahoo_proxy" | "apple" | "outlook" | "client" | "bot" | "self";

const BOT_UA =
  /bot|crawl|spider|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|headless|phantom|preview|scanner|barracuda|mimecast|proofpoint|symantec|forcepoint|trendmicro|sophos|messagelabs|safelinks|urldefense|microsoft-?office-?protection|libwww|httpclient|GoogleWebPreview|ZoomInfo|Hubspot|Marketo|Pardot|Salesforce|Fastly|AmazonSES|Postfix|Sendgrid|Mailgun|SparkPost|Mandrill|MailChimp|Litmus|EmailOnAcid|ReturnPath/i;

/** Google's crawler / mail-scanning range 66.249.64.0/19 (the Gmail image proxy uses it too). */
const isGoogleIp = (ip: string | null) => {
  const m = ip?.match(/^66\.249\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 64 && Number(m[1]) <= 95);
};

export type Confidence = "high" | "medium" | "low" | "none";

export type Classified = { source: OpenSource; isHuman: boolean; confidence: Confidence; reason: string | null };

export type HitOptions = {
  userAgent: string;
  ip: string | null;
  hasSelfCookie: boolean;
  selfIps: string[];
  secondsSinceSend: number | null;
  graceSeconds: number;
  secondsSinceFirstAppleHit?: number | null;
  accept?: string | null;
  hasAcceptLanguage?: boolean;
  isPrefetch?: boolean;
};

function identifySource(ua: string, ip: string | null): OpenSource {
  if (/GoogleImageProxy|ggpht\.com/i.test(ua)) return "gmail_proxy";
  if (/YahooMailProxy/i.test(ua)) return "yahoo_proxy";
  if (/Microsoft Outlook|ms-office|MSOffice|Outlook-iOS|Outlook-Android/i.test(ua)) return "outlook";
  if (ip?.startsWith("17.") || (/AppleWebKit/i.test(ua) && !/Safari|Chrome|Firefox|Edg/i.test(ua))) return "apple";
  return "client";
}

function excludedHit(opts: HitOptions): Classified | null {
  if (opts.hasSelfCookie) return { source: "self", isHuman: false, confidence: "none", reason: "loaded in your own browser" };
  if (opts.ip && opts.selfIps.includes(opts.ip)) return { source: "self", isHuman: false, confidence: "none", reason: "from an operator IP (shared networks can hide recipient activity)" };
  if (opts.isPrefetch) return { source: "bot", isHuman: false, confidence: "none", reason: "request explicitly marked as prefetch" };
  if (!opts.userAgent.trim() || BOT_UA.test(opts.userAgent)) return { source: "bot", isHuman: false, confidence: "none", reason: "missing or recognized automated user agent" };
  return null;
}

/** Confidence describes evidence for an estimated open, never proof of reading. */
export function classifyHit(opts: HitOptions): Classified {
  const excluded = excludedHit(opts);
  if (excluded) return excluded;
  const source = identifySource(opts.userAgent, opts.ip);
  if (source === "apple") {
    const repeated = opts.secondsSinceFirstAppleHit != null && opts.secondsSinceFirstAppleHit > 300;
    return { source, isHuman: false, confidence: repeated ? "low" : "none", reason: repeated
      ? "repeated Apple/proxy image load; timing cannot establish a re-open"
      : "possible Apple privacy load; reading cannot be determined" };
  }
  if (source !== "gmail_proxy" && isGoogleIp(opts.ip)) return { source, isHuman: false, confidence: "low", reason: "possible automated load from Google infrastructure" };
  if (opts.accept?.toLowerCase().includes("text/html")) return { source, isHuman: false, confidence: "low", reason: "HTML requested from an image endpoint; possible preview or scanner" };
  if (opts.secondsSinceSend != null && opts.secondsSinceSend < opts.graceSeconds) return { source, isHuman: false, confidence: "low", reason: `within ${opts.graceSeconds}s of sending; a quick read and prefetch cannot be distinguished` };
  // Missing Accept-Language alone is not evidence of automation: proxies often omit it.
  return { source, isHuman: true, confidence: "medium", reason: source === "gmail_proxy" || source === "yahoo_proxy"
    ? "proxy image request; estimated open, not a confirmed view"
    : "image request passed available filters; estimated open" };
}

/** A link request is evaluated independently of image-loading behavior. */
export function classifyClick(opts: HitOptions): Classified {
  const excluded = excludedHit(opts);
  if (excluded) return excluded;
  const source = identifySource(opts.userAgent, opts.ip);
  const navigation = opts.accept?.toLowerCase().includes("text/html") && opts.hasAcceptLanguage;
  if (source === "gmail_proxy" || source === "yahoo_proxy" || !navigation) {
    return { source, isHuman: false, confidence: "low", reason: "link fetch without browser-navigation evidence; may be automated" };
  }
  return { source, isHuman: true, confidence: "medium", reason: "browser-like link navigation; scanners and forwarded links remain possible" };
}

export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  const value = fwd?.split(",")[0].trim() || headers.get("x-real-ip") || "";
  return isIP(value) ? value : null;
}

/** 43-byte transparent GIF */
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
