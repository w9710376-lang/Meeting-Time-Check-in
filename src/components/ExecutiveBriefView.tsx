import React, { useState, useMemo } from 'react';
import { CheckIn, Department, Employee } from '../types';
import { format } from 'date-fns';
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Trophy,
  Users,
  Clock,
  Award,
  Building2,
  X,
  Send,
} from 'lucide-react';

interface ExecutiveBriefViewProps {
  selectedDept: 'ALL' | Department;
  departments: Department[];
  onSelectDept: (dept: 'ALL' | Department) => void;
  scopedDept: Department | null;
  employees: Employee[];
  todayCheckIns: CheckIn[];
  filteredEmployees: Employee[];
  filteredCheckIns: CheckIn[];
  missingEmployees: Employee[];
  monthlyPointsMap: Record<string, number>;
  defaultTimeRange: string;
  deptTimeRanges: Partial<Record<Department, string>>;
  isTodayNonWorking: boolean;
}

function parseCutoffMinutes(timeRange: string): { startMins: number; endMins: number } {
  let startHours = 7;
  let startMinutes = 30;
  let endHours = 7;
  let endMinutes = 45;

  const parts = (timeRange || '07:30-07:45').split('-');
  if (parts.length === 2) {
    const s = parts[0].trim().split(':');
    const e = parts[1].trim().split(':');
    if (s.length >= 2) {
      const sh = parseInt(s[0], 10);
      const sm = parseInt(s[1], 10);
      if (!isNaN(sh) && !isNaN(sm)) {
        startHours = sh;
        startMinutes = sm;
      }
    }
    if (e.length >= 2) {
      const eh = parseInt(e[0], 10);
      const em = parseInt(e[1], 10);
      if (!isNaN(eh) && !isNaN(em)) {
        endHours = eh;
        endMinutes = em;
      }
    }
  }
  return {
    startMins: startHours * 60 + startMinutes,
    endMins: endHours * 60 + endMinutes,
  };
}

function getCheckInMinuteOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  return d.getHours() * 60 + d.getMinutes();
}

