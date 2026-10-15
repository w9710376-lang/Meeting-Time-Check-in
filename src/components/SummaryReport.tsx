import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Download, BarChart2, CheckCircle2, Clock, CalendarDays, CalendarX, ChevronLeft, ChevronRight, UserX, Users, Search, X, ShieldCheck, Smartphone, Award, FileSpreadsheet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { getPeriodCalendarBreakdown, isWorkingDay } from '../lib/thaiHolidays';
import { getInitialCachedTimeRanges, saveCachedTimeRanges } from '../lib/checkinFastCache';

type Period = 'weekly' | 'monthly';
type OverviewCategory = 'onTime' | 'late' | 'missing' | 'skipMeeting';

function parseEndMinutesFromTimeRange(timeRange: string): {
  endHours: number;
  endMinutes: number;
  totalEndMinutes: number;
  endLabel: string;
} {
  let endHours = 7;
  let endMinutes = 45;
  const parts = (timeRange || '07:30-07:45').split('-');
  if (parts.length === 2) {
    const endParts = parts[1].trim().split(':');
    if (endParts.length >= 2) {
      const h = parseInt(endParts[0], 10);
      const m = parseInt(endParts[1], 10);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        endHours = h;
        endMinutes = m;
      }
    }
  }
  const endLabel = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  return {
    endHours,
    endMinutes,
    totalEndMinutes: endHours * 60 + endMinutes,
    endLabel,
  };
}

function getCheckInDelayMinutes(
  c: CheckIn,
  empDept: Department,
  defaultTimeRange: string,
  deptTimeRanges: Partial<Record<Department, string>>
): number {
  if (typeof c.delayMinutes === 'number' && c.delayMinutes > 0) {
    return c.delayMinutes;
  }
  const deptKey = (c.department || empDept || 'IE').trim().toUpperCase();
  const matchedRange =
    c.designatedTimeRange ||
    deptTimeRanges[deptKey] ||
    deptTimeRanges[c.department || empDept] ||
    defaultTimeRange ||
    '07:30-07:45';
  const { totalEndMinutes } = parseEndMinutesFromTimeRange(matchedRange);

  if (!c.timestamp) {
    return c.status === 'late' ? 1 : 0;
  }
  const d = new Date(c.timestamp);
  const checkInMinutes = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const rawDiff = checkInMinutes - totalEndMinutes;
  if (rawDiff > 0) {
    return Math.max(1, Math.round(rawDiff));
  }
  return c.status === 'late' ? 1 : 0;
}

