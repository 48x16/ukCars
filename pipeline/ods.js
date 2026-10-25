// Reads sheets of an OpenDocument spreadsheet (.ods) as rows of strings. Some DfT tables
// are only published as ODS. An .ods file is a zip holding content.xml, and the tables we read
// are plain grids, so a small reader does: no styles, formulas or merged-cell layout.

import { listEntries, openEntry } from './zip.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const MAX_REPEAT = 1000; // trailing empty cells are "repeated" thousands of times

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );

const attr = (tag, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : undefined;
};

/** Drops every tag, again and again until none is left (one pass can leave "<<b>x>" as "<x>"). */
function stripTags(s) {
  let before;
  do {
    before = s;
    s = s.replace(/<[^>]*>/g, '');
  } while (s !== before);
  return s;
}

/** A cell's text: paragraphs joined by newlines, <text:s/> as spaces, other markup dropped. */
function cellText(inner) {
  return decode(
    stripTags(
      inner
        .replace(/<text:s(?: text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(Number(n ?? 1)))
        .replace(/<text:tab\s*\/>/g, '\t')
        .replace(/<text:line-break\s*\/>/g, '\n')
        .replace(/<\/text:p>\s*<text:p[^>]*>/g, '\n'),
    ),
  );
}

/** Parses the rows of the named table in content.xml. Trailing empty cells and rows are dropped. */
export function parseSheet(xml, sheetName) {
  const start = xml.indexOf(`<table:table table:name="${sheetName}"`);
  if (start === -1) throw new Error(`No sheet named "${sheetName}"`);
  const end = xml.indexOf('</table:table>', start);
  const table = xml.slice(start, end);
  const rows = [];
  const rowRe = /<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g;
  const cellRe = /<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g;
  for (const [, rowAttrs, rowInner = ''] of table.matchAll(rowRe)) {
    const cells = [];
    for (const [, cellAttrs, cellInner = ''] of rowInner.matchAll(cellRe)) {
      const type = attr(cellAttrs, 'office:value-type');
      const value = type === 'float' || type === 'percentage' ? attr(cellAttrs, 'office:value') : cellText(cellInner);
      const repeat = Math.min(Number(attr(cellAttrs, 'table:number-columns-repeated') ?? 1), MAX_REPEAT);
      for (let i = 0; i < repeat; i++) cells.push(value ?? '');
    }
    while (cells.length && cells.at(-1) === '') cells.pop();
    const repeat = Math.min(Number(attr(rowAttrs, 'table:number-rows-repeated') ?? 1), MAX_REPEAT);
    for (let i = 0; i < repeat; i++) rows.push(cells);
  }
  while (rows.length && rows.at(-1).length === 0) rows.pop();
  return rows;
}

/**
 * Opens an .ods file once, for reading several sheets: `names` lists its sheets, in order, and
 * `sheet(name)` parses one.
 */
export async function readWorkbook(path) {
  const entry = (await listEntries(path)).find((e) => e.name === 'content.xml');
  if (!entry) throw new Error(`${path} is not an OpenDocument spreadsheet`);
  let xml = '';
  for await (const chunk of (await openEntry(path, entry)).setEncoding('utf8')) xml += chunk;
  const names = [...xml.matchAll(/<table:table table:name="([^"]*)"/g)].map((m) => decode(m[1]));
  return { names, sheet: (name) => parseSheet(xml, name) };
}

/** Reads a sheet from an .ods file on disk. */
export async function readSheet(path, sheetName) {
  return (await readWorkbook(path)).sheet(sheetName);
}
