import { eachDayOfInterval, format, isAfter, parseISO, startOfDay } from 'date-fns';

export interface HolidayInfo {
  dateStr: string; // YYYY-MM-DD
  name: string;
  type: 'weekend' | 'thai_holiday';
}

// Fixed annual Thai public holidays (MM-DD) -> Thai Name
const FIXED_THAI_HOLIDAYS: Record<string, string> = {
  '01-01': 'วันขึ้นปีใหม่',
  '04-06': 'วันจักรี',
  '04-13': 'วันสงกรานต์',
  '04-14': 'วันสงกรานต์',
  '04-15': 'วันสงกรานต์',
  '05-01': 'วันแรงงานแห่งชาติ',
  '05-04': 'วันฉัตรมงคล',
  '06-03': 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี',
  '07-28': 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว',
  '08-12': 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง และวันแม่แห่งชาติ',
  '10-13': 'วันนวมินทรมหาราช',
  '10-23': 'วันปิยมหาราช',
  '12-05': 'วันคล้ายวันพระบรมราชสมภพ ร.9 และวันพ่อแห่งชาติ',
  '12-10': 'วันรัฐธรรมนูญ',
  '12-31': 'วันสิ้นปี',
};

// Year-specific Thai public holidays (Lunar Buddhist days, Royal Ploughing Day, Cabinet special holidays, and Official Substitute Holidays)
const YEAR_SPECIFIC_THAI_HOLIDAYS: Record<string, string> = {
  // 2024 (พ.ศ. 2567)
  '2024-02-24': 'วันมาฆบูชา',
  '2024-02-26': 'วันหยุดชดเชยวันมาฆบูชา',
  '2024-04-08': 'วันหยุดชดเชยวันจักรี',
  '2024-04-12': 'วันหยุดพิเศษเทศกาลสงกรานต์',
  '2024-04-16': 'วันหยุดชดเชยวันสงกรานต์',
  '2024-05-06': 'วันหยุดชดเชยวันฉัตรมงคล',
  '2024-05-10': 'วันพืชมงคล',
  '2024-05-22': 'วันวิสาขบูชา',
  '2024-07-20': 'วันอาสาฬหบูชา',
  '2024-07-21': 'วันเข้าพรรษา',
  '2024-07-22': 'วันหยุดชดเชยวันเข้าพรรษา',
  '2024-07-29': 'วันหยุดชดเชยวันเฉลิมพระชนมพรรษา ร.10',
  '2024-10-14': 'วันหยุดชดเชยวันนวมินทรมหาราช',
  '2024-12-30': 'วันหยุดพิเศษเทศกาลปีใหม่',

  // 2025 (พ.ศ. 2568)
  '2025-02-12': 'วันมาฆบูชา',
  '2025-04-07': 'วันหยุดชดเชยวันจักรี',
  '2025-04-16': 'วันหยุดชดเชยวันสงกรานต์',
  '2025-05-05': 'วันหยุดชดเชยวันฉัตรมงคล',
  '2025-05-09': 'วันพืชมงคล',
  '2025-05-11': 'วันวิสาขบูชา',
  '2025-05-12': 'วันหยุดชดเชยวันวิสาขบูชา',
  '2025-06-02': 'วันหยุดราชการกรณีพิเศษ',
  '2025-07-10': 'วันอาสาฬหบูชา',
  '2025-07-11': 'วันเข้าพรรษา',
  '2025-08-11': 'วันหยุดราชการกรณีพิเศษ',

  // 2026 (พ.ศ. 2569)
  '2026-01-02': 'วันหยุดพิเศษเทศกาลปีใหม่',
  '2026-03-03': 'วันมาฆบูชา',
  '2026-05-13': 'วันพืชมงคล',
  '2026-05-31': 'วันวิสาขบูชา',
  '2026-06-01': 'วันหยุดชดเชยวันวิสาขบูชา',
  '2026-07-29': 'วันอาสาฬหบูชา',
  '2026-07-30': 'วันเข้าพรรษา',
  '2026-12-07': 'วันหยุดชดเชยวันพ่อแห่งชาติ',

  // 2027 (พ.ศ. 2570)
  '2027-02-20': 'วันมาฆบูชา',
  '2027-02-22': 'วันหยุดชดเชยวันมาฆบูชา',
  '2027-05-03': 'วันหยุดชดเชยวันแรงงานแห่งชาติ',
  '2027-05-10': 'วันพืชมงคล',
  '2027-05-20': 'วันวิสาขบูชา',
  '2027-07-18': 'วันอาสาฬหบูชา',
  '2027-07-19': 'วันเข้าพรรษา',
  '2027-07-20': 'วันหยุดชดเชยวันอาสาฬหบูชา',
  '2027-10-25': 'วันหยุดชดเชยวันปิยมหาราช',
  '2027-12-06': 'วันหยุดชดเชยวันพ่อแห่งชาติ',

  // 2028 (พ.ศ. 2571)
  '2028-01-03': 'วันหยุดชดเชยวันขึ้นปีใหม่',
  '2028-02-09': 'วันมาฆบูชา',
  '2028-04-17': 'วันหยุดชดเชยวันสงกรานต์',
  '2028-05-08': 'วันวิสาขบูชา',
  '2028-06-05': 'วันหยุดชดเชยวันเฉลิมพระชนมพรรษาพระราชินี',
  '2028-07-06': 'วันอาสาฬหบูชา',
  '2028-07-07': 'วันเข้าพรรษา',
  '2028-08-14': 'วันหยุดชดเชยวันแม่แห่งชาติ',
  '2028-12-11': 'วันหยุดชดเชยวันรัฐธรรมนูญ',
};

