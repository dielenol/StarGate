const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateKeyParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateKey(dateKey: string): DateKeyParts | null {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidDateKey(dateKey: string): boolean {
  return parseDateKey(dateKey) !== null;
}

export function yearMonthFromDateKey(
  dateKey: string,
): { year: number; month: number } | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return { year: parsed.year, month: parsed.month };
}

export function isDateKeyBefore(dateKey: string, minDateKey: string): boolean {
  if (!isValidDateKey(dateKey) || !isValidDateKey(minDateKey)) return false;
  return dateKey < minDateKey;
}
