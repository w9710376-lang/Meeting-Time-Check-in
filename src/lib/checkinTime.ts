export interface CheckInTimeRangeParsed {
  startHours: number;
  startMinutes: number;
  startTimeVal: number;
  startLabel: string;
  endHours: number;
  endMinutes: number;
  endTimeVal: number;
  endLabel: string;
}

export type CheckInWindowStatus = 'before-start' | 'open' | 'ended';

export interface CheckInWindowResult {
  status: CheckInWindowStatus;
  startLabel: string;
  endLabel: string;
  startTimeVal: number;
  endTimeVal: number;
  isOpen: boolean;
  isBeforeStart: boolean;
  isEnded: boolean;
}

/**
 * Parses time range string (e.g. "07:30-07:45" or "08:00-08:15")
 */
export function parseCheckInTimeRange(timeRange?: string): CheckInTimeRangeParsed {
  let startHours = 7;
  let startMinutes = 30;
  let endHours = 7;
  let endMinutes = 45;

  const parts = (timeRange || '07:30-07:45').split('-');
  if (parts.length === 2) {
    const sParts = parts[0].trim().split(':');
    const eParts = parts[1].trim().split(':');
    if (sParts.length >= 2) {
      const sh = parseInt(sParts[0], 10);
      const sm = parseInt(sParts[1], 10);
      if (!isNaN(sh) && !isNaN(sm)) {
        startHours = sh;
        startMinutes = sm;
      }
    }
    if (eParts.length >= 2) {
      const eh = parseInt(eParts[0], 10);
      const em = parseInt(eParts[1], 10);
      if (!isNaN(eh) && !isNaN(em)) {
        endHours = eh;
        endMinutes = em;
      }
    }
  }

  const startTimeVal = startHours + startMinutes / 60;
  const endTimeVal = endHours + endMinutes / 60;
  const startLabel = `${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`;
  const endLabel = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

  return {
    startHours,
    startMinutes,
    startTimeVal,
    startLabel,
    endHours,
    endMinutes,
    endTimeVal,
    endLabel,
  };
}

/**
 * Evaluates whether check-in is before start time, currently open, or ended
 */
export function getCheckInWindowStatus(timeRange?: string, now: Date = new Date()): CheckInWindowResult {
  const parsed = parseCheckInTimeRange(timeRange);
  const currentTimeVal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  if (currentTimeVal < parsed.startTimeVal) {
    return {
      status: 'before-start',
      startLabel: parsed.startLabel,
      endLabel: parsed.endLabel,
      startTimeVal: parsed.startTimeVal,
      endTimeVal: parsed.endTimeVal,
      isOpen: false,
      isBeforeStart: true,
      isEnded: false,
    };
  }

  if (currentTimeVal > parsed.endTimeVal) {
    return {
      status: 'ended',
      startLabel: parsed.startLabel,
      endLabel: parsed.endLabel,
      startTimeVal: parsed.startTimeVal,
      endTimeVal: parsed.endTimeVal,
      isOpen: false,
      isBeforeStart: false,
      isEnded: true,
    };
  }

  return {
    status: 'open',
    startLabel: parsed.startLabel,
    endLabel: parsed.endLabel,
    startTimeVal: parsed.startTimeVal,
    endTimeVal: parsed.endTimeVal,
    isOpen: true,
    isBeforeStart: false,
    isEnded: false,
  };
}