export function ExecutiveBriefView({
  selectedDept,
  departments,
  onSelectDept,
  scopedDept,
  employees,
  todayCheckIns,
  filteredEmployees,
  filteredCheckIns,
  missingEmployees,
  monthlyPointsMap,
  defaultTimeRange,
  deptTimeRanges,
  isTodayNonWorking,
}: ExecutiveBriefViewProps) {
  const [remindedIds, setRemindedIds] = useState<Record<string, string>>({});
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [activeReminderModal, setActiveReminderModal] = useState<{
    title: string;
    message: string;
    targetCount: number;
  } | null>(null);
  const [selectedTimingCategory, setSelectedTimingCategory] = useState<
    'early' | 'just-in-time' | 'late' | 'missing' | null
  >(null);

  const empDeptMap = useMemo(
    () => new Map(employees.map((e) => [e.id, (e.department || 'IE').trim().toUpperCase()])),
    [employees]
  );

  const getDeptTimeRange = (dept?: string) => {
    const norm = (dept || 'IE').trim().toUpperCase();
    return deptTimeRanges[norm] || defaultTimeRange || '07:30-07:45';
  };

  // Classify each check-in into Early vs Just-In-Time vs Late
  // Early ("เช็คอินก่อนเวลา"): checked in at least 5 minutes before cutoff (or before window start)
  // Just-In-Time ("ทันเวลาพอดี"): checked in on-time within 0-4 minutes before cutoff
  // Late ("สาย"): status === 'late'
  const timingBreakdown = useMemo(() => {
    const earlyList: { checkIn: CheckIn; earlyMins: number }[] = [];
    const justInTimeList: { checkIn: CheckIn; earlyMins: number }[] = [];
    const lateList: { checkIn: CheckIn; lateMins: number }[] = [];

    filteredCheckIns.forEach((c) => {
      const dept = c.department || empDeptMap.get(c.userId) || 'IE';
      const rangeStr = c.designatedTimeRange || getDeptTimeRange(dept);
      const { startMins, endMins } = parseCutoffMinutes(rangeStr);
      const checkInMins = getCheckInMinuteOfDay(c.timestamp);
      const diffFromEnd = endMins - checkInMins;

      if (c.status === 'late' || diffFromEnd < 0) {
        lateList.push({
          checkIn: c,
          lateMins: Math.max(1, c.delayMinutes || Math.abs(diffFromEnd)),
        });
      } else {
        // On-time: distinguish Early vs Just-in-time
        // If checked in <= startMins + 50% of window OR >= 5 mins before endMins -> Early
        const windowSpan = Math.max(1, endMins - startMins);
        const earlyThreshold = Math.min(5, Math.floor(windowSpan * 0.35));
        if (diffFromEnd >= earlyThreshold) {
          earlyList.push({
            checkIn: c,
            earlyMins: Math.max(1, diffFromEnd),
          });
        } else {
          justInTimeList.push({
            checkIn: c,
            earlyMins: Math.max(0, diffFromEnd),
          });
        }
      }
    });

    return { earlyList, justInTimeList, lateList };
  }, [filteredCheckIns, empDeptMap, deptTimeRanges, defaultTimeRange]);

  const totalCount = filteredEmployees.length;
  const checkedInCount = filteredCheckIns.length;
  const earlyCount = timingBreakdown.earlyList.length;
  const justInTimeCount = timingBreakdown.justInTimeList.length;
  const onTimeTotalCount = earlyCount + justInTimeCount;
  const lateCount = timingBreakdown.lateList.length;
  const missingCount = isTodayNonWorking ? 0 : Math.max(0, totalCount - checkedInCount);

  const safeDenom = Math.max(1, totalCount || checkedInCount);

  // 1. Daily Attendance %
  const attendanceRate =
    totalCount > 0 || checkedInCount > 0
      ? Math.min(100, Math.round((checkedInCount / safeDenom) * 100))
      : 0;

  // 2. On-Time Rate % (calculated against total active workforce, or checked-in if total is 0)
  const onTimeRate =
    totalCount > 0 || checkedInCount > 0
      ? Math.min(100, Math.round((onTimeTotalCount / safeDenom) * 100))
      : 0;

  // 3. Punctuality Index Grade
  const punctualityGrade = useMemo(() => {
    if (totalCount === 0 && checkedInCount === 0) {
      return {
        level: 'N/A',
        label: 'Waiting for Data',
        subtext: 'รอข้อมูลการเช็คอินวันนี้',
        colorClass: 'text-slate-500',
      };
    }
    if (isTodayNonWorking && checkedInCount === 0) {
      return {
        level: 'Holiday',
        label: 'Non-Working Day',
        subtext: 'วันหยุด (ไม่ต้องสแกนเช็คอิน)',
        colorClass: 'text-amber-600',
      };
    }
    if (onTimeRate >= 90) {
      return {
        level: 'Level A+',
        label: 'Outstanding',
        subtext: 'วินัยการเข้าประชุมยอดเยี่ยมมาก',
        colorClass: 'text-emerald-600',
      };
    }
    if (onTimeRate >= 80) {
      return {
        level: 'Level A',
        label: 'Excellent',
        subtext: 'อยู่ในเกณฑ์มาตรฐานระดับดีเยี่ยม',
        colorClass: 'text-emerald-600',
      };
    }
    if (onTimeRate >= 70) {
      return {
        level: 'Level B',
        label: 'Good',
        subtext: 'อยู่ในเกณฑ์ดี มีผู้มาสายเล็กน้อย',
        colorClass: 'text-blue-600',
      };
    }
    if (onTimeRate >= 55) {
      return {
        level: 'Level C',
        label: 'Monitor',
        subtext: 'ควรติดตามพนักงานที่ยังไม่เช็คอิน',
        colorClass: 'text-amber-600',
      };
    }
    return {
      level: 'Level D',
      label: 'Action Needed',
      subtext: 'รอเช็คอินหรือมาสายเกินเกณฑ์มาตรฐาน',
      colorClass: 'text-rose-600',
    };
  }, [onTimeRate, totalCount, checkedInCount, isTodayNonWorking]);

  // Donut Chart Percentages (Normalized to 100% when there are employees)
  const earlyPct = totalCount > 0 ? Math.round((earlyCount / safeDenom) * 100) : 0;
  const justInTimePct = totalCount > 0 ? Math.round((justInTimeCount / safeDenom) * 100) : 0;
  const latePct = totalCount > 0 ? Math.round((lateCount / safeDenom) * 100) : 0;
  const missingPct =
    totalCount > 0 ? Math.max(0, 100 - earlyPct - justInTimePct - latePct) : 0;

  // Department Bar Chart Stats
  const departmentStats = useMemo(() => {
    const deptList = scopedDept ? [scopedDept] : departments;
    return deptList
      .map((dept) => {
        const normDept = dept.trim().toUpperCase();
        const deptEmps = employees.filter(
          (e) => (e.department || 'IE').trim().toUpperCase() === normDept
        );
        const deptCheckins = todayCheckIns.filter(
          (c) => (c.department || empDeptMap.get(c.userId) || 'IE').trim().toUpperCase() === normDept
        );
        const deptOnTime = deptCheckins.filter((c) => c.status === 'on-time').length;
        const deptTotal = deptEmps.length;
        const pct =
          deptTotal > 0
            ? Math.min(100, Math.round((deptCheckins.length / deptTotal) * 100))
            : deptCheckins.length > 0
            ? 100
            : 0;
        const onTimeDeptPct =
          deptTotal > 0 ? Math.min(100, Math.round((deptOnTime / deptTotal) * 100)) : 0;

        return {
          dept,
          total: deptTotal,
          checkedIn: deptCheckins.length,
          onTime: deptOnTime,
          missing: Math.max(0, deptTotal - deptCheckins.length),
          pct,
          onTimeDeptPct,
        };
      })
      .sort((a, b) => b.pct - a.pct || b.checkedIn - a.checkedIn);
  }, [departments, scopedDept, employees, todayCheckIns, empDeptMap]);

  // Top 5 Early Leaderboard
  const top5Early = useMemo(() => {
    const onTimePool = [
      ...timingBreakdown.earlyList,
      ...timingBreakdown.justInTimeList,
    ].sort((a, b) => {
      // Sort by earliest timestamp first, or most minutes early
      if (b.earlyMins !== a.earlyMins) return b.earlyMins - a.earlyMins;
      return a.checkIn.timestamp - b.checkIn.timestamp;
    });

    return onTimePool.slice(0, 5).map((item, idx) => {
      const c = item.checkIn;
      const accumulatedPts = monthlyPointsMap[c.userId] ?? (c.earnedPoints || 0);
      return {
        rank: idx + 1,
        id: c.id,
        userId: c.userId,
        name: c.userName,
        department: c.department || empDeptMap.get(c.userId) || 'IE',
        earlyMins: item.earlyMins,
        checkInTimeStr: format(new Date(c.timestamp), 'HH:mm'),
        points: accumulatedPts,
        todayPoints: c.earnedPoints || 0,
      };
    });
  }, [timingBreakdown, monthlyPointsMap, empDeptMap]);

  // SVG Donut Chart Math (r = 52, circumference = 2 * PI * 52 = 326.73)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const donutSegments = [
    {
      key: 'early' as const,
      label: 'เช็คอินก่อนเวลา',
      pct: earlyPct,
      count: earlyCount,
      color: '#10B981', // Emerald 500
      textColor: 'text-emerald-700',
      dotColor: 'bg-emerald-500',
    },
    {
      key: 'just-in-time' as const,
      label: 'ทันเวลาพอดี',
      pct: justInTimePct,
      count: justInTimeCount,
      color: '#3B82F6', // Blue 500
      textColor: 'text-blue-700',
      dotColor: 'bg-blue-500',
    },
    {
      key: 'late' as const,
      label: 'สาย (Late)',
      pct: latePct,
      count: lateCount,
      color: '#F59E0B', // Amber 500
      textColor: 'text-amber-700',
      dotColor: 'bg-amber-500',
    },
    {
      key: 'missing' as const,
      label: 'ขาด/ยังไม่มา',
      pct: missingPct,
      count: missingCount,
      color: '#CBD5E1', // Slate 300
      textColor: 'text-slate-600',
      dotColor: 'bg-slate-400',
    },
  ];

  let cumulativePercent = 0;

  const handleRemindSingle = (emp: Employee) => {
    const nowTime = format(new Date(), 'HH:mm');
    const dept = emp.department || 'IE';
    const range = getDeptTimeRange(dept);
    const msg = `แจ้งเตือนเช็คอินประชุมเช้า (${format(new Date(), 'dd/MM/yyyy')})\nคุณ ${emp.name} (แผนก ${dept}) ยังไม่ได้สแกน QR เช็คอิน (เวลาที่กำหนด ${range} น.) กรุณาสแกนเช็คอินเข้าประชุมเช้าด้วยครับ`;

    setRemindedIds((prev) => ({ ...prev, [emp.id]: nowTime }));
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    setCopiedMessage(`คัดลอกข้อความแจ้งเตือน "${emp.name}" แล้ว (${nowTime} น.)`);
    setTimeout(() => setCopiedMessage(null), 3500);
  };

  const handleRemindAll = () => {
    if (missingEmployees.length === 0) return;
    const nowTime = format(new Date(), 'HH:mm');
    const nextReminded: Record<string, string> = { ...remindedIds };
    missingEmployees.forEach((emp) => {
      nextReminded[emp.id] = nowTime;
    });
    setRemindedIds(nextReminded);

    const groupedByDept: Record<string, string[]> = {};
    missingEmployees.forEach((emp) => {
      const d = emp.department || 'IE';
      if (!groupedByDept[d]) groupedByDept[d] = [];
      groupedByDept[d].push(emp.name);
    });

    const deptLines = Object.entries(groupedByDept)
      .map(([d, names]) => `• แผนก ${d} (${names.length} คน): ${names.join(', ')}`)
      .join('\n');

    const fullMsg = `ประกาศแจ้งเตือนเช็คอินประชุมเช้า (${format(new Date(), 'dd MMM yyyy')} เวลา ${nowTime} น.)\nขณะนี้มีพนักงานที่ยังไม่ได้สแกน QR Code จำนวน ${missingEmployees.length} คน:\n${deptLines}\n\nกรุณาสแกน QR Code เช็คอินเข้าประชุมเช้าด้วยครับ`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullMsg).catch(() => {});
    }

    setActiveReminderModal({
      title: `แจ้งเตือนพนักงานที่ยังไม่เช็คอินทั้งหมด (${missingEmployees.length} คน)`,
      message: fullMsg,
      targetCount: missingEmployees.length,
    });
  };

  return (
    <div className="space-y-4">
      {/* Row 1: 3 Minimal Data-Dense KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Daily Attendance */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">1. Daily Attendance</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {attendanceRate}%
            </span>
            <span className="text-sm font-semibold text-slate-600 tabular-nums">
              ({checkedInCount}/{totalCount} คน)
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 tabular-nums">
            <span>
              เข้าประชุม {filteredCheckIns.filter((c) => c.meetingStatus === 'join').length} คน
            </span>
            <span aria-hidden="true">·</span>
            <span>
              ติดภารกิจ {filteredCheckIns.filter((c) => c.meetingStatus === 'skip').length} คน
            </span>
          </div>
        </div>

        {/* Card 2: On-Time Rate */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">2. On-Time Rate</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-bold text-emerald-600 tabular-nums">
              {onTimeRate}%
            </span>
            <span className="text-sm font-medium text-slate-500 tabular-nums">
              ตรงเวลา {onTimeTotalCount} คน
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 tabular-nums">
            <span>ก่อนเวลา {earlyCount} คน</span>
            <span aria-hidden="true">·</span>
            <span>ทันเวลา {justInTimeCount} คน</span>
            <span aria-hidden="true">·</span>
            <span className={lateCount > 0 ? 'text-amber-600 font-semibold' : ''}>
              สาย {lateCount} คน
            </span>
          </div>
        </div>

        {/* Card 3: Punctuality Index */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">3. Punctuality Index</span>
            <Award className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${punctualityGrade.colorClass}`}>
              {punctualityGrade.level}
            </span>
            <span className="text-sm font-semibold text-slate-700">
              ({punctualityGrade.label})
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{punctualityGrade.subtext}</span>
            <span className="tabular-nums font-medium text-slate-600">
              เกณฑ์เวลา {selectedDept === 'ALL' ? defaultTimeRange : getDeptTimeRange(selectedDept)}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Donut Chart | Department Bar Chart | Top 5 Early Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Column 1: Donut Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">สัดส่วนเวลาการเช็คอิน</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  คลิกที่รายการเพื่อดูรายชื่อในแต่ละกลุ่ม
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 tabular-nums">
                รวม {totalCount} คน
              </span>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 my-2">
              {/* SVG Donut */}
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                  <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    fill="transparent"
                    stroke="#F1F5F9"
                    strokeWidth="14"
                  />
                  {totalCount > 0 &&
                    donutSegments.map((seg) => {
                      if (seg.pct <= 0) return null;
                      const strokeDasharray = `${(seg.pct / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((cumulativePercent / 100) * circumference);
                      cumulativePercent += seg.pct;
                      return (
                        <circle
                          key={seg.key}
                          cx="64"
                          cy="64"
                          r={radius}
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="14"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-300 cursor-pointer hover:opacity-80"
                          onClick={() =>
                            setSelectedTimingCategory(
                              selectedTimingCategory === seg.key ? null : seg.key
                            )
                          }
                        />
                      );
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl font-bold text-slate-900 tabular-nums">
                    {attendanceRate}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">เช็คอินแล้ว</span>
                </div>
              </div>

              {/* 4 Breakdown Rows */}
              <div className="w-full space-y-2">
                {donutSegments.map((seg) => {
                  const isSelected = selectedTimingCategory === seg.key;
                  return (
                    <button
                      key={seg.key}
                      type="button"
                      onClick={() =>
                        setSelectedTimingCategory(isSelected ? null : seg.key)
                      }
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-slate-100 ring-1 ring-slate-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${seg.dotColor}`} />
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {seg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                        <span className={`text-xs font-bold ${seg.textColor}`}>
                          {seg.pct}%
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({seg.count})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Drilldown Drawer inside Card if category clicked */}
          {selectedTimingCategory && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700">
                  {
                    donutSegments.find((s) => s.key === selectedTimingCategory)
                      ?.label
                  }
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTimingCategory(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                >
                  ปิด
                </button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-xs">
                {selectedTimingCategory === 'early' &&
                  (timingBreakdown.earlyList.length === 0 ? (
                    <p className="text-slate-400 py-1">ไม่มีรายการ</p>
                  ) : (
                    timingBreakdown.earlyList.map(({ checkIn, earlyMins }) => (
                      <div
                        key={checkIn.id}
                        className="flex justify-between text-slate-700 py-0.5 tabular-nums"
                      >
                        <span className="truncate">{checkIn.userName}</span>
                        <span className="text-emerald-600 font-semibold shrink-0">
                          {format(new Date(checkIn.timestamp), 'HH:mm')} (+{earlyMins}m)
                        </span>
                      </div>
                    ))
                  ))}
                {selectedTimingCategory === 'just-in-time' &&
                  (timingBreakdown.justInTimeList.length === 0 ? (
                    <p className="text-slate-400 py-1">ไม่มีรายการ</p>
                  ) : (
                    timingBreakdown.justInTimeList.map(({ checkIn }) => (
                      <div
                        key={checkIn.id}
                        className="flex justify-between text-slate-700 py-0.5 tabular-nums"
                      >
                        <span className="truncate">{checkIn.userName}</span>
                        <span className="text-blue-600 font-semibold shrink-0">
                          {format(new Date(checkIn.timestamp), 'HH:mm')} น.
                        </span>
                      </div>
                    ))
                  ))}
                {selectedTimingCategory === 'late' &&
                  (timingBreakdown.lateList.length === 0 ? (
                    <p className="text-slate-400 py-1">ไม่มีผู้มาสายวันนี้</p>
                  ) : (
                    timingBreakdown.lateList.map(({ checkIn }) => (
                      <div
                        key={checkIn.id}
                        className="flex justify-between text-slate-700 py-0.5 tabular-nums"
                      >
                        <span className="truncate">{checkIn.userName}</span>
                        <span className="text-amber-600 font-semibold shrink-0">
                          {format(new Date(checkIn.timestamp), 'HH:mm')} น.
                        </span>
                      </div>
                    ))
                  ))}
                {selectedTimingCategory === 'missing' &&
                  (missingEmployees.length === 0 ? (
                    <p className="text-slate-400 py-1">เช็คอินครบทุกคนแล้ว</p>
                  ) : (
                    missingEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex justify-between text-slate-700 py-0.5"
                      >
                        <span className="truncate">{emp.name}</span>
                        <span className="text-slate-400 shrink-0">
                          แผนก {emp.department || 'IE'}
                        </span>
                      </div>
                    ))
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Department Bar Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span>อัตราเช็คอินแยกตามแผนก</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  คลิกที่ชื่อแผนกเพื่อกรองข้อมูลเฉพาะแผนก
                </p>
              </div>
              {selectedDept !== 'ALL' && !scopedDept && (
                <button
                  type="button"
                  onClick={() => onSelectDept('ALL')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  ดูทุกแผนก
                </button>
              )}
            </div>

            <div className="space-y-3">
              {departmentStats.map((d) => {
                const isSelected = selectedDept === d.dept;
                const barColor =
                  d.pct >= 90
                    ? 'bg-emerald-500'
                    : d.pct >= 75
                    ? 'bg-blue-600'
                    : d.pct >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500';

                return (
                  <button
                    key={d.dept}
                    type="button"
                    onClick={() => {
                      if (scopedDept) return;
                      onSelectDept(selectedDept === d.dept ? 'ALL' : d.dept);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 ring-1 ring-blue-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800">
                        แผนก {d.dept}
                      </span>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className="text-slate-500">
                          {d.checkedIn}/{d.total} คน
                        </span>
                        <span className="font-bold text-slate-900 w-9 text-right">
                          {d.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${Math.max(d.pct, d.checkedIn > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 tabular-nums">
            <span>แผนกที่เช็คอินครบ 100%</span>
            <span className="font-bold text-slate-800">
              {departmentStats.filter((d) => d.total > 0 && d.pct === 100).length} /{' '}
              {departmentStats.length} แผนก
            </span>
          </div>
        </div>

        {/* Column 3: Leaderboard Top 5 Early (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>Leaderboard: Top 5 Early</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  พนักงานที่เช็คอินก่อนเวลาสูงสุดและคะแนนสะสมเดือนนี้
                </p>
              </div>
            </div>

            {top5Early.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                ยังไม่มีผู้เช็คอินตรงเวลาในวันนี้
              </div>
            ) : (
              <div className="space-y-2">
                {top5Early.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold tabular-nums shrink-0 ${
                          item.rank === 1
                            ? 'bg-amber-400 text-amber-950'
                            : item.rank === 2
                            ? 'bg-slate-300 text-slate-800'
                            : item.rank === 3
                            ? 'bg-orange-300 text-orange-950'
                            : 'bg-slate-200/70 text-slate-600'
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          แผนก {item.department} · {item.checkInTimeStr} น.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span className="text-emerald-600 font-semibold">
                        (+{item.earlyMins} min)
                      </span>
                      <span className="font-bold text-slate-900 min-w-[3.25rem] text-right">
                        {item.points} pt
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>เกณฑ์การให้คะแนน</span>
            <span className="tabular-nums text-slate-600">
              มาเช้า +10 pt · ทันเวลา +5/+2 pt
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Live Feed พนักงานที่ยังไม่เช็คอิน + ปุ่มเตือนรายบุคคล / เตือนทั้งหมด */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-rose-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 tabular-nums">
              Live Feed พนักงานที่ยังไม่เช็คอิน ({missingEmployees.length} คน)
            </h3>
            {copiedMessage && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {copiedMessage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={missingEmployees.length === 0}
              onClick={handleRemindAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>เตือนทั้งหมด ({missingEmployees.length} คน)</span>
            </button>
          </div>
        </div>

        {missingEmployees.length === 0 ? (
          <div className="py-6 text-center text-slate-500 flex items-center justify-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>พนักงานสแกนเช็คอินครบทุกคนแล้ว!</span>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {missingEmployees.map((emp) => {
              const remindedTime = remindedIds[emp.id];
              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{emp.name}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      แผนก {emp.department || 'IE'}
                      {remindedTime ? ` · เตือนแล้ว ${remindedTime}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemindSingle(emp)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      remindedTime
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                    title="คัดลอกข้อความเตือนรายบุคคล"
                  >
                    {remindedTime ? 'เตือนซ้ำ' : 'เตือนรายบุคคล'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal for Remind All summary & instant copy */}
      {activeReminderModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveReminderModal(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                {activeReminderModal.title}
              </h4>
              <button
                type="button"
                onClick={() => setActiveReminderModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                ระบบได้บันทึกสถานะการแจ้งเตือนและคัดลอกข้อความสรุปรายชื่อด้านล่างไปยังคลิปบอร์ดแล้ว สามารถนำไปวางในกลุ่ม LINE / ช่องทางสื่อสารของแผนกได้ทันที:
              </p>
              <pre className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                {activeReminderModal.message}
              </pre>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(activeReminderModal.message).catch(() => {});
                    }
                    setCopiedMessage('คัดลอกข้อความแจ้งเตือนทั้งหมดแล้ว');
                    setActiveReminderModal(null);
                    setTimeout(() => setCopiedMessage(null), 3500);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>คัดลอกข้อความอีกครั้ง</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
