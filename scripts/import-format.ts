import { z } from "zod";
import { applicationInput, headerText, mailAddress, shortText } from "../src/lib/validation";

const externalId = z.string().min(1).max(200);
export const importInput = z.object({
  version: z.literal(1),
  applications: z.array(applicationInput.extend({ id: externalId, status: applicationInput.shape.status.default("researching") }).strict()).max(10000).default([]),
  messages: z.array(z.object({
    id: externalId, toEmail: mailAddress, toName: headerText.nullish(),
    subject: headerText.default(""), bodyText: z.string().max(1000000).nullish(),
    sentAt: z.iso.datetime({ offset: true }),
    status: z.enum(["sent", "failed", "bounced"]).default("sent"),
    applicationId: externalId.optional(), followUpOf: externalId.optional(),
    messageIdHeader: headerText.nullish(), template: shortText.nullish(),
  }).strict()).max(10000).default([]),
}).strict().superRefine((data, ctx) => {
  const appIds = new Set(data.applications.map((item) => item.id));
  const messageIds = new Set(data.messages.map((item) => item.id));
  if (appIds.size !== data.applications.length || messageIds.size !== data.messages.length) {
    ctx.addIssue({ code: "custom", message: "IDs must be unique within each collection" });
  }
  data.messages.forEach((item, index) => {
    if (item.applicationId && !appIds.has(item.applicationId)) ctx.addIssue({ code: "custom", path: ["messages", index, "applicationId"], message: "Unknown application ID" });
    if (item.followUpOf && (!messageIds.has(item.followUpOf) || item.followUpOf === item.id)) ctx.addIssue({ code: "custom", path: ["messages", index, "followUpOf"], message: "Unknown or self-referencing parent ID" });
  });
  const parents = new Map(data.messages.map((item) => [item.id, item.followUpOf]));
  const done = new Set<string>();
  for (const item of data.messages) {
    const chain = new Set<string>();
    let cursor: string | undefined = item.id;
    while (cursor && !done.has(cursor)) {
      if (chain.has(cursor)) { ctx.addIssue({ code: "custom", message: "Follow-up chains cannot contain cycles" }); break; }
      chain.add(cursor);
      cursor = parents.get(cursor);
    }
    for (const id of chain) done.add(id);
  }
});