export function SummaryReport() {
  const { profile, departments } = useAuth();
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

  const initialRanges = useMemo(() => getInitialCachedTimeRanges(), []);
  const [defaultTimeRange, setDefaultTimeRange] = useState<string>(initialRanges.defaultTimeRange);
  const [deptTimeRanges, setDeptTimeRanges] = useState<Partial<Record<Department, string>>>(
    initialRanges.deptTimeRanges
  );

  const [period, setPeriod] = useState<Period>('monthly');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [monthlyCheckIns, setMonthlyCheckIns] = useState<CheckIn[]>([]);
  const [selectedDept, setSelectedDept] = useState<'ALL' | Department>(scopedDept || 'ALL');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('ALL');
  const [showAllCalendarDays, setShowAllCalendarDays] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeOverviewCategory, setActiveOverviewCategory] = useState<OverviewCategory | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState<string>('');
  const [tableCategoryFilter, setTableCategoryFilter] = useState<'ALL' | OverviewCategory>('ALL');
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<any | null>(null);
  const [detailTimelineFilter, setDetailTimelineFilter] = useState<'ALL' | 'on-time' | 'late' | 'missing' | 'skip'>('ALL');
  const [detailTimelineSearch, setDetailTimelineSearch] = useState<string>('');

  useEffect(() => {
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'checkin'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const nextDefault = data.targetTimeRange || '07:30-07:45';
          const nextDepts = data.departmentTimeRanges || {};
          setDefaultTimeRange(nextDefault);
          setDeptTimeRanges(nextDepts);
          saveCachedTimeRanges(nextDefault, nextDepts, false);
        }
      },
      console.warn
    );
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    if (!activeOverviewCategory && !selectedEmployeeDetail) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveOverviewCategory(null);
        setSelectedEmployeeDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOverviewCategory, selectedEmployeeDetail]);

  useEffect(() => {
    setSelectedDept(scopedDept || 'ALL');
  }, [scopedDept]);

  useEffect(() => {
    setSelectedDayFilter('ALL');
  }, [period, referenceDate, selectedDept]);

  useEffect(() => {
    const empQ = query(collection(db, 'employees'), where('isActive', '==', true));
    const unsubEmp = onSnapshot(empQ, (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach(doc => empData.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      setEmployees(empData);
    }, console.warn);

    return () => unsubEmp();
  }, []);

  // Always fetch check-ins for the entire month of referenceDate to compute monthly accumulated points
  const monthKey = format(referenceDate, 'yyyy-MM');
  useEffect(() => {
    const mStart = format(startOfMonth(referenceDate), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(referenceDate), 'yyyy-MM-dd');

    const monthQ = query(
      collection(db, 'checkins'),
      where('dateStr', '>=', mStart),
      where('dateStr', '<=', mEnd)
    );

    const unsubMonth = onSnapshot(monthQ, (snapshot) => {
      const data: CheckIn[] = [];
      snapshot.forEach(doc => data.push(doc.data() as CheckIn));
      setMonthlyCheckIns(data);
    }, console.warn);

    return () => unsubMonth();
  }, [monthKey]);

  const { periodStart, periodEnd, startStr, endStr } = useMemo(() => {
    let sDate: Date;
    let eDate: Date;
    if (period === 'weekly') {
      sDate = startOfWeek(referenceDate, { weekStartsOn: 1 });
      eDate = endOfWeek(referenceDate, { weekStartsOn: 1 });
    } else {
      sDate = startOfMonth(referenceDate);
      eDate = endOfMonth(referenceDate);
    }
    return {
      periodStart: sDate,
      periodEnd: eDate,
      startStr: format(sDate, 'yyyy-MM-dd'),
      endStr: format(eDate, 'yyyy-MM-dd'),
    };
  }, [period, referenceDate]);

  useEffect(() => {
    setLoading(true);

    const checkinsQ = query(
      collection(db, 'checkins'),
      where('dateStr', '>=', startStr),
      where('dateStr', '<=', endStr)
    );

    const unsubCheckins = onSnapshot(checkinsQ, (snapshot) => {
      const data: CheckIn[] = [];
      snapshot.forEach(doc => data.push(doc.data() as CheckIn));
      setCheckIns(data);
      setLoading(false);
    }, (error) => {
      console.warn("Offline mode or error:", error.message);
      setLoading(false);
    });

    return () => unsubCheckins();
  }, [startStr, endStr]);

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    setReferenceDate(new Date());
  };

  const handlePrev = () => {
    setReferenceDate(prev => period === 'weekly' ? subWeeks(prev, 1) : subMonths(prev, 1));
  };

  const handleNext = () => {
    setReferenceDate(prev => period === 'weekly' ? addWeeks(prev, 1) : addMonths(prev, 1));
  };

  const handleToday = () => {
    setReferenceDate(new Date());
  };

  const monthShortLabel = format(referenceDate, 'MMM yyyy', { locale: th });

  const filteredEmployees = useMemo(() => {
    const base = selectedDept === 'ALL'
      ? employees
      : employees.filter(e => (e.department || 'IE').trim().toUpperCase() === selectedDept.trim().toUpperCase());
    return [...base].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [employees, selectedDept]);

  // Calculate working days and excluded weekends/Thai holidays in the selected period
  const periodCalendar = useMemo(
    () => getPeriodCalendarBreakdown(periodStart, periodEnd, true),
    [periodStart, periodEnd]
  );

  // Determine required scan dates (working days only: Mon-Fri, excluding Saturday, Sunday, and Thai public holidays)
  const trackedDates = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Unique working dates that had check-in records in this period (strictly excluding Sat, Sun, and Thai holidays)
    const activeSet = new Set<string>();
    checkIns.forEach(c => {
      if (c.dateStr && c.dateStr >= startStr && c.dateStr <= endStr && isWorkingDay(c.dateStr)) {
        activeSet.add(c.dateStr);
      }
    });

    // If today is within the selected period AND is a working day (not Sat/Sun/Thai holiday), include today
    if (todayStr >= startStr && todayStr <= endStr && isWorkingDay(todayStr)) {
      activeSet.add(todayStr);
    }

    if (showAllCalendarDays) {
      periodCalendar.workingDaysUpToToday.forEach(dStr => {
        activeSet.add(dStr);
      });
    }

    return Array.from(activeSet).sort((a, b) => a.localeCompare(b));
  }, [checkIns, startStr, endStr, showAllCalendarDays, periodCalendar]);

  // Daily breakdown: for each date in trackedDates (newest first), find who scanned and who did NOT scan
  const dailyMissingBreakdown = useMemo(() => {
    return [...trackedDates].reverse().map(dateStr => {
      const dayCheckIns = checkIns.filter(c => c.dateStr === dateStr);
      const scannedUserIds = new Set(dayCheckIns.map(c => c.userId));

      const missingEmps = filteredEmployees.filter(emp => !scannedUserIds.has(emp.id));
      const scannedCount = filteredEmployees.length - missingEmps.length;

      let parsedDate = new Date();
      try {
        parsedDate = parseISO(dateStr);
      } catch {
        // fallback
      }

      return {
        dateStr,
        shortDateLabel: format(parsedDate, 'd MMM', { locale: th }),
        fullDateLabel: format(parsedDate, 'EEEEที่ d MMMM yyyy', { locale: th }),
        totalEmployees: filteredEmployees.length,
        scannedCount,
        missingCount: missingEmps.length,
        missingEmployees: missingEmps,
      };
    });
  }, [trackedDates, checkIns, filteredEmployees]);

  const baseReportData = useMemo(() => {
    const report = filteredEmployees.map(emp => {
      const empDept = (emp.department || 'IE').trim().toUpperCase();
      const empDesignatedTimeRange =
        deptTimeRanges[empDept] ||
        deptTimeRanges[emp.department || 'IE'] ||
        defaultTimeRange ||
        '07:30-07:45';

      // Only include check-ins on working days (exclude Saturday, Sunday, and Thai public holidays)
      const empCheckIns = checkIns
        .filter(c => c.userId === emp.id && c.dateStr && isWorkingDay(c.dateStr))
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      const scannedDateSet = new Set(empCheckIns.map(c => c.dateStr));
      const empMonthlyCheckIns = monthlyCheckIns.filter(
        c => c.userId === emp.id && c.dateStr && isWorkingDay(c.dateStr)
      );
      const monthlyPoints = empMonthlyCheckIns.reduce((sum, c) => sum + (c.earnedPoints || 0), 0);

      // Classify check-ins: check-ins after the designated time range (or explicitly marked 'late')
      const lateCheckInsWithDelay = empCheckIns
        .map(c => {
          const delayMins = getCheckInDelayMinutes(c, empDept, defaultTimeRange, deptTimeRanges);
          const isAfterDesignated = c.status === 'late' || delayMins > 0;
          return { checkIn: c, delayMins, isAfterDesignated };
        })
        .filter(item => item.isAfterDesignated);

      const lateCheckInIds = new Set(lateCheckInsWithDelay.map(item => item.checkIn.id || `${item.checkIn.userId}_${item.checkIn.dateStr}`));
      const onTimeCheckIns = empCheckIns.filter(
        c => !lateCheckInIds.has(c.id || `${c.userId}_${c.dateStr}`)
      );

      const joinCheckIns = empCheckIns.filter(c => c.meetingStatus === 'join');
      const skipCheckIns = empCheckIns.filter(c => c.meetingStatus === 'skip');

      const onTime = onTimeCheckIns.length;
      const late = lateCheckInsWithDelay.length;
      const joinMeeting = joinCheckIns.length;
      const skipMeeting = skipCheckIns.length;

      const totalDelayMinutes = lateCheckInsWithDelay.reduce(
        (sum, item) => sum + Math.max(1, item.delayMins),
        0
      );
      const avgDelayMinutes =
        late > 0 ? Math.round((totalDelayMinutes / late) * 10) / 10 : 0;
      const maxDelayMinutes =
        late > 0
          ? Math.max(...lateCheckInsWithDelay.map(item => Math.max(1, item.delayMins)))
          : 0;

      const onTimeDetails = onTimeCheckIns.map(c => {
        let dLabel = c.dateStr;
        try {
          dLabel = format(parseISO(c.dateStr), 'd MMM', { locale: th });
        } catch {
          // fallback
        }
        const timeLabel = c.timestamp ? format(new Date(c.timestamp), 'HH:mm') : '';
        return timeLabel ? `${dLabel} (${timeLabel} น.)` : dLabel;
      });

      const lateDetails = lateCheckInsWithDelay.map(({ checkIn: c }) => {
        let dLabel = c.dateStr;
        try {
          dLabel = format(parseISO(c.dateStr), 'd MMM', { locale: th });
        } catch {
          // fallback
        }
        const timeLabel = c.timestamp ? format(new Date(c.timestamp), 'HH:mm') : '';
        return timeLabel ? `${dLabel} (${timeLabel} น.)` : dLabel;
      });

      const skipReasonDetails = skipCheckIns.map(c => {
        let dLabel = c.dateStr;
        try {
          dLabel = format(parseISO(c.dateStr), 'd MMM', { locale: th });
        } catch {
          // fallback
        }
        return c.skipReason ? `${dLabel}: ${c.skipReason}` : `${dLabel}: ไม่ระบุเหตุผล`;
      });

      const missedDateStrs = trackedDates.filter(d => !scannedDateSet.has(d));
      const missedShortLabels = missedDateStrs.map(d => {
        try {
          return format(parseISO(d), 'd MMM', { locale: th });
        } catch {
          return d;
        }
      });

      // Day-by-day timeline for individual history view (newest first)
      const dailyTimeline = [...trackedDates].reverse().map(dateStr => {
        const c = empCheckIns.find(item => item.dateStr === dateStr);
        const isScanned = Boolean(c);
        let parsedDate = new Date();
        try {
          parsedDate = parseISO(dateStr);
        } catch {
          // fallback
        }
        const delayMins = c ? getCheckInDelayMinutes(c, empDept, defaultTimeRange, deptTimeRanges) : 0;
        const isLate = c?.status === 'late' || delayMins > 0;
        const status: 'on-time' | 'late' | 'missing' = !c ? 'missing' : isLate ? 'late' : 'on-time';
        return {
          dateStr,
          fullDateLabel: format(parsedDate, 'EEEEที่ d MMMM yyyy', { locale: th }),
          shortDateLabel: format(parsedDate, 'EEE d MMM', { locale: th }),
          isScanned,
          checkIn: c || null,
          status,
          scanTime: c?.timestamp ? format(new Date(c.timestamp), 'HH:mm:ss') : '-',
          delayMinutes: delayMins,
          earnedPoints: c?.earnedPoints ?? 0,
          meetingStatus: c ? (c.meetingStatus === 'join' ? 'join' : c.meetingStatus === 'skip' ? 'skip' : 'unknown') : 'missing',
          skipReason: c?.skipReason || '',
          deviceId: c?.deviceId || '-',
          deviceLabel: c?.deviceLabel || '-',
        };
      });

      return {
        id: emp.id,
        name: emp.name,
        department: emp.department || 'IE',
        employeeRaw: emp,
        empCheckIns,
        dailyTimeline,
        designatedTimeRange: empDesignatedTimeRange,
        totalPoints: monthlyPoints,
        requiredDays: trackedDates.length,
        total: scannedDateSet.size,
        missingDays: missedDateStrs.length,
        missedDateStrs,
        missedShortLabels,
        onTime,
        onTimeDetails,
        late,
        totalDelayMinutes,
        avgDelayMinutes,
        maxDelayMinutes,
        lateDetails,
        joinMeeting,
        skipMeeting,
        skipReasonDetails
      };
    });

    // Sort by monthly points descending, then by name
    return report.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return (b.totalPoints || 0) - (a.totalPoints || 0);
      }
      return a.name.localeCompare(b.name, 'th');
    });
  }, [filteredEmployees, checkIns, monthlyCheckIns, trackedDates, defaultTimeRange, deptTimeRanges]);

  const reportData = useMemo(() => {
    let filtered = baseReportData;

    if (tableCategoryFilter === 'onTime') {
      filtered = filtered.filter(r => r.onTime > 0);
    } else if (tableCategoryFilter === 'late') {
      filtered = filtered.filter(r => r.late > 0);
    } else if (tableCategoryFilter === 'missing') {
      filtered = filtered.filter(r => r.missingDays > 0);
    } else if (tableCategoryFilter === 'skipMeeting') {
      filtered = filtered.filter(r => r.skipMeeting > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        r => r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [baseReportData, tableCategoryFilter, searchQuery]);

  const onTimeEmployees = useMemo(
    () =>
      baseReportData
        .filter(r => r.onTime > 0)
        .sort((a, b) => b.onTime - a.onTime || a.name.localeCompare(b.name, 'th')),
    [baseReportData]
  );

  const lateEmployees = useMemo(
    () =>
      baseReportData
        .filter(r => r.late > 0)
        .sort((a, b) => b.late - a.late || a.name.localeCompare(b.name, 'th')),
    [baseReportData]
  );

  const missingEmployeesList = useMemo(
    () =>
      baseReportData
        .filter(r => r.missingDays > 0)
        .sort((a, b) => b.missingDays - a.missingDays || a.name.localeCompare(b.name, 'th')),
    [baseReportData]
  );

  const skipMeetingEmployees = useMemo(
    () =>
      baseReportData
        .filter(r => r.skipMeeting > 0)
        .sort((a, b) => b.skipMeeting - a.skipMeeting || a.name.localeCompare(b.name, 'th')),
    [baseReportData]
  );

  // Aggregate for Overview & Charts
  const totalOnTime = baseReportData.reduce((acc, curr) => acc + curr.onTime, 0);
  const totalLate = baseReportData.reduce((acc, curr) => acc + curr.late, 0);
  const totalMissing = baseReportData.reduce((acc, curr) => acc + curr.missingDays, 0);
  const totalSkipMeeting = baseReportData.reduce((acc, curr) => acc + curr.skipMeeting, 0);
  const chartData: { name: string; value: number; fill: string; category: OverviewCategory }[] = [
    { name: 'ตรงเวลา', value: totalOnTime, fill: '#10B981', category: 'onTime' },
    { name: 'สาย', value: totalLate, fill: '#F59E0B', category: 'late' },
    { name: 'ไม่สแกน', value: totalMissing, fill: '#64748B', category: 'missing' },
    { name: 'ประชุม (ไม่เข้า)', value: totalSkipMeeting, fill: '#F43F5E', category: 'skipMeeting' }
  ];

  const handleOpenOverviewModal = (cat: OverviewCategory) => {
    setActiveOverviewCategory(cat);
    setModalSearchQuery('');
  };

  const handleExport = () => {
    try {
      const exportData = reportData.map((data, index) => ({
        'No.': index + 1,
        'ชื่อ - นามสกุล': data.name,
        'แผนก': data.department,
        'ช่วงเวลาที่กำหนด': data.designatedTimeRange,
        [`คะแนนสะสมรายเดือน (${monthShortLabel})`]: data.totalPoints,
        'วันที่ต้องสแกน (วันทำการ)': data.requiredDays,
        'มาสแกน (วัน)': data.total,
        'ไม่สแกน (วัน)': data.missingDays,
        'วันที่ไม่สแกน (เฉพาะวันทำการ)': data.missedShortLabels.length > 0 ? data.missedShortLabels.join(', ') : 'สแกนครบทุกวันทำการ',
        'ตรงเวลา (วัน)': data.onTime,
        'มาสาย (วัน)': data.late,
        'รายละเอียดวันที่มาสาย': data.lateDetails.length > 0 ? data.lateDetails.join(' | ') : '-',
        'เข้าร่วมประชุม (วัน)': data.joinMeeting,
        'ไม่เข้าร่วมประชุม (วัน)': data.skipMeeting,
        'เหตุผลที่ไม่เข้าประชุม': data.skipReasonDetails.length > 0 ? data.skipReasonDetails.join(' | ') : '-'
      }));

      const dailyMissingRows: Record<string, string | number>[] = [];
      dailyMissingBreakdown.forEach(day => {
        if (day.missingEmployees.length === 0) {
          dailyMissingRows.push({
            'วันที่': day.dateStr,
            'รายละเอียดวัน': day.fullDateLabel,
            'ลำดับ': '-',
            'ชื่อ - นามสกุล (คนที่ไม่สแกน)': 'สแกนครบทุกคน',
            'แผนก': '-'
          });
        } else {
          day.missingEmployees.forEach((emp, idx) => {
            dailyMissingRows.push({
              'วันที่': day.dateStr,
              'รายละเอียดวัน': day.fullDateLabel,
              'ลำดับ': idx + 1,
              'ชื่อ - นามสกุล (คนที่ไม่สแกน)': emp.name,
              'แผนก': emp.department || 'IE'
            });
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wsDaily = XLSX.utils.json_to_sheet(dailyMissingRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Summary_By_Person");
      XLSX.utils.book_append_sheet(wb, wsDaily, "Missing_By_Day");
      XLSX.writeFile(wb, `TimeSync_Summary_${selectedDept}_${period}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
    }
  };

  const handleExportSingleEmployee = (empData: any) => {
    try {
      if (!empData?.dailyTimeline) return;
      const rows = empData.dailyTimeline.map((item: any, idx: number) => ({
        'ลำดับ': idx + 1,
        'วันที่': item.dateStr,
        'วันในสัปดาห์': item.fullDateLabel,
        'สถานะการเช็คอิน':
          item.status === 'on-time'
            ? 'ตรงเวลา (+10 คะแนน)'
            : item.status === 'late'
            ? `สาย (+5 คะแนน, ล่าช้า ${item.delayMinutes} นาที)`
            : 'ไม่ได้สแกน (ขาด)',
        'เวลาที่สแกน': item.scanTime,
        'คะแนนที่ได้รับ': item.earnedPoints,
        'การเข้าร่วมประชุมเช้า':
          item.meetingStatus === 'join'
            ? 'เข้าร่วมประชุม'
            : item.meetingStatus === 'skip'
            ? 'ไม่เข้าร่วม (ติดภารกิจ)'
            : 'ขาดสแกน',
        'เหตุผลที่ไม่เข้าประชุม': item.skipReason || '-',
        'ชื่ออุปกรณ์ / รุ่น': item.deviceLabel || '-',
        'รหัสประจำอุปกรณ์ (Device ID)': item.deviceId || '-',
        'การตรวจสอบความปลอดภัย': item.isScanned ? 'ปกติ (Verified 1:1)' : '-'
      }));

      const summaryOverview = [
        { 'หัวข้อสรุป': 'ชื่อ - นามสกุล', 'รายละเอียด': empData.name },
        { 'หัวข้อสรุป': 'แผนก', 'รายละเอียด': empData.department },
        { 'หัวข้อสรุป': 'ช่วงเวลาเข้าประชุมเป้าหมาย', 'รายละเอียด': `${empData.designatedTimeRange} น.` },
        { 'หัวข้อสรุป': `คะแนนสะสมรายเดือน (${monthShortLabel})`, 'รายละเอียด': `${empData.totalPoints} คะแนน` },
        { 'หัวข้อสรุป': 'วันที่ต้องสแกนในรอบนี้ (วันทำการ)', 'รายละเอียด': `${empData.requiredDays} วัน` },
        { 'หัวข้อสรุป': 'มาสแกนสำเร็จ', 'รายละเอียด': `${empData.total} วัน` },
        { 'หัวข้อสรุป': 'ไม่ได้สแกน', 'รายละเอียด': `${empData.missingDays} วัน` },
        { 'หัวข้อสรุป': 'ตรงเวลา', 'รายละเอียด': `${empData.onTime} วัน` },
        { 'หัวข้อสรุป': 'มาสาย', 'รายละเอียด': `${empData.late} วัน` },
        { 'หัวข้อสรุป': 'เวลาล่าช้าเฉลี่ย', 'รายละเอียด': `${empData.avgDelayMinutes} นาที` },
        { 'หัวข้อสรุป': 'เวลาล่าช้าสูงสุด', 'รายละเอียด': `${empData.maxDelayMinutes} นาที` },
        { 'หัวข้อสรุป': 'เข้าร่วมประชุมเช้า', 'รายละเอียด': `${empData.joinMeeting} วัน` },
        { 'หัวข้อสรุป': 'ไม่เข้าร่วมประชุมเช้า (ติดภารกิจ)', 'รายละเอียด': `${empData.skipMeeting} วัน` },
      ];

      const wsOverview = XLSX.utils.json_to_sheet(summaryOverview);
      const wsTimeline = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsOverview, "Employee_Summary");
      XLSX.utils.book_append_sheet(wb, wsTimeline, "Daily_History");
      XLSX.writeFile(wb, `ScanHistory_${empData.name}_${empData.department}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error("Error exporting individual scan history:", error);
    }
  };

  const periodLabel = period === 'weekly' 
    ? `สัปดาห์ที่ ${format(periodStart, 'd MMM', { locale: th })} - ${format(periodEnd, 'd MMM yyyy', { locale: th })}`
    : `เดือน ${format(periodStart, 'MMMM yyyy', { locale: th })}`;

  const visibleDailyBreakdown = selectedDayFilter === 'ALL'
    ? dailyMissingBreakdown
    : dailyMissingBreakdown.filter(d => d.dateStr === selectedDayFilter);

  const thaiHolidayLabels = useMemo(() => {
    return periodCalendar.thaiHolidaysInPeriod.map(h => {
      try {
        return `${format(parseISO(h.dateStr), 'd MMM', { locale: th })} (${h.name})`;
      } catch {
        return `${h.dateStr} (${h.name})`;
      }
    });
  }, [periodCalendar.thaiHolidaysInPeriod]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">สรุปรายสัปดาห์และรายเดือน</h1>
          <p className="text-sm text-slate-500">ตรวจสอบสถิติการเข้างาน การเข้าร่วมประชุม และรายชื่อคนที่ไม่สแกนในแต่ละวัน</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!scopedDept && (
              <button
                onClick={() => setSelectedDept('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  selectedDept === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                ทุกแผนก
              </button>
            )}
            {(scopedDept ? [scopedDept] : departments).map(dept => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  selectedDept === dept ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {scopedDept ? `แผนก ${dept}` : dept}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <button onClick={handlePrev} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={handleToday} className="px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0">ปัจจุบัน</button>
            <button onClick={handleNext} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => handlePeriodChange('weekly')}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                period === 'weekly' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              รายสัปดาห์
            </button>
            <button
              onClick={() => handlePeriodChange('monthly')}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                period === 'monthly' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              รายเดือน
            </button>
          </div>
        </div>
      </div>

      {/* แถบสรุปการตัดวันเสาร์-อาทิตย์ และวันหยุดตามปฏิทินไทย */}
      <div className="bg-white p-4 sm:px-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-slate-900">เกณฑ์คำนวณวันที่ต้องสแกน ({periodLabel}):</span>
            <span className="font-bold text-blue-600 tabular-nums">
              ต้องสแกน {trackedDates.length} วันทำการ
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs text-slate-600 tabular-nums">
              ตัดวันเสาร์-อาทิตย์ออก <strong className="text-slate-800">{periodCalendar.weekendDaysInPeriod.length} วัน</strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs text-slate-600 tabular-nums">
              ตัดวันหยุดตามปฏิทินไทยออก <strong className="text-rose-600">{periodCalendar.thaiHolidaysInPeriod.length} วัน</strong>
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {thaiHolidayLabels.length > 0 ? (
              <>
                <span className="font-semibold text-slate-700">วันหยุดตามปฏิทินไทยในรอบนี้ที่ไม่นำมาคำนวณ: </span>
                <span className="text-rose-600 font-medium">{thaiHolidayLabels.join(' · ')}</span>
              </>
            ) : (
              <span>ไม่มีวันหยุดนักขัตฤกษ์ตามปฏิทินไทยในรอบเวลานี้ (ตัดเฉพาะวันเสาร์และวันอาทิตย์ออกจากการคำนวณ)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAllCalendarDays(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              !showAllCalendarDays
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            เฉพาะวันทำการที่เปิดสแกน
          </button>
          <button
            type="button"
            onClick={() => setShowAllCalendarDays(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              showAllCalendarDays
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทุกวันทำการ จ.-ศ. ({periodCalendar.workingDaysUpToToday.length} วัน)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 font-bold animate-pulse">กำลังประมวลผลข้อมูล...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <h3 className="font-bold text-slate-800 text-lg mb-1 flex items-center">
                <CalendarDays className="w-5 h-5 mr-2 text-blue-500" /> ภาพรวม {period === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'} ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                {periodLabel} · วันที่ต้องสแกน {trackedDates.length} วันทำการ (ตัด ส.-อา. และวันหยุดไทย) · <span className="text-blue-600 font-semibold">กดที่เมนูเพื่อดูรายชื่อ</span>
              </p>
              
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenOverviewModal('onTime')}
                  className="w-full text-left flex justify-between items-center p-3.5 bg-slate-50 hover:bg-emerald-50/70 rounded-xl border border-slate-200/80 hover:border-emerald-300 transition-all group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center text-slate-800 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> เช็คอินตรงเวลา
                    </div>
                    <p className="text-xs text-slate-500 pl-6 mt-0.5 tabular-nums">
                      พนักงาน {onTimeEmployees.length} คน · <span className="text-emerald-600 font-semibold group-hover:underline">กดดูรายชื่อ</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-bold text-emerald-600 tabular-nums">{totalOnTime}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleOpenOverviewModal('late')}
                  className="w-full text-left flex justify-between items-center p-3.5 bg-slate-50 hover:bg-amber-50/70 rounded-xl border border-slate-200/80 hover:border-amber-300 transition-all group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center text-slate-800 font-bold text-sm">
                      <Clock className="w-4 h-4 mr-2 text-amber-500 shrink-0" /> เช็คอินสาย
                    </div>
                    <p className="text-xs text-slate-500 pl-6 mt-0.5 tabular-nums">
                      พนักงาน {lateEmployees.length} คน · <span className="text-amber-600 font-semibold group-hover:underline">กดดูรายชื่อ</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-bold text-amber-600 tabular-nums">{totalLate}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenOverviewModal('missing')}
                  className="w-full text-left flex justify-between items-center p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-all group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center text-slate-800 font-bold text-sm">
                      <UserX className="w-4 h-4 mr-2 text-slate-600 shrink-0" /> ไม่สแกนเช็คอิน (เฉพาะวันทำการ)
                    </div>
                    <p className="text-xs text-slate-500 pl-6 mt-0.5 tabular-nums">
                      พนักงาน {missingEmployeesList.length} คน · <span className="text-slate-700 font-semibold group-hover:underline">กดดูรายชื่อ</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-bold text-slate-700 tabular-nums">{totalMissing}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenOverviewModal('skipMeeting')}
                  className="w-full text-left flex justify-between items-center p-3.5 bg-slate-50 hover:bg-rose-50/70 rounded-xl border border-slate-200/80 hover:border-rose-300 transition-all group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center text-slate-800 font-bold text-sm">
                      <CalendarX className="w-4 h-4 mr-2 text-rose-500 shrink-0" /> ประชุม (ไม่เข้า)
                    </div>
                    <p className="text-xs text-slate-500 pl-6 mt-0.5 tabular-nums">
                      พนักงาน {skipMeetingEmployees.length} คน · <span className="text-rose-600 font-semibold group-hover:underline">กดดูรายชื่อ</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-bold text-rose-600 tabular-nums">{totalSkipMeeting}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h3 className="font-bold text-slate-800 text-lg flex items-center">
                  <BarChart2 className="w-5 h-5 mr-2 text-blue-500" /> สัดส่วนการเข้างาน ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})
                </h3>
                <span className="text-xs text-slate-500">คลิกที่แท่งกราฟเพื่อดูรายชื่อพนักงานในแต่ละหมวดหมู่</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={115} fontWeight="bold" />
                    <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                    <Bar
                      dataKey="value"
                      radius={[0, 4, 4, 0]}
                      className="cursor-pointer"
                      onClick={(barData: any) => {
                        if (barData?.category) {
                          handleOpenOverviewModal(barData.category);
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* รายงานสรุปรายบุคคล Table */}
          <div id="individual-summary-table" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 space-y-4">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-blue-500" /> รายงานสรุปรายบุคคล ({selectedDept === 'ALL' ? 'ทุกแผนก' : `แผนก ${selectedDept}`})
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    คำนวณวันที่ต้องสแกนเฉพาะวันทำการ (ตัดเสาร์-อาทิตย์ และวันหยุดไทยออกแล้ว) รวม <strong className="text-slate-800 tabular-nums">{trackedDates.length} วันทำการ</strong> · <span className="text-purple-600 font-semibold">คะแนนสะสมคิดเฉพาะรายเดือน ({monthShortLabel})</span>
                  </p>
                  <p className="text-xs text-blue-700 mt-1.5 font-medium inline-flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/70">
                    <span>💡 แตะที่ <strong>ชื่อ - นามสกุล</strong> เพื่อเปิดดูประวัติการสแกนรายวัน สถิติการเข้าประชุม และข้อมูลอุปกรณ์ 1:1</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                  <div className="relative flex-1 sm:flex-initial sm:w-56">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาชื่อพนักงาน..."
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => setShowAllCalendarDays(prev => !prev)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                      showAllCalendarDays
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {showAllCalendarDays ? 'นับทุกวันทำการ จ.-ศ. (ตัดวันหยุดไทย)' : 'นับเฉพาะวันทำการที่มีการสแกน'}
                  </button>

                  <button
                    onClick={handleExport}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ส่งออก Excel
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-semibold text-slate-500 mr-1">กรองตามหมวดหมู่:</span>
                <button
                  type="button"
                  onClick={() => setTableCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    tableCategoryFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ทั้งหมด ({baseReportData.length} คน)
                </button>
                <button
                  type="button"
                  onClick={() => setTableCategoryFilter('onTime')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    tableCategoryFilter === 'onTime'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  เช็คอินตรงเวลา ({onTimeEmployees.length} คน)
                </button>
                <button
                  type="button"
                  onClick={() => setTableCategoryFilter('late')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    tableCategoryFilter === 'late'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  เช็คอินสาย ({lateEmployees.length} คน)
                </button>
                <button
                  type="button"
                  onClick={() => setTableCategoryFilter('missing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    tableCategoryFilter === 'missing'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ไม่สแกนเช็คอิน ({missingEmployeesList.length} คน)
                </button>
                <button
                  type="button"
                  onClick={() => setTableCategoryFilter('skipMeeting')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    tableCategoryFilter === 'skipMeeting'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ประชุม (ไม่เข้า) ({skipMeetingEmployees.length} คน)
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                    <th className="py-4 px-4 w-14 text-center">No.</th>
                    <th className="py-4 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-4 px-4 text-center">แผนก</th>
                    <th className="py-4 px-4 text-center text-purple-600">คะแนนสะสม ({monthShortLabel}) 🏆</th>
                    <th className="py-4 px-4 text-center text-slate-700">วันที่ต้องสแกน (วัน)</th>
                    <th className="py-4 px-4 text-center">มาสแกน (วัน)</th>
                    <th className="py-4 px-4 text-center text-rose-600">ไม่สแกน (วัน)</th>
                    <th className="py-4 px-4">วันที่ไม่สแกน (เฉพาะวันทำการ)</th>
                    <th className="py-4 px-4 text-center text-emerald-600">ตรงเวลา</th>
                    <th className="py-4 px-4 text-center text-amber-600">สาย</th>
                    <th className="py-4 px-4 text-center text-blue-600">ประชุม (เข้า)</th>
                    <th className="py-4 px-4 text-center text-rose-600">ประชุม (ไม่เข้า)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length > 0 ? (
                    reportData.map((data, index) => (
                      <tr key={data.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-medium tabular-nums">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeDetail(data);
                              setDetailTimelineFilter('ALL');
                              setDetailTimelineSearch('');
                            }}
                            className="group inline-flex items-center gap-2 font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left cursor-pointer"
                            title={`คลิกเพื่อดูประวัติการสแกนและรายละเอียดทั้งหมดของ ${data.name}`}
                          >
                            <span className="text-slate-900 group-hover:text-blue-600">{data.name}</span>
                            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white border border-blue-200/80 px-2 py-0.5 rounded-lg transition-all inline-flex items-center gap-1 shadow-2xs">
                              <span>ดูประวัติ</span>
                              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center text-xs font-bold text-blue-700 tabular-nums">
                          {data.department}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-purple-600 tabular-nums">{data.totalPoints}</td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-600 tabular-nums">{data.requiredDays}</td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-700 tabular-nums">{data.total}</td>
                        <td className="py-3 px-4 text-center font-bold tabular-nums">
                          {data.missingDays > 0 ? (
                            <span className="text-rose-600">{data.missingDays}</span>
                          ) : (
                            <span className="text-emerald-600">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs max-w-xs">
                          {data.missedShortLabels.length > 0 ? (
                            <span className="text-rose-600 font-medium leading-relaxed">
                              {data.missedShortLabels.join(' · ')}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium">สแกนครบทุกวันทำการ</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-emerald-600 tabular-nums">{data.onTime > 0 ? data.onTime : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-amber-600 tabular-nums">{data.late > 0 ? data.late : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-blue-600 tabular-nums">{data.joinMeeting > 0 ? data.joinMeeting : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-rose-600 tabular-nums">
                          {data.skipMeeting > 0 ? (
                            <div className="flex flex-col items-center">
                              <span>{data.skipMeeting}</span>
                              {data.skipReasonDetails.length > 0 && (
                                <span
                                  className="text-[11px] font-normal text-slate-500 max-w-[180px] truncate mt-0.5"
                                  title={data.skipReasonDetails.join(' · ')}
                                >
                                  {data.skipReasonDetails.join(' · ')}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-500">
                        ไม่มีข้อมูลพนักงานในแผนกที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* รายชื่อคนที่ไม่สแกนในแต่ละวัน (Daily Missing Breakdown) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center">
                  <UserX className="w-5 h-5 mr-2 text-rose-500" /> รายชื่อคนที่ไม่สแกนในแต่ละวัน ({selectedDept === 'ALL' ? 'ทุกแผนก' : `แผนก ${selectedDept}`})
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ตรวจสอบรายชื่อพนักงานที่ไม่ได้สแกนเช็คอินแยกตามรายวัน ({periodLabel})
                </p>
              </div>

              {dailyMissingBreakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setSelectedDayFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      selectedDayFilter === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ทุกวัน ({dailyMissingBreakdown.length})
                  </button>
                  {dailyMissingBreakdown.map(day => (
                    <button
                      key={day.dateStr}
                      onClick={() => setSelectedDayFilter(day.dateStr)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        selectedDayFilter === day.dateStr
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {day.shortDateLabel} ({day.missingCount})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-200">
              {visibleDailyBreakdown.length > 0 ? (
                visibleDailyBreakdown.map(day => (
                  <div key={day.dateStr} className="p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{day.fullDateLabel}</h4>
                        <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                          พนักงานทั้งหมด {day.totalEmployees} คน · สแกนแล้ว <span className="text-emerald-600 font-semibold">{day.scannedCount} คน</span> · ไม่สแกน <span className="text-rose-600 font-semibold">{day.missingCount} คน</span>
                        </p>
                      </div>
                    </div>

                    {day.missingEmployees.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {day.missingEmployees.map((emp, idx) => (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <span className="text-xs font-bold text-slate-400 tabular-nums w-5 shrink-0">
                                {idx + 1}.
                              </span>
                              <span className="font-semibold text-slate-800 truncate">{emp.name}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-500 shrink-0 ml-2">
                              {emp.department || 'IE'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 px-4 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-sm text-emerald-700 font-semibold flex items-center">
                        <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
                        พนักงานสแกนเช็คอินครบทุกคนในวันนี้
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center justify-center space-y-2">
                  <Users className="w-6 h-6 text-slate-400" />
                  <span>ยังไม่มีประวัติวันที่เปิดสแกนในรอบเวลานี้</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal แสดงรายชื่อพนักงานเมื่อกดเมนูใน ภาพรวม รายเดือน / รายสัปดาห์ */}
          {activeOverviewCategory && (() => {
            const categoryMeta = {
              onTime: {
                title: 'รายชื่อพนักงาน — เช็คอินตรงเวลา',
                subtitle: 'พนักงานที่สแกนเช็คอินทันตามเวลาที่กำหนด',
                unit: 'ครั้ง',
                accentText: 'text-emerald-600',
                headerBg: 'bg-slate-900',
                employees: onTimeEmployees,
                totalOccurrences: totalOnTime,
                getCount: (emp: typeof baseReportData[0]) => emp.onTime,
                getDetails: (emp: typeof baseReportData[0]) => emp.onTimeDetails,
                detailPrefix: 'วันที่ตรงเวลา:',
              },
              late: {
                title: 'รายชื่อพนักงาน — เช็คอินสาย',
                subtitle: 'พนักงานที่สแกนเช็คอินหลังเวลาที่กำหนด',
                unit: 'ครั้ง',
                accentText: 'text-amber-600',
                headerBg: 'bg-slate-900',
                employees: lateEmployees,
                totalOccurrences: totalLate,
                getCount: (emp: typeof baseReportData[0]) => emp.late,
                getDetails: (emp: typeof baseReportData[0]) => emp.lateDetails,
                detailPrefix: 'วันที่มาสาย:',
              },
              missing: {
                title: 'รายชื่อพนักงาน — ไม่สแกนเช็คอิน',
                subtitle: 'พนักงานที่ไม่ได้สแกนเช็คอินในวันที่มีการเปิดระบบ',
                unit: 'วัน',
                accentText: 'text-slate-700',
                headerBg: 'bg-slate-900',
                employees: missingEmployeesList,
                totalOccurrences: totalMissing,
                getCount: (emp: typeof baseReportData[0]) => emp.missingDays,
                getDetails: (emp: typeof baseReportData[0]) => emp.missedShortLabels,
                detailPrefix: 'วันที่ไม่สแกน:',
              },
              skipMeeting: {
                title: 'รายชื่อพนักงาน — ประชุม (ไม่เข้า)',
                subtitle: 'พนักงานที่สแกนเช็คอินแต่เลือกไม่เข้าร่วมประชุมเช้าพร้อมเหตุผล',
                unit: 'ครั้ง',
                accentText: 'text-rose-600',
                headerBg: 'bg-slate-900',
                employees: skipMeetingEmployees,
                totalOccurrences: totalSkipMeeting,
                getCount: (emp: typeof baseReportData[0]) => emp.skipMeeting,
                getDetails: (emp: typeof baseReportData[0]) => emp.skipReasonDetails,
                detailPrefix: 'รายละเอียด:',
              },
            }[activeOverviewCategory];

            const filteredModalEmployees = modalSearchQuery.trim()
              ? categoryMeta.employees.filter(
                  emp =>
                    emp.name.toLowerCase().includes(modalSearchQuery.trim().toLowerCase()) ||
                    emp.department.toLowerCase().includes(modalSearchQuery.trim().toLowerCase())
                )
              : categoryMeta.employees;

            return (
              <div
                className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
                onClick={() => setActiveOverviewCategory(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className={`${categoryMeta.headerBg} px-6 py-4 text-white flex items-start justify-between gap-4`}>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">{categoryMeta.title}</h3>
                      <p className="text-xs text-slate-300 mt-1 tabular-nums">
                        {periodLabel} · {selectedDept === 'ALL' ? 'ทุกแผนก' : `แผนก ${selectedDept}`} · พนักงาน{' '}
                        <strong className="text-white">{categoryMeta.employees.length} คน</strong> · รวมทั้งหมด{' '}
                        <strong className="text-white">{categoryMeta.totalOccurrences} {categoryMeta.unit}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveOverviewCategory(null)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                      title="ปิดหน้าต่าง (ESC)"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Category Tabs + Search Bar */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveOverviewCategory('onTime')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          activeOverviewCategory === 'onTime'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        เช็คอินตรงเวลา ({onTimeEmployees.length} คน / {totalOnTime})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveOverviewCategory('late')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          activeOverviewCategory === 'late'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        เช็คอินสาย ({lateEmployees.length} คน / {totalLate})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveOverviewCategory('missing')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          activeOverviewCategory === 'missing'
                            ? 'bg-slate-700 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ไม่สแกนเช็คอิน ({missingEmployeesList.length} คน / {totalMissing})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveOverviewCategory('skipMeeting')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          activeOverviewCategory === 'skipMeeting'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ประชุม (ไม่เข้า) ({skipMeetingEmployees.length} คน / {totalSkipMeeting})
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={modalSearchQuery}
                          onChange={(e) => setModalSearchQuery(e.target.value)}
                          placeholder="ค้นหาชื่อพนักงาน หรือ แผนก..."
                          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setTableCategoryFilter(activeOverviewCategory);
                          setActiveOverviewCategory(null);
                          const el = document.getElementById('individual-summary-table');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        กรองดูในตารางด้านล่าง
                      </button>
                    </div>
                  </div>

                  {/* Employee List Body */}
                  <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-2.5">
                    {filteredModalEmployees.length > 0 ? (
                      filteredModalEmployees.map((emp, idx) => {
                        const count = categoryMeta.getCount(emp);
                        const details = categoryMeta.getDetails(emp);
                        return (
                          <div
                            key={emp.id}
                            className="p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-start justify-between gap-2 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-xs font-bold text-slate-400 tabular-nums w-6 shrink-0">
                                  {idx + 1}.
                                </span>
                                <span className="font-bold text-slate-900">{emp.name}</span>
                                <span className="text-slate-300" aria-hidden="true">·</span>
                                <span className="text-xs font-semibold text-blue-700">แผนก {emp.department}</span>
                                {activeOverviewCategory === 'late' && (
                                  <>
                                    <span className="text-slate-300" aria-hidden="true">·</span>
                                    <span className="text-xs text-slate-500 tabular-nums">
                                      ช่วงเวลาที่กำหนด {emp.designatedTimeRange}
                                    </span>
                                  </>
                                )}
                              </div>
                              {details.length > 0 && (
                                <p className="text-xs text-slate-500 pl-8 mt-1 leading-relaxed tabular-nums">
                                  <span className="font-semibold text-slate-600 mr-1.5">{categoryMeta.detailPrefix}</span>
                                  {details.join(' · ')}
                                </p>
                              )}
                            </div>

                            <div className="pl-8 sm:pl-0 sm:text-right shrink-0 tabular-nums">
                              <span className={`text-base font-bold ${categoryMeta.accentText}`}>
                                {count} {categoryMeta.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-12 text-center text-slate-500 text-sm">
                        ไม่พบรายชื่อพนักงานในหมวดหมู่นี้สำหรับเงื่อนไขที่เลือก
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs text-slate-500 tabular-nums">
                      แสดง {filteredModalEmployees.length} จาก {categoryMeta.employees.length} คน
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveOverviewCategory(null)}
                      className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                    >
                      ปิดหน้าต่าง
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Modal: ประวัติการสแกนรายบุคคล (Individual Employee Scan History) */}
      {selectedEmployeeDetail && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setSelectedEmployeeDetail(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-5 sm:p-6 border-b-4 border-blue-500 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-md">
                    {selectedEmployeeDetail.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                        {selectedEmployeeDetail.name}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600/90 text-white border border-blue-400/40">
                        แผนก {selectedEmployeeDetail.department}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                      <span>เวลาเข้าประชุม: <strong className="text-white">{selectedEmployeeDetail.designatedTimeRange} น.</strong></span>
                      <span className="text-slate-500" aria-hidden="true">·</span>
                      <span>รอบรายงาน: <strong className="text-cyan-300">{periodLabel}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleExportSingleEmployee(selectedEmployeeDetail)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                    title="ดาวน์โหลดประวัติการสแกนของคนนี้เป็นไฟล์ Excel"
                  >
                    <Download className="w-4 h-4" />
                    <span>ส่งออก Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeDetail(null)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="ปิดหน้าต่าง (ESC)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 4 KPI Summary Cards for This Employee */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-5">
                <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/80 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    คะแนนสะสม ({monthShortLabel})
                  </span>
                  <div className="text-xl sm:text-2xl font-extrabold text-purple-400 tabular-nums mt-1 flex items-center gap-1.5">
                    <Award className="w-5 h-5 text-purple-400 shrink-0" />
                    <span>{selectedEmployeeDetail.totalPoints}</span>
                    <span className="text-xs font-normal text-slate-400">คะแนน</span>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/80 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    สแกนสำเร็จ / วันทำการ
                  </span>
                  <div className="text-xl sm:text-2xl font-extrabold text-blue-400 tabular-nums mt-1">
                    <span>{selectedEmployeeDetail.total}</span>
                    <span className="text-slate-400 text-sm"> / {selectedEmployeeDetail.requiredDays} วัน</span>
                    <span className="text-[11px] font-semibold text-emerald-400 ml-1.5">
                      ({Math.round((selectedEmployeeDetail.total / Math.max(1, selectedEmployeeDetail.requiredDays)) * 100)}%)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/80 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    ความตรงเวลา (ตรง / สาย)
                  </span>
                  <div className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 flex items-center gap-2">
                    <span className="text-emerald-400">{selectedEmployeeDetail.onTime} ตรง</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-amber-400">{selectedEmployeeDetail.late} สาย</span>
                  </div>
                  {selectedEmployeeDetail.late > 0 && (
                    <span className="text-[10px] text-amber-300/80 mt-0.5 truncate">
                      สายเฉลี่ย {selectedEmployeeDetail.avgDelayMinutes} นาที (สูงสุด {selectedEmployeeDetail.maxDelayMinutes} น.)
                    </span>
                  )}
                </div>

                <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/80 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    การประชุมเช้า (เข้า / ไม่เข้า)
                  </span>
                  <div className="text-lg sm:text-xl font-extrabold tabular-nums mt-1 flex items-center gap-2">
                    <span className="text-cyan-400">{selectedEmployeeDetail.joinMeeting} เข้า</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-rose-400">{selectedEmployeeDetail.skipMeeting} ขาด</span>
                  </div>
                  {selectedEmployeeDetail.missingDays > 0 && (
                    <span className="text-[10px] text-rose-300/80 mt-0.5">
                      ไม่สแกน {selectedEmployeeDetail.missingDays} วันทำการ
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter Tabs and Search Bar inside Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              {(() => {
                const timeline = selectedEmployeeDetail.dailyTimeline || [];
                const onTimeCount = timeline.filter((t: any) => t.status === 'on-time').length;
                const lateCount = timeline.filter((t: any) => t.status === 'late').length;
                const missingCount = timeline.filter((t: any) => t.status === 'missing').length;
                const skipCount = timeline.filter((t: any) => t.meetingStatus === 'skip').length;

                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDetailTimelineFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors tabular-nums ${
                        detailTimelineFilter === 'ALL'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      ทั้งหมด ({timeline.length} วัน)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTimelineFilter('on-time')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors tabular-nums ${
                        detailTimelineFilter === 'on-time'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      ตรงเวลา ({onTimeCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTimelineFilter('late')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors tabular-nums ${
                        detailTimelineFilter === 'late'
                          ? 'bg-amber-500 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      สาย ({lateCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTimelineFilter('missing')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors tabular-nums ${
                        detailTimelineFilter === 'missing'
                          ? 'bg-slate-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      ไม่ได้สแกน ({missingCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTimelineFilter('skip')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors tabular-nums ${
                        detailTimelineFilter === 'skip'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      ประชุม (ไม่เข้า) ({skipCount})
                    </button>
                  </div>
                );
              })()}

              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={detailTimelineSearch}
                  onChange={(e) => setDetailTimelineSearch(e.target.value)}
                  placeholder="ค้นหาวันที่, เหตุผล, เวลา..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Timeline / Scan History List */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {(() => {
                const allItems = selectedEmployeeDetail.dailyTimeline || [];
                const filtered = allItems.filter((item: any) => {
                  if (detailTimelineFilter === 'on-time' && item.status !== 'on-time') return false;
                  if (detailTimelineFilter === 'late' && item.status !== 'late') return false;
                  if (detailTimelineFilter === 'missing' && item.status !== 'missing') return false;
                  if (detailTimelineFilter === 'skip' && item.meetingStatus !== 'skip') return false;

                  if (detailTimelineSearch.trim()) {
                    const q = detailTimelineSearch.trim().toLowerCase();
                    const matchDate = (item.dateStr || '').toLowerCase().includes(q);
                    const matchLabel = (item.fullDateLabel || '').toLowerCase().includes(q);
                    const matchReason = (item.skipReason || '').toLowerCase().includes(q);
                    const matchTime = (item.scanTime || '').toLowerCase().includes(q);
                    const matchDev = (item.deviceLabel || '').toLowerCase().includes(q);
                    return matchDate || matchLabel || matchReason || matchTime || matchDev;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
                      <CalendarX className="w-12 h-12 mb-2 opacity-40 text-slate-400" />
                      <p className="font-bold text-slate-600">ไม่พบประวัติการสแกนตามตัวกรองที่เลือก</p>
                      <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold whitespace-nowrap">
                          <th className="py-3 px-3.5 w-12 text-center">ลำดับ</th>
                          <th className="py-3 px-3.5">วันที่ (วันทำการ)</th>
                          <th className="py-3 px-3.5 text-center">เวลาสแกน</th>
                          <th className="py-3 px-3.5 text-center">ผลการเช็คอิน</th>
                          <th className="py-3 px-3.5 text-center">คะแนน</th>
                          <th className="py-3 px-3.5">การประชุมเช้า</th>
                          <th className="py-3 px-3.5">อุปกรณ์ / ความปลอดภัย</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((row: any, idx: number) => {
                          const isMissed = row.status === 'missing';
                          const isLate = row.status === 'late';
                          const isOnTime = row.status === 'on-time';

                          return (
                            <tr
                              key={row.dateStr}
                              className={`hover:bg-slate-50 transition-colors ${
                                isMissed ? 'bg-rose-50/20' : ''
                              }`}
                            >
                              <td className="py-3 px-3.5 text-center text-slate-400 font-medium tabular-nums">
                                {idx + 1}
                              </td>

                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="font-bold text-slate-900">{row.shortDateLabel}</div>
                                <div className="text-[11px] text-slate-500">{row.fullDateLabel}</div>
                              </td>

                              <td className="py-3 px-3.5 text-center tabular-nums whitespace-nowrap">
                                {isMissed ? (
                                  <span className="text-slate-400 font-medium">-</span>
                                ) : (
                                  <span className="font-bold text-slate-800">{row.scanTime} น.</span>
                                )}
                              </td>

                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                {isOnTime ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>ตรงเวลา</span>
                                  </span>
                                ) : isLate ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                    <span>สาย ({row.delayMinutes} นาที)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <CalendarX className="w-3.5 h-3.5 text-rose-600" />
                                    <span>ไม่ได้สแกน</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3.5 text-center font-bold tabular-nums whitespace-nowrap">
                                {row.earnedPoints > 0 ? (
                                  <span className="text-purple-600">+{row.earnedPoints}</span>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>

                              <td className="py-3 px-3.5">
                                {isMissed ? (
                                  <span className="text-slate-400 text-xs">-</span>
                                ) : row.meetingStatus === 'join' ? (
                                  <div className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>เข้าร่วมประชุมเช้า</span>
                                  </div>
                                ) : row.meetingStatus === 'skip' ? (
                                  <div className="space-y-0.5 max-w-xs">
                                    <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                      <span>ไม่เข้าร่วม (ติดภารกิจ)</span>
                                    </span>
                                    {row.skipReason && (
                                      <p className="text-[11px] text-slate-600 leading-tight">
                                        เหตุผล: <strong className="text-slate-800">{row.skipReason}</strong>
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs">N/A</span>
                                )}
                              </td>

                              <td className="py-3 px-3.5 text-xs text-slate-600 max-w-xs">
                                {isMissed ? (
                                  <span className="text-slate-400">-</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-medium text-slate-800 truncate">
                                      <Smartphone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                      <span className="truncate">{row.deviceLabel !== '-' ? row.deviceLabel : 'สมาร์ตโฟน'}</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                                      <ShieldCheck className="w-3 h-3" />
                                      <span>Verified 1:1 Device Binding</span>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>ประวัติการสแกนถูกบันทึกแบบเรียลไทม์ พร้อมตรวจสอบความปลอดภัย 1 เครื่องต่อ 1 บัญชี</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => handleExportSingleEmployee(selectedEmployeeDetail)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>ดาวน์โหลด Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeDetail(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors whitespace-nowrap shadow-xs"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
