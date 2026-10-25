export const ENGAGEMENT_LEVELS = ["confirmed", "likely", "possible", "unknown", "none"] as const;
export type EngagementLevel = typeof ENGAGEMENT_LEVELS[number];
export type EngagementEvidence = {
  openCount: number;
  clickCount: number;
  repliedAt: Date | string | null;
  rawOpenCount?: number;
  rawClickCount?: number;
  tracked: boolean;
  openSources?: string[] | null;
  openContextCount?: number;
};

export const ENGAGEMENT_LABEL: Record<EngagementLevel, string> = {
  confirmed: "Reply recorded", likely: "Likely activity", possible: "Possible activity",
  unknown: "Uncertain activity", none: "No signal",
};
export const OPEN_ACCURACY_NOTE = "Opens are estimated from image loads. Blocked images can hide reads, and automated loads can escape filtering. Counts are not people or confirmed reads.";

/** Keep reply evidence separate from pixels. Repeated proxy requests alone add no certainty. */
export function computeEngagement(msg: EngagementEvidence): { level: EngagementLevel; signals: string[] } {
  if (msg.repliedAt) return { level: "confirmed", signals: ["A reply was recorded; this is not a read receipt or a guarantee the reply was human-written."] };
  if (msg.clickCount > 0) return { level: "likely", signals: ["Filtered browser-like link activity; automated navigation or forwarding remains possible."] };
  const sources = [...new Set(msg.openSources ?? [])];
  if (msg.tracked && msg.openCount >= 2 && (sources.length >= 2 || (msg.openContextCount ?? 0) >= 2)) {
    return { level: "likely", signals: ["Estimated opens across multiple sources or non-proxy network contexts; these do not identify people or devices."] };
  }
  if (msg.tracked && msg.openCount > 0) return { level: "possible", signals: ["One or more image loads passed filtering; repeated loads alone do not confirm interest."] };
  if (!msg.tracked) return { level: "unknown", signals: ["Open tracking is disabled; absence of a pixel does not mean absence of reading."] };
  if ((msg.rawOpenCount ?? 0) > 0 || (msg.rawClickCount ?? 0) > 0) return { level: "unknown", signals: ["Only excluded or uncertain image/link loads have been observed."] };
  return { level: "none", signals: ["No image-load signal detected; images may be blocked or cached."] };
}
