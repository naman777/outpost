import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";
import { MAX_BULK_ROWS, type BulkRow } from "./bulk-template";

export function normalizeBulkTable(table: unknown[][]): { columns: string[]; rows: BulkRow[] } {
  if (table.length < 2 || table.length > MAX_BULK_ROWS + 1) throw new Error(`Use a header row and 1–${MAX_BULK_ROWS} recipient rows.`);
  const columns = table[0].map((value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""));
  if (!columns.length || columns.length > 40 || columns.some((key) => !/^[a-z_][a-z0-9_]*$/.test(key) || ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Use 1–40 named columns, starting with a letter. Remove blank header cells.");
  if (new Set(columns).size !== columns.length) throw new Error("Column names must be unique after replacing spaces with underscores.");
  const rows = table.slice(1).map((values) => {
    if (values.length > columns.length) throw new Error("A row has more cells than the header.");
    return Object.fromEntries(columns.map((key, index) => {
      const value = values[index];
      const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim();
      if (text.length > 2000) throw new Error("Each cell may contain at most 2,000 characters.");
      return [key, text];
    }));
  });
  if (JSON.stringify(rows).length > 1024 * 1024) throw new Error("The imported data exceeds 1 MiB. Split the file into smaller batches.");
  return { columns, rows };
}

export async function parseBulkFile(filename: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("Upload an Excel or CSV file no larger than 1 MiB.");
  let table: unknown[][];
  if (/\.csv$/i.test(filename)) table = parse(bytes, { bom: true, skip_empty_lines: true, max_record_size: 100000 });
  else if (/\.xlsx$/i.test(filename)) table = await readSheet(bytes);
  else throw new Error("Choose a .xlsx or .csv file. Excel imports use the first worksheet.");
  return normalizeBulkTable(table);
}
