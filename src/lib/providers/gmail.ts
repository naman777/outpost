import { appUrl } from "../tracking";

/**
 * Minimal Gmail API client over fetch (no googleapis dependency).
 * Scopes: send mail, read mail (to find replies and bounces), and the address of the account.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${appUrl()}/api/auth/google/callback`;

export function authUrl(state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email as string) : null;
  return { refreshToken: t.refresh_token, email };
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessToken(refreshToken: string): Promise<string> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  tokenCache.set(refreshToken, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

export type GmailHeader = { name: string; value: string };
export type GmailPart = { mimeType: string; body?: { data?: string }; parts?: GmailPart[]; headers?: GmailHeader[] };
export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers: GmailHeader[] };
};

export class GmailClient {
  constructor(private refreshToken: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken(this.refreshToken)}`, "Content-Type": "application/json", ...init?.headers },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${json?.error?.message ?? "request failed"}`);
    return json as T;
  }

  sendRaw(mime: Buffer, threadId?: string | null) {
    return this.call<{ id: string; threadId: string }>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: mime.toString("base64url"), ...(threadId && { threadId }) }),
    });
  }

  getMessage(id: string, format: "metadata" | "full" = "metadata") {
    const q = format === "metadata" ? "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID" : "format=full";
    return this.call<GmailMessage>(`/messages/${id}?${q}`);
  }

  getThread(id: string) {
    return this.call<{ id: string; messages: GmailMessage[] }>(
      `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
    );
  }

  async search(q: string, max = 100): Promise<string[]> {
    const r = await this.call<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
    return r.messages?.map((m) => m.id) ?? [];
  }
}

export const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** All text in a message, decoded (used to find our Message-ID inside bounce reports). */
export function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const own = part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  const headers = part.headers?.map((h) => `${h.name}: ${h.value}`).join("\n") ?? "";
  return [headers, own, ...(part.parts ?? []).map(bodyText)].join("\n");
}
