/**
 * Pure value helpers for Excel generation.
 *
 * Extracted from the generate route so they can be tested directly. Everything
 * here ends up in a spreadsheet submitted to CBP or the Coast Guard, so the
 * bias throughout is: a missing cell is recoverable, a confidently wrong cell
 * is not.
 */

/** Convert a column letter to a 1-based index (A=1, Z=26, AA=27). */
export function colLetterToNumber(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + col.charCodeAt(i) - 64;
  }
  return result;
}

/**
 * Resolve a dotted path against the data context.
 *
 * OCR represents dates as { day, month, year } rather than strings. Naively
 * stringifying that yields "[object Object]", which would be written verbatim
 * into a government filing, so date-shaped objects collapse to YYYY-MM-DD.
 */
export function getValue(
  data: Record<string, unknown>,
  path: string,
): string | undefined {
  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) return undefined;

  if (typeof current === 'object') {
    const parts_ = current as Record<string, unknown>;
    const looksLikeDate =
      'year' in parts_ || 'month' in parts_ || 'day' in parts_;

    if (!looksLikeDate) {
      // Anything else would stringify to "[object Object]".
      return undefined;
    }

    const year = String(parts_.year ?? '').trim();
    const month = String(parts_.month ?? '').trim();
    const day = String(parts_.day ?? '').trim();

    // A partial date is worse than an empty cell: NVMC would accept a
    // plausible-looking wrong date, but flags a missing required one.
    if (!year || !month || !day) return undefined;

    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return String(current);
}

/**
 * Reformat a date string.
 *
 * YYYY-MM-DD is split textually rather than parsed through Date:
 * `new Date('1985-03-12')` is interpreted as UTC midnight but read back in
 * local time, so getDate() returns the 11th anywhere west of Greenwich — a
 * silent off-by-one on every date in the workbook.
 */
export function formatDate(dateStr: string | undefined, format?: string): string {
  if (!dateStr) return '';

  let year: string;
  let month: string;
  let day: string;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (iso) {
    [, year, month, day] = iso;
  } else {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      // Leave it visibly wrong rather than reformat it into something that
      // looks deliberate.
      return dateStr;
    }
    year = String(parsed.getFullYear());
    month = String(parsed.getMonth() + 1).padStart(2, '0');
    day = String(parsed.getDate()).padStart(2, '0');
  }

  if (!format) return `${year}-${month}-${day}`;

  return format
    .replace('YYYY', year)
    .replace('YY', year.slice(-2))
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * Apply a value translation, e.g. { "M": "Male" }.
 *
 * Also used to resolve the workbook's *_CODE columns: those are VLOOKUP
 * formulas whose cached values are empty in the blank template, so each code
 * column is configured as a second mapping over the same source with a
 * valueMap built from the NVMC lookup tables.
 */
export function applyValueMap(
  value: string | undefined,
  valueMap?: Record<string, string>,
): string {
  if (!value) return '';
  if (!valueMap) return value;
  return valueMap[value] ?? value;
}
