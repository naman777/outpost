import { z } from "zod";

export const MAX_BULK_ROWS = 1000;
export type BulkRow = Record<string, string>;
export type PreparedRecipient = { row: number; to: string; subject: string; text: string; error?: string };

export function renderBulkTemplate(template: string, row: BulkRow): string {
  const rendered = template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(row, key) || !row[key].trim()) throw new Error(`Missing value for {{${key}}}`);
    return row[key];
  });
  if (/\{\{|\}\}/.test(rendered)) throw new Error("Use variables like {{name}} with a matching column name.");
  return rendered;
}

export function prepareBulkRows(rows: BulkRow[], emailColumn: string, subject: string, body: string): PreparedRecipient[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const to = (row[emailColumn] || "").trim().toLowerCase();
    try {
      if (!z.string().max(254).email().safeParse(to).success) throw new Error("Invalid or missing email address");
      if (seen.has(to)) throw new Error("Duplicate email address");
      const renderedSubject = renderBulkTemplate(subject, row).trim();
      const text = renderBulkTemplate(body, row).trim();
      if (!renderedSubject || renderedSubject.length > 998 || /[\r\n]/.test(renderedSubject)) throw new Error("Subject must be one line, between 1 and 998 characters");
      if (!text || text.length > 100000) throw new Error("Body must be between 1 and 100,000 characters");
      seen.add(to);
      return { row: index + 2, to, subject: renderedSubject, text };
    } catch (error) {
      return { row: index + 2, to, subject: "", text: "", error: (error as Error).message };
    }
  });
}
