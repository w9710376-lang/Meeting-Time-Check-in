import { CheckIn as CheckInType, Department, Employee } from '../types';
import { EMPLOYEE_LIST } from '../data/employees';

const EMP_CACHE_KEY = 'timesync_employees_cache_v1';
const CHECKINS_CACHE_PREFIX = 'timesync_today_checkins_v1_';
const TIME_RANGES_CACHE_KEY = 'timesync_time_ranges_v1';

export interface FastCheckinCachePayload {
  employees?: Employee[];
  todayDateStr?: string;
  todayCheckIns?: CheckInType[];
  defaultTimeRange?: string;
  deptTimeRanges?: Partial<Record<Department, string>>;
  updatedAt?: number;
}

export function getDefaultSeedEmployees(): Employee[] {
  const seeded: Employee[] = EMPLOYEE_LIST.map((emp) => ({
    id: emp.id,
    name: emp.name,
    role: emp.role as 'manager' | 'employee',
    department: 'IE',
    isActive: true,
    createdAt: 1700000000000,
  }));
  seeded.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return seeded;
}

export function getInitialCachedEmployees(): { employees: Employee[]; fromCache: boolean } {
  try {
    const raw = localStorage.getItem(EMP_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Employee[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { employees: parsed, fromCache: true };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return { employees: getDefaultSeedEmployees(), fromCache: false };
}

export function saveCachedEmployees(employees: Employee[], pushToServer = true): void {
  const activeSorted = employees
    .filter((e) => e.isActive !== false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  try {
    localStorage.setItem(EMP_CACHE_KEY, JSON.stringify(activeSorted));
  } catch {
    // Ignore quota errors
  }

  if (pushToServer) {
    pushFastCheckinCache({ employees: activeSorted });
  }
}

export function getInitialCachedTodayCheckIns(todayStr: string): {
  checkedInIds: Set<string>;
  list: CheckInType[];
} {
  try {
    const raw = localStorage.getItem(`${CHECKINS_CACHE_PREFIX}${todayStr}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CheckInType[];
      if (Array.isArray(parsed)) {
        const ids = new Set<string>();
        parsed.forEach((c) => {
          if (c && c.userId) ids.add(c.userId);
        });
        return { checkedInIds: ids, list: parsed };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return { checkedInIds: new Set<string>(), list: [] };
}

export function saveCachedTodayCheckIns(
  todayStr: string,
  list: CheckInType[],
  pushToServer = true
): void {
  try {
    localStorage.setItem(`${CHECKINS_CACHE_PREFIX}${todayStr}`, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }

  if (pushToServer) {
    pushFastCheckinCache({ todayDateStr: todayStr, todayCheckIns: list });
  }
}

export function getInitialCachedTimeRanges(): {
  defaultTimeRange: string;
  deptTimeRanges: Partial<Record<Department, string>>;
} {
  try {
    const raw = localStorage.getItem(TIME_RANGES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        defaultTimeRange: parsed.defaultTimeRange || '07:30-07:45',
        deptTimeRanges: parsed.deptTimeRanges || {},
      };
    }
  } catch {
    // Ignore
  }
  return { defaultTimeRange: '07:30-07:45', deptTimeRanges: {} };
}

export function saveCachedTimeRanges(
  defaultTimeRange: string,
  deptTimeRanges: Partial<Record<Department, string>>,
  pushToServer = true
): void {
  try {
    localStorage.setItem(
      TIME_RANGES_CACHE_KEY,
      JSON.stringify({ defaultTimeRange, deptTimeRanges })
    );
  } catch {
    // Ignore
  }

  if (pushToServer) {
    pushFastCheckinCache({ defaultTimeRange, deptTimeRanges });
  }
}

export function pushFastCheckinCache(payload: FastCheckinCachePayload): void {
  fetch('/api/checkin-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Ignore if endpoint is unavailable
  });
}

export async function fetchFastCheckinCache(): Promise<FastCheckinCachePayload | null> {
  try {
    const res = await fetch('/api/checkin-cache', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = (await res.json()) as FastCheckinCachePayload;
    return data;
  } catch {
    return null;
  }
}
