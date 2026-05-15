import { formatDateKey } from "./month";

interface LunarDate {
  month: number;
  day: number;
}

interface BaseHoliday {
  dateKey: string;
  label: string;
  substituteOnWeekend: "sat-sun" | "sun-only" | "none";
  substituteOnOverlap: boolean;
}

export interface KoreanHolidayInfo {
  label: string;
  isSubstitute: boolean;
}

const holidayCache = new Map<number, Map<string, KoreanHolidayInfo>>();

const chineseCalendarFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-chinese",
  {
    month: "numeric",
    day: "numeric",
  },
);

export function getKstWeekday(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getKoreanHolidayInfo(
  dateKey: string,
): KoreanHolidayInfo | null {
  const { year } = parseDateKey(dateKey);
  return buildHolidayMap(year).get(dateKey) ?? null;
}

function buildHolidayMap(year: number): Map<string, KoreanHolidayInfo> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const baseHolidays = getBaseHolidays(year);
  const baseByDate = new Map<string, BaseHoliday[]>();
  for (const holiday of baseHolidays) {
    const list = baseByDate.get(holiday.dateKey) ?? [];
    list.push(holiday);
    baseByDate.set(holiday.dateKey, list);
  }

  const holidayMap = new Map<string, KoreanHolidayInfo>();
  for (const [dateKey, holidays] of baseByDate) {
    holidayMap.set(dateKey, {
      label: holidays.map((holiday) => holiday.label).join(" / "),
      isSubstitute: false,
    });
  }

  const blockedDates = new Set(baseByDate.keys());
  for (const holiday of baseHolidays) {
    const weekday = getKstWeekday(holiday.dateKey);
    const isSaturday = weekday === 6;
    const isSunday = weekday === 0;
    const overlapsOtherHoliday =
      !isSaturday && !isSunday && (baseByDate.get(holiday.dateKey)?.length ?? 0) > 1;

    const needsWeekendSubstitute =
      holiday.substituteOnWeekend === "sat-sun"
        ? isSaturday || isSunday
        : holiday.substituteOnWeekend === "sun-only" && isSunday;
    const needsOverlapSubstitute =
      holiday.substituteOnOverlap && overlapsOtherHoliday;

    if (!needsWeekendSubstitute && !needsOverlapSubstitute) continue;

    const substituteDate = findNextSubstituteDate(
      holiday.dateKey,
      blockedDates,
    );
    holidayMap.set(substituteDate, {
      label: "대체공휴일",
      isSubstitute: true,
    });
    blockedDates.add(substituteDate);
  }

  holidayCache.set(year, holidayMap);
  return holidayMap;
}

function getBaseHolidays(year: number): BaseHoliday[] {
  const holidays: BaseHoliday[] = [
    solarHoliday(year, 1, 1, "신정", "none", false),
    solarHoliday(year, 3, 1, "삼일절", "sat-sun", true),
    solarHoliday(year, 5, 5, "어린이날", "sat-sun", true),
    solarHoliday(year, 6, 6, "현충일", "none", false),
    solarHoliday(year, 8, 15, "광복절", "sat-sun", true),
    solarHoliday(year, 10, 3, "개천절", "sat-sun", true),
    solarHoliday(year, 10, 9, "한글날", "sat-sun", true),
    solarHoliday(year, 12, 25, "성탄절", "sat-sun", true),
  ];

  if (year >= 2026) {
    holidays.push(solarHoliday(year, 5, 1, "노동절", "sat-sun", true));
  }
  if (year === 2026) {
    holidays.push(solarHoliday(year, 6, 3, "전국동시지방선거", "none", false));
  }

  forEachDateOfYear(year, (dateKey) => {
    const lunar = getLunarDate(dateKey);
    const nextLunar = getLunarDate(addDays(dateKey, 1));

    if (lunar.month === 12 && nextLunar.month === 1 && nextLunar.day === 1) {
      holidays.push(lunarHoliday(dateKey, "설날 연휴", "sun-only", true));
    }
    if (lunar.month === 1 && lunar.day === 1) {
      holidays.push(lunarHoliday(dateKey, "설날", "sun-only", true));
    }
    if (lunar.month === 1 && lunar.day === 2) {
      holidays.push(lunarHoliday(dateKey, "설날 연휴", "sun-only", true));
    }
    if (lunar.month === 4 && lunar.day === 8) {
      holidays.push(
        lunarHoliday(dateKey, "부처님오신날", "sat-sun", true),
      );
    }
    if (lunar.month === 8 && lunar.day === 14) {
      holidays.push(lunarHoliday(dateKey, "추석 연휴", "sun-only", true));
    }
    if (lunar.month === 8 && lunar.day === 15) {
      holidays.push(lunarHoliday(dateKey, "추석", "sun-only", true));
    }
    if (lunar.month === 8 && lunar.day === 16) {
      holidays.push(lunarHoliday(dateKey, "추석 연휴", "sun-only", true));
    }
  });

  return holidays;
}

function solarHoliday(
  year: number,
  month: number,
  day: number,
  label: string,
  substituteOnWeekend: BaseHoliday["substituteOnWeekend"],
  substituteOnOverlap: boolean,
): BaseHoliday {
  return {
    dateKey: formatDateKey(year, month, day),
    label,
    substituteOnWeekend,
    substituteOnOverlap,
  };
}

function lunarHoliday(
  dateKey: string,
  label: string,
  substituteOnWeekend: BaseHoliday["substituteOnWeekend"],
  substituteOnOverlap: boolean,
): BaseHoliday {
  return { dateKey, label, substituteOnWeekend, substituteOnOverlap };
}

function getLunarDate(dateKey: string): LunarDate {
  const { year, month, day } = parseDateKey(dateKey);
  const parts = chineseCalendarFormatter.formatToParts(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function findNextSubstituteDate(
  dateKey: string,
  blockedDates: Set<string>,
): string {
  let nextDate = addDays(dateKey, 1);
  while (isWeekend(nextDate) || blockedDates.has(nextDate)) {
    nextDate = addDays(nextDate, 1);
  }
  return nextDate;
}

function forEachDateOfYear(
  year: number,
  callback: (dateKey: string) => void,
) {
  const daysInYear = isLeapYear(year) ? 366 : 365;
  let dateKey = formatDateKey(year, 1, 1);
  for (let i = 0; i < daysInYear; i += 1) {
    callback(dateKey);
    dateKey = addDays(dateKey, 1);
  }
}

function addDays(dateKey: string, delta: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return formatDateKey(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

function isWeekend(dateKey: string): boolean {
  const weekday = getKstWeekday(dateKey);
  return weekday === 0 || weekday === 6;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}
