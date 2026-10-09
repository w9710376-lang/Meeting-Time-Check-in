import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, eachDayOfInterval, isAfter, startOfDay, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Download, BarChart2, CheckCircle2, Clock, CalendarDays, CalendarX, ChevronLeft, ChevronRight, UserX, Users, Search, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

type Period = 'weekly' | 'monthly';
type OverviewCategory = 'onTime' | 'late' | 'missing' | 'skipMeeting';

export function SummaryReport() {
  const { profile, departments } = useAuth();
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

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

  useEffect(() => {
    if (!activeOverviewCategory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveOverviewCategory(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOverviewCategory]);

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

  // Determine active dates in the selected period up to today
  const trackedDates = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');

    // Unique dates that had check-in records in this period
    const activeSet = new Set<string>();
    checkIns.forEach(c => {
      if (c.dateStr && c.dateStr >= startStr && c.dateStr <= endStr) {
        activeSet.add(c.dateStr);
      }
    });

    // If today is within the selected period, always include today so managers can see today's unscanned employees immediately
    if (todayStr >= startStr && todayStr <= endStr) {
      activeSet.add(todayStr);
    }

    if (showAllCalendarDays) {
      const days = eachDayOfInterval({ start: periodStart, end: periodEnd });
      days.forEach(d => {
        if (!isAfter(startOfDay(d), today)) {
          activeSet.add(format(d, 'yyyy-MM-dd'));
        }
      });
    }

    return Array.from(activeSet).sort((a, b) => a.localeCompare(b));
  }, [checkIns, startStr, endStr, periodStart, periodEnd, showAllCalendarDays]);

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
      // Sort check-ins chronologically for clean date display
      const empCheckIns = checkIns
        .filter(c => c.userId === emp.id)
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      const scannedDateSet = new Set(empCheckIns.map(c => c.dateStr));
      const empMonthlyCheckIns = monthlyCheckIns.filter(c => c.userId === emp.id);
      const monthlyPoints = empMonthlyCheckIns.reduce((sum, c) => sum + (c.earnedPoints || 0), 0);

      const onTimeCheckIns = empCheckIns.filter(c => c.status === 'on-time');
      const lateCheckIns = empCheckIns.filter(c => c.status === 'late');
      const joinCheckIns = empCheckIns.filter(c => c.meetingStatus === 'join');
      const skipCheckIns = empCheckIns.filter(c => c.meetingStatus === 'skip');

      const onTime = onTimeCheckIns.length;
      const late = lateCheckIns.length;
      const joinMeeting = joinCheckIns.length;
      const skipMeeting = skipCheckIns.length;

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

      const lateDetails = lateCheckIns.map(c => {
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

      return {
        id: emp.id,
        name: emp.name,
        department: emp.department || 'IE',
        totalPoints: monthlyPoints,
        total: empCheckIns.length,
        missingDays: missedDateStrs.length,
        missedDateStrs,
        missedShortLabels,
        onTime,
        onTimeDetails,
        late,
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
  }, [filteredEmployees, checkIns, monthlyCheckIns, trackedDates]);

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
        [`คะแนนสะสมรายเดือน (${monthShortLabel})`]: data.totalPoints,
        'มาสแกน (วัน)': data.total,
        'ไม่สแกน (วัน)': data.missingDays,
        'วันที่ไม่สแกน': data.missedShortLabels.length > 0 ? data.missedShortLabels.join(', ') : 'สแกนครบทุกวัน',
        'ตรงเวลา (วัน)': data.onTime,
        'มาสาย (วัน)': data.late,
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

  const periodLabel = period === 'weekly' 
    ? `สัปดาห์ที่ ${format(periodStart, 'd MMM', { locale: th })} - ${format(periodEnd, 'd MMM yyyy', { locale: th })}`
    : `เดือน ${format(periodStart, 'MMMM yyyy', { locale: th })}`;

  const visibleDailyBreakdown = selectedDayFilter === 'ALL'
    ? dailyMissingBreakdown
    : dailyMissingBreakdown.filter(d => d.dateStr === selectedDayFilter);

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
                {periodLabel} · วันที่มีการเช็คอิน {trackedDates.length} วัน · <span className="text-blue-600 font-semibold">กดที่เมนูเพื่อดูรายชื่อพนักงาน</span>
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
                      <UserX className="w-4 h-4 mr-2 text-slate-600 shrink-0" /> ไม่สแกนเช็คอิน (รวมครั้ง)
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
                    คำนวณวันไม่สแกนจากวันที่มีการเปิดเช็คอินในรอบนี้ทั้งหมด <strong className="text-slate-800 tabular-nums">{trackedDates.length} วัน</strong> · <span className="text-purple-600 font-semibold">คะแนนสะสมคิดเฉพาะรายเดือน ({monthShortLabel})</span>
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
                    {showAllCalendarDays ? 'นับทุกวันในปฏิทิน' : 'นับเฉพาะวันที่มีการสแกน'}
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
                    <th className="py-4 px-4 text-center">มาสแกน (วัน)</th>
                    <th className="py-4 px-4 text-center text-rose-600">ไม่สแกน (วัน)</th>
                    <th className="py-4 px-4">วันที่ไม่สแกนในแต่ละวัน</th>
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
                        <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">{data.name}</td>
                        <td className="py-3 px-4 text-center text-xs font-bold text-blue-700 tabular-nums">
                          {data.department}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-purple-600 tabular-nums">{data.totalPoints}</td>
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
                            <span className="text-emerald-600 font-medium">สแกนครบทุกวัน</span>
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
                      <td colSpan={11} className="py-8 text-center text-slate-500">
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
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-xs font-bold text-slate-400 tabular-nums w-6 shrink-0">
                                  {idx + 1}.
                                </span>
                                <span className="font-bold text-slate-900">{emp.name}</span>
                                <span className="text-slate-300" aria-hidden="true">·</span>
                                <span className="text-xs font-semibold text-blue-700">แผนก {emp.department}</span>
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
    </div>
  );
}
