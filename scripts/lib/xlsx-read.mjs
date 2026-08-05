/**
 * Minimal read-only .xlsx reader.
 *
 * Shared by the reference-data extraction scripts. Deliberately dependency-free
 * so provisioning can run without pulling a spreadsheet library into scripts/
 * (the app itself uses ExcelJS at request time).
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Read the entries of a zip container into a Map of name -> Buffer. */
export function readZipEntries(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // The local header carries its own name/extra lengths; the central
    // directory's extra length is not reusable here.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

export function parseSharedStrings(xml) {
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    let t;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(m[1]))) text += t[1];
    out.push(unescapeXml(text));
  }
  return out;
}

/**
 * Open a workbook and return helpers for reading it.
 *
 * Sheets are resolved by name through workbook.xml + rels rather than by
 * assuming a sheetN.xml filename, because those do not correspond.
 */
export function openWorkbook(path) {
  const entries = readZipEntries(readFileSync(path));
  const workbookXml = entries.get('xl/workbook.xml').toString('utf8');
  const relsXml = entries.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const ssEntry = entries.get('xl/sharedStrings.xml');
  const strings = ssEntry ? parseSharedStrings(ssEntry.toString('utf8')) : [];

  const sheetNames = [...workbookXml.matchAll(/<sheet[^>]*\/>/g)]
    .map((m) => m[0])
    .map((tag) => ({
      name: /name="([^"]+)"/.exec(tag)?.[1],
      rid: /r:id="([^"]+)"/.exec(tag)?.[1],
    }));

  function sheetXml(name) {
    const entry = sheetNames.find((s) => s.name === name);
    if (!entry) {
      throw new Error(
        `no sheet named "${name}" (have: ${sheetNames.map((s) => s.name).join(', ')})`,
      );
    }
    const target = new RegExp(`Id="${entry.rid}"[^>]*Target="([^"]+)"`).exec(relsXml)[1];
    const key = `xl/${target.replace(/^\/?xl\//, '')}`;
    return entries.get(key).toString('utf8');
  }

  /** Read a whole column as a Map of rowNumber -> string value. */
  function readColumn(name, col) {
    const xml = sheetXml(name);
    const out = new Map();
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(xml))) {
      const [, c, row, attrs, inner] = m;
      if (c !== col || !inner) continue;
      let value;
      if (/t="s"/.test(attrs)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (!v) continue;
        value = strings[Number(v[1])];
      } else if (/t="inlineStr"/.test(attrs)) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        value = t ? unescapeXml(t[1]) : undefined;
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = v ? unescapeXml(v[1]) : undefined;
      }
      if (value !== undefined && value !== '') out.set(Number(row), value);
    }
    return out;
  }

  return { entries, strings, sheetNames, sheetXml, readColumn };
}
