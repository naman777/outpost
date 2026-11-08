"use server";

import { requireDashboardSession } from "@/lib/auth";
import { parseBulkFile } from "@/lib/bulk-import";
import type { BulkRow } from "@/lib/bulk-template";

export type BulkImportState = { columns?: string[]; rows?: BulkRow[]; error?: string };

export async function importBulkFile(_previous: BulkImportState, form: FormData): Promise<BulkImportState> {
  await requireDashboardSession();
  const file = form.get("recipients");
  if (!(file instanceof File) || !file.size || file.size > 1024 * 1024) return { error: "Choose a .xlsx or .csv file no larger than 1 MiB." };
  try { return await parseBulkFile(file.name, Buffer.from(await file.arrayBuffer())); }
  catch (error) { return { error: error instanceof Error ? error.message : "Could not read this spreadsheet." }; }
}
