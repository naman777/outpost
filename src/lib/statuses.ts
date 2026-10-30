/** Pipeline stages in order. Automatic updates only ever move an application forward. */
export const STATUSES = [
  "researching",
  "emailed",
  "opened",
  "replied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
  "closed",
] as const;
export type Status = (typeof STATUSES)[number];
