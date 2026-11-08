import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { normalizeBulkTable, parseBulkFile } from "./bulk-import";
import { prepareBulkRows, renderBulkTemplate } from "./bulk-template";

test("bulk CSV import handles BOM, quoted cells, normalized columns and duplicate recipients", async () => {
  const imported = await parseBulkFile("contacts.csv", Buffer.from('\uFEFFEmail Address,First Name,Company\r\nALEX@example.com,"Alex, A",Example\r\nalex@example.com,Alex,Example\r\ninvalid,Sam,Other'));
  assert.deepEqual(imported.columns, ["email_address", "first_name", "company"]);
  const rows = prepareBulkRows(imported.rows, "email_address", "Hello {{first_name}}", "About {{company}}");
  assert.equal(rows[0].to, "alex@example.com");
  assert.equal(rows[0].subject, "Hello Alex, A");
  assert.match(rows[1].error!, /Duplicate/);
  assert.match(rows[2].error!, /Invalid/);
});

test("bulk XLSX import reads a real workbook's first worksheet", async () => {
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Email</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>alex@example.com</t></is></c><c r="B2" t="inlineStr"><is><t>Alex</t></is></c></row></sheetData></worksheet>',
  };
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([path, xml]) => [path, strToU8(xml)])));
  const result = await parseBulkFile("contacts.xlsx", Buffer.from(archive));
  assert.deepEqual(result.rows, [{ email: "alex@example.com", name: "Alex" }]);
});

test("bulk imports reject ambiguous headers, large files and unsupported formats", async () => {
  assert.throws(() => normalizeBulkTable([["First name", "first_name"], ["A", "B"]]), /unique/);
  assert.throws(() => normalizeBulkTable([["constructor"], ["A"]]), /named columns/);
  assert.throws(() => normalizeBulkTable([["email"], ["alex@example.com", "unexpected"]]), /more cells/);
  await assert.rejects(parseBulkFile("contacts.xls", Buffer.from("test")), /xlsx/);
  await assert.rejects(parseBulkFile("contacts.csv", Buffer.alloc(1024 * 1024 + 1)), /1 MiB/);
});

test("bulk variables are literal substitutions and reject missing data and header injection", () => {
  assert.equal(renderBulkTemplate("Hello {{ name }}", { name: "<Alex & Co>" }), "Hello <Alex & Co>");
  assert.throws(() => renderBulkTemplate("{{unknown}}", { name: "Alex" }), /Missing/);
  assert.throws(() => renderBulkTemplate("{{ name", { name: "Alex" }), /matching column/);
  const rows = prepareBulkRows([{ email: "alex@example.com", name: "Alex\r\nBcc: other@example.com" }], "email", "Hi {{name}}", "Hello");
  assert.match(rows[0].error!, /one line/);
});