/**
 * Returns the Thai public holiday name if the given date (Date or YYYY-MM-DD) is an official Thai holiday,
 * or null if it is not a Thai public holiday.
 */
export function getThaiHolidayName(dateOrStr: Date | string): string | null {
  const dateStr = typeof dateOrStr === 'string' ? dateOrStr : format(dateOrStr, 'yyyy-MM-dd');

  if (YEAR_SPECIFIC_THAI_HOLIDAYS[dateStr]) {
    return YEAR_SPECIFIC_THAI_HOLIDAYS[dateStr];
  }

  const mmDd = dateStr.slice(5); // MM-DD
  if (FIXED_THAI_HOLIDAYS[mmDd]) {
    return FIXED_THAI_HOLIDAYS[mmDd];
  }

  // Fallback automatic substitute holiday (วันหยุดชดเชย) check for years not explicitly in YEAR_SPECIFIC_THAI_HOLIDAYS
  const yearNum = parseInt(dateStr.slice(0, 4), 10);
  if (yearNum > 2028 || yearNum < 2024) {
    try {
      const parsed = typeof dateOrStr === 'string' ? parseISO(dateOrStr) : dateOrStr;
      const dayOfWeek = parsed.getDay();
      // If Monday, check if Sunday or Saturday was a fixed holiday
      if (dayOfWeek === 1) {
        const sun = new Date(parsed);
        sun.setDate(sun.getDate() - 1);
        const sunMmDd = format(sun, 'MM-dd');
        if (FIXED_THAI_HOLIDAYS[sunMmDd]) {
          return `วันหยุดชดเชย${FIXED_THAI_HOLIDAYS[sunMmDd]}`;
        }
        const sat = new Date(parsed);
        sat.setDate(sat.getDate() - 2);
        const satMmDd = format(sat, 'MM-dd');
        if (FIXED_THAI_HOLIDAYS[satMmDd]) {
          return `วันหยุดชดเชย${FIXED_THAI_HOLIDAYS[satMmDd]}`;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

/**
 * Returns true if the given date is Saturday or Sunday.
 */
export function isWeekendDay(dateOrStr: Date | string): boolean {
  try {
    const d = typeof dateOrStr === 'string' ? parseISO(dateOrStr) : dateOrStr;
    const day = d.getDay();
    return day === 0 || day === 6;
  } catch {
    return false;
  }
}

/**
 * Returns detailed holiday/weekend info if the date should be excluded from required scan days,
 * or null if it is a normal working day (Monday-Friday and not a Thai public holiday).
 */
export function getNonWorkingDayInfo(dateOrStr: Date | string): HolidayInfo | null {
  try {
    const d = typeof dateOrStr === 'string' ? parseISO(dateOrStr) : dateOrStr;
    const dateStr = typeof dateOrStr === 'string' ? dateOrStr : format(d, 'yyyy-MM-dd');
    const thaiHoliday = getThaiHolidayName(dateStr);

    if (thaiHoliday) {
      return {
        dateStr,
        name: thaiHoliday,
        type: 'thai_holiday',
      };
    }

    const dayOfWeek = d.getDay();
    if (dayOfWeek === 6) {
      return {
        dateStr,
        name: 'วันเสาร์',
        type: 'weekend',
      };
    }
    if (dayOfWeek === 0) {
      return {
        dateStr,
        name: 'วันอาทิตย์',
        type: 'weekend',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the date is a normal working day (Mon-Fri and NOT a Thai public holiday).
 */
export function isWorkingDay(dateOrStr: Date | string): boolean {
  return getNonWorkingDayInfo(dateOrStr) === null;
}

/**
 * Returns all working days (YYYY-MM-DD) and excluded holidays/weekends within [startDate, endDate].
 * For working days, optionally caps at today so future working days are not counted as missed yet.
 */
export function getPeriodCalendarBreakdown(
  startDate: Date,
  endDate: Date,
  capWorkingDaysAtToday: boolean = true
): {
  workingDaysUpToToday: string[];
  allWorkingDaysInPeriod: string[];
  weekendDaysInPeriod: HolidayInfo[];
  thaiHolidaysInPeriod: HolidayInfo[];
} {
  const today = startOfDay(new Date());
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const workingDaysUpToToday: string[] = [];
  const allWorkingDaysInPeriod: string[] = [];
  const weekendDaysInPeriod: HolidayInfo[] = [];
  const thaiHolidaysInPeriod: HolidayInfo[] = [];

  for (const d of days) {
    const dStart = startOfDay(d);
    const dateStr = format(dStart, 'yyyy-MM-dd');
    const thaiHoliday = getThaiHolidayName(dateStr);
    const dayOfWeek = dStart.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (thaiHoliday) {
      thaiHolidaysInPeriod.push({
        dateStr,
        name: thaiHoliday,
        type: 'thai_holiday',
      });
    } else if (isWeekend) {
      weekendDaysInPeriod.push({
        dateStr,
        name: dayOfWeek === 6 ? 'วันเสาร์' : 'วันอาทิตย์',
        type: 'weekend',
      });
    } else {
      allWorkingDaysInPeriod.push(dateStr);
      if (!capWorkingDaysAtToday || !isAfter(dStart, today)) {
        workingDaysUpToToday.push(dateStr);
      }
    }
  }

  return {
    workingDaysUpToToday,
    allWorkingDaysInPeriod,
    weekendDaysInPeriod,
    thaiHolidaysInPeriod,
  };
}
