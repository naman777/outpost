export function requestOrigin(req: Request): string {
  return new URL(process.env.APP_URL || req.url).origin;
}

export function sameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === requestOrigin(req);
  } catch {
    return false;
  }
}

/** Normalize before comparing: browsers treat backslashes as URL separators. */
export function safeNextPath(value: string, origin: string): string {
  if (!value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    return url.origin === new URL(origin).origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

export const LOGIN_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function loginLimitResult(value: { attempts: number; resetAt: number }, now = Date.now()) {
  return {
    allowed: value.attempts <= LOGIN_LIMIT,
    retryAfter: Math.max(1, Math.ceil((value.resetAt - now) / 1000)),
  };
}
