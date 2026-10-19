import { safeEqual, sign } from "./crypto";

export const SESSION_COOKIE = "mp_session";
/** Long-lived, cross-site cookie on the tracking domain so opens from your own browser are marked as yours. */
export const SELF_COOKIE = "mp_self";
const MAX_AGE_DAYS = 30;

export function createSessionToken(): string {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || password.length < 16) throw new Error("Set a DASHBOARD_PASSWORD of at least 16 characters.");
  const exp = Date.now() + MAX_AGE_DAYS * 864e5;
  const payload = `v2.${exp}`;
  return `${payload}.${sign(`${payload}:${password}`)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!token || token.length > 200 || !password || password.length < 16) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const exp = Number(payload.split(".")[1]);
  try {
    return /^v2\.\d+$/.test(payload) && Number.isFinite(exp) && exp > Date.now() && safeEqual(token.slice(i + 1), sign(`${payload}:${password}`));
  } catch {
    return false;
  }
}

export const sessionMaxAge = MAX_AGE_DAYS * 86400;

/** Bearer-token check for /api/v1 and cron routes. */
export function checkBearer(header: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  if (!header || !/^Bearer\s+\S+$/i.test(header)) return false;
  const token = header.replace(/^Bearer\s+/i, "");
  return token.length > 0 && safeEqual(token, expected);
}
