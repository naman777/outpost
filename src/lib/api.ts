import { z } from "zod";
import { checkBearer } from "./session";
import { headerText, mailAddress, shortText } from "./validation";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Bound the stream as well as Content-Length; chunked requests can omit that header. */
export async function readTextBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<{ text: string } | { error: Response }> {
  const reader = req.body?.getReader();
  if (!reader) return { error: Response.json({ error: "JSON body required" }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { error: Response.json({ error: "Request body too large" }, { status: 413 }) };
      }
      chunks.push(value);
    }
    return { text: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return { error: Response.json({ error: "invalid body" }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(req: Request): Promise<{ body: unknown } | { error: Response }> {
  const result = await readTextBody(req);
  if ("error" in result) return result;
  try { return { body: JSON.parse(result.text) }; }
  catch { return { error: Response.json({ error: "invalid JSON" }, { status: 400 }) }; }
}

export const unauthorized = () =>
  Response.json({ error: "unauthorized: send Authorization: Bearer <API_KEY>" }, { status: 401 });
export const apiAuthorized = (req: Request) => checkBearer(req.headers.get("authorization"), process.env.API_KEY);

export const messageInput = z.object({
  to: mailAddress,
  toName: headerText.nullish(),
  subject: headerText.default(""),
  text: z.string().max(1000000).nullish(),
  html: z.string().max(1000000).nullish(),
  from: mailAddress.nullish(),
  template: shortText.nullish(),
  variant: shortText.nullish(),
  trackOpens: z.boolean().default(true),
  trackClicks: z.boolean().default(false),
  applicationId: z.string().uuid().nullish(),
  company: shortText.nullish(),
  followUpOf: z.string().uuid().nullish(),
  hasAttachment: z.boolean().default(false),
});

export async function parse<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const input = await readJsonBody(req);
  if ("error" in input) return input;
  const r = schema.safeParse(input.body);
  if (!r.success) return { error: Response.json({ error: "invalid body", issues: r.error.issues }, { status: 400 }) };
  const d = r.data as { text?: string | null; html?: string | null };
  if (!d.text && !d.html) return { error: Response.json({ error: "text or html is required" }, { status: 400 }) };
  return { data: r.data };
}
