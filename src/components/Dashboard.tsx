import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import QRCode from 'react-qr-code';
import { Download, Users, AlertCircle, CheckCircle2, CalendarCheck, CalendarX, Maximize2, Minimize2, Building2, X, Clock, Tv } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { MorningMeeting3DCard } from './MorningMeeting3DCard';
import { LiveMeetingSplitView } from './LiveMeetingSplitView';
import {
  getInitialCachedEmployees,
  saveCachedEmployees,
  saveCachedTodayCheckIns,
  saveCachedTimeRanges,
} from '../lib/checkinFastCache';
import { getNonWorkingDayInfo, isWorkingDay } from '../lib/thaiHolidays';
import { getCheckInWindowStatus } from '../lib/checkinTime';

export function Dashboard() {
  const { profile, departments } = useAuth();
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

  const [loading, setLoading] = useState(true);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([]);
  const [monthCheckIns, setMonthCheckIns] = useState<CheckIn[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(
    () => getInitialCachedEmployees().employees
  );
  const [selectedDept, setSelectedDept] = useState<'ALL' | Department>(scopedDept || 'ALL');

  const [currentTime, setCurrentTime] = useState(new Date());
  const [defaultTimeRange, setDefaultTimeRange] = useState('07:30-07:45');
  const [deptTimeRanges, setDeptTimeRanges] = useState<Partial<Record<Department, string>>>({});
  const [qrDept, setQrDept] = useState<Department>(
    scopedDept || ((localStorage.getItem('selected_checkin_dept') as Department) || departments[0] || 'IE')
  );
  const [qrUrl, setQrUrl] = useState('');
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'standard' | 'split'>('standard');

  const handleSelectQrDept = useCallback((dept: Department) => {
    if (scopedDept) return;
    setQrDept(dept);
    localStorage.setItem('selected_checkin_dept', dept);
  }, [scopedDept]);

  useEffect(() => {
    setSelectedDept(scopedDept || 'ALL');
    if (scopedDept) {
      setQrDept(scopedDept);
    }
  }, [scopedDept]);

  useEffect(() => {
    if (!isQrExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsQrExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQrExpanded]);

  const activeQrDept: Department = scopedDept || qrDept || departments[0] || 'IE';
  const activeQrTimeRange = deptTimeRanges[activeQrDept] || defaultTimeRange;
  const qrWindow = getCheckInWindowStatus(activeQrTimeRange, currentTime);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'checkin'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const nextDefault = data.targetTimeRange || '07:30-07:45';
        const nextDepts = data.departmentTimeRanges || {};
        if (data.targetTimeRange) {
          setDefaultTimeRange(data.targetTimeRange);
        }
        if (data.departmentTimeRanges) {
          setDeptTimeRanges(data.departmentTimeRanges);
        }
        saveCachedTimeRanges(nextDefault, nextDepts, true);
      }
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    const buildQrUrl = () => {
      const url = new URL(window.location.href);
      if (url.hostname.includes('ais-dev-')) {
        url.hostname = url.hostname.replace('ais-dev-', 'ais-pre-');
      }
      url.searchParams.set('mode', 'scan');
      url.searchParams.set('dept', activeQrDept);
      url.searchParams.set('tr', activeQrTimeRange);
      url.searchParams.set('t', Date.now().toString());
      return url.toString();
    };

    const win = getCheckInWindowStatus(activeQrTimeRange, new Date());
    if (win.isOpen) {
      setQrUrl(buildQrUrl());
    } else {
      setQrUrl('');
    }

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const currentWin = getCheckInWindowStatus(activeQrTimeRange, now);
      if (!currentWin.isOpen) {
        setQrUrl((prev) => (prev ? '' : prev));
      } else if (now.getSeconds() % 10 === 0) {
        setQrUrl(buildQrUrl());
      } else {
        setQrUrl((prev) => (prev ? prev : buildQrUrl()));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQrDept, activeQrTimeRange]);
  
  useEffect(() => {
    // Fetch active employees
    const unsubEmp = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        const isActive = raw.isActive ?? true;
        if (isActive !== false) {
          empData.push({ ...raw, id: docSnap.id, isActive: true } as Employee);
        }
      });
      if (empData.length > 0) {
        empData.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setEmployees(empData);
        saveCachedEmployees(empData, !snapshot.metadata.fromCache);
      }
    }, console.warn);

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const checkinsQ = query(collection(db, 'checkins'), where('dateStr', '==', todayStr));
    
    const unsubscribe = onSnapshot(checkinsQ, (snapshot) => {
      const checkinsData: CheckIn[] = [];
      snapshot.forEach((doc) => checkinsData.push(doc.data() as CheckIn));
      setTodayCheckIns(checkinsData);
      saveCachedTodayCheckIns(todayStr, checkinsData, !snapshot.metadata.fromCache);
      setLoading(false);
    }, (error: any) => {
      console.warn("Offline mode: Error fetching dashboard data:", error.message);
      setLoading(false);
    });

    const mStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const monthQ = query(
      collection(db, 'checkins'),
      where('dateStr', '>=', mStart),
      where('dateStr', '<=', mEnd)
    );
    const unsubMonth = onSnapshot(monthQ, (snapshot) => {
      const mData: CheckIn[] = [];
      snapshot.forEach((doc) => mData.push(doc.data() as CheckIn));
      setMonthCheckIns(mData);
    }, console.warn);

    return () => {
      unsubEmp();
      unsubscribe();
      unsubMonth();
    };
  }, []);

  const monthlyPointsMap: Record<string, number> = {};
  monthCheckIns.forEach((c) => {
    if (c.dateStr && isWorkingDay(c.dateStr)) {
      monthlyPointsMap[c.userId] = (monthlyPointsMap[c.userId] || 0) + (c.earnedPoints || 0);
    }
  });

  const todayHolidayInfo = getNonWorkingDayInfo(currentTime);
  const isTodayNonWorking = todayHolidayInfo !== null;

  const handleExport = async () => {
    try {
      const currentMonthPrefix = format(new Date(), 'yyyy-MM');
      const checkinsSnap = await getDocs(collection(db, 'checkins'));
      const empDeptMap = new Map(employees.map(e => [e.id, e.department || 'IE']));
      const allCheckins: any[] = [];
      checkinsSnap.forEach((doc) => {
        const data = doc.data() as CheckIn;
        if (!data.dateStr || !data.dateStr.startsWith(currentMonthPrefix)) return;
        if (!isWorkingDay(data.dateStr)) return;
        const dept = data.department || empDeptMap.get(data.userId) || 'IE';
        if (selectedDept !== 'ALL' && dept !== selectedDept) return;
        allCheckins.push({
          Name: data.userName,
          Department: dept,
          Date: data.dateStr,
          Time: format(new Date(data.timestamp), 'HH:mm:ss'),
          ArrivalStatus: data.status,
          Points: data.earnedPoints || 0,
          MonthlyAccumulatedPoints: monthlyPointsMap[data.userId] || 0,
          MeetingStatus: data.meetingStatus === 'join' ? 'เข้าร่วมประชุม' : data.meetingStatus === 'skip' ? 'ไม่เข้าร่วมประชุม' : 'N/A',
          SkipReason: data.meetingStatus === 'skip' ? (data.skipReason || 'ไม่ระบุเหตุผล') : '-',
          DeviceID: data.deviceId || '-',
          DeviceModel: data.deviceLabel || '-',
          SecurityVerification: 'ปกติ (Verified 1:1)',
        });
      });

      const ws = XLSX.utils.json_to_sheet(allCheckins);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CheckIns");
      XLSX.writeFile(wb, `CheckIn_Report_${selectedDept}_${format(new Date(), 'yyyy-MM')}.xlsx`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse font-bold">Loading Dashboard...</div>;
  }

  const empDeptMap = new Map(employees.map(e => [e.id, (e.department || 'IE').trim().toUpperCase()]));
  const filteredEmployees = selectedDept === 'ALL'
    ? employees
    : employees.filter(e => (e.department || 'IE').trim().toUpperCase() === selectedDept.trim().toUpperCase());

  const filteredCheckIns = selectedDept === 'ALL'
    ? todayCheckIns
    : todayCheckIns.filter(c => (c.department || empDeptMap.get(c.userId) || 'IE').trim().toUpperCase() === selectedDept.trim().toUpperCase());

  const totalEmployeesCount = filteredEmployees.length;
  const meetingJoinedCount = filteredCheckIns.filter(c => c.meetingStatus === 'join').length;
  const meetingSkippedCount = filteredCheckIns.filter(c => c.meetingStatus === 'skip').length;
  const onTimeCount = filteredCheckIns.filter(c => c.status === 'on-time').length;
  const lateCount = filteredCheckIns.filter(c => c.status === 'late').length;
  const missingCount = isTodayNonWorking
    ? 0
    : Math.max(0, totalEmployeesCount - filteredCheckIns.length);

  const denominator = Math.max(1, totalEmployeesCount || filteredCheckIns.length);
  const joinPct = totalEmployeesCount > 0 || filteredCheckIns.length > 0
    ? Math.round((meetingJoinedCount / denominator) * 100)
    : 0;
  const skipPct = totalEmployeesCount > 0 || filteredCheckIns.length > 0
    ? Math.round((meetingSkippedCount / denominator) * 100)
    : 0;
  const missingPct = totalEmployeesCount > 0 || filteredCheckIns.length > 0
    ? Math.max(0, 100 - joinPct - skipPct)
    : 0;

  const hasChartActivity = meetingJoinedCount + meetingSkippedCount + missingCount > 0;
  const chartData = hasChartActivity
    ? [
        { name: 'เข้าร่วมประชุมเช้า', value: meetingJoinedCount, color: '#10B981', pct: joinPct },
        { name: 'ไม่เข้าร่วม (ติดภารกิจ)', value: meetingSkippedCount, color: '#F43F5E', pct: skipPct },
        { name: 'รอสแกนเช็คอิน', value: missingCount, color: '#CBD5E1', pct: missingPct },
      ]
    : [{ name: 'ยังไม่มีข้อมูล', value: 1, color: '#F1F5F9', pct: 0 }];

  const activeCardTimeRange =
    selectedDept === 'ALL'
      ? defaultTimeRange
      : deptTimeRanges[selectedDept] || defaultTimeRange;

  const checkedInIds = new Set(filteredCheckIns.map(c => c.userId));
  const missingEmployees = filteredEmployees.filter(e => !checkedInIds.has(e.id));

  const qrDeptEmployees = employees.filter(
    e => (e.department || 'IE').trim().toUpperCase() === activeQrDept.trim().toUpperCase()
  );
  const qrDeptCheckIns = todayCheckIns.filter(
    c => (c.department || empDeptMap.get(c.userId) || 'IE').trim().toUpperCase() === activeQrDept.trim().toUpperCase()
  );
  const qrDeptCheckedInIds = new Set(qrDeptCheckIns.map(c => c.userId));
  const qrDeptMissingCount = qrDeptEmployees.filter(e => !qrDeptCheckedInIds.has(e.id)).length;


  if (viewMode === 'split') {
    return (
      <LiveMeetingSplitView
        departments={departments}
        scopedDept={scopedDept}
        selectedDept={selectedDept}
        onSelectDept={setSelectedDept}
        activeQrDept={activeQrDept}
        onSelectQrDept={handleSelectQrDept}
        activeQrTimeRange={activeQrTimeRange}
        defaultTimeRange={defaultTimeRange}
        deptTimeRanges={deptTimeRanges}
        employees={employees}
        filteredEmployees={filteredEmployees}
        todayCheckIns={todayCheckIns}
        filteredCheckIns={filteredCheckIns}
        missingEmployees={missingEmployees}
        meetingJoinedCount={meetingJoinedCount}
        meetingSkippedCount={meetingSkippedCount}
        onTimeCount={onTimeCount}
        lateCount={lateCount}
        missingCount={missingCount}
        joinPct={joinPct}
        skipPct={skipPct}
        missingPct={missingPct}
        monthlyPointsMap={monthlyPointsMap}
        todayHolidayInfo={todayHolidayInfo}
        onExitSplitMode={() => setViewMode('standard')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0 max-w-full">
        <div className="min-w-0 max-w-full">
          <h1 className="text-base sm:text-lg font-semibold text-slate-700 leading-snug">
            Executive Dashboard: <span className="text-blue-600 font-bold block sm:inline">{format(new Date(), 'MMM dd, yyyy')}</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!scopedDept && (
              <button
                type="button"
                onClick={() => setSelectedDept('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDept === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                ทุกแผนก
              </button>
            )}
            {(scopedDept ? [scopedDept] : departments).map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => {
                  setSelectedDept(dept);
                  handleSelectQrDept(dept);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDept === dept ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {scopedDept ? `แผนก ${dept}` : dept}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
          {/* TV/Projector presentation mode: visible on tablet/desktop/TV screen */}
          <button
            type="button"
            onClick={() => setViewMode(prev => prev === 'split' ? 'standard' : 'split')}
            className={`hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold items-center shadow-xs transition-all ${
              viewMode === 'split'
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/30'
                : 'bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 hover:from-blue-600 hover:to-slate-800 text-white'
            }`}
            title="เปิดโหมดจอคู่สำหรับทีวี/โปรเจกเตอร์หน้าห้องประชุม ให้สแกน QR ไปพร้อมกับดูแดชบอร์ด"
          >
            <Tv className="w-4 h-4 mr-1.5 text-cyan-300" />
            <span>{viewMode === 'split' ? 'กลับสู่มุมมองปกติ' : 'โหมดจอพรีเซนต์ (Split)'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsQrExpanded(true)}
            className="flex-1 sm:flex-initial bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center shadow-xs transition-colors whitespace-nowrap"
          >
            <Maximize2 className="w-4 h-4 mr-1.5 text-blue-400" />
            <span>ขยาย QR Code ({activeQrDept})</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center shadow-xs transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 mr-1.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {todayHolidayInfo && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-sm text-amber-900">
            <span className="font-bold">วันนี้เป็นวันหยุด ({todayHolidayInfo.name})</span>
            <span className="mx-2 text-amber-400" aria-hidden="true">·</span>
            <span className="text-amber-800">
              ระบบตัดวันเสาร์-อาทิตย์ และวันหยุดตามปฏิทินไทยออกอัตโนมัติ โดยไม่นำวันนี้มาคำนวณเป็นวันที่ต้องสแกน
            </span>
          </div>
          <span className="text-xs font-bold text-amber-700 shrink-0">ไม่ต้องสแกนเช็คอิน</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">รายชื่อพนักงาน ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})</p>
          <h2 className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{filteredEmployees.length}</h2>
          <div className="mt-2 flex items-center text-blue-600 text-xs font-bold">
            <Users className="w-3 h-3 mr-1" /> พนักงานที่เปิดใช้งาน
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">เข้าร่วมประชุมเช้า</p>
          <h2 className="text-3xl font-bold text-emerald-600 mt-1 tabular-nums">{meetingJoinedCount}</h2>
          <div className="mt-2 flex items-center text-emerald-600 text-xs font-bold">
            <CalendarCheck className="w-3 h-3 mr-1" /> เช็คอินสำเร็จ
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">ไม่เข้าร่วมประชุมเช้า</p>
          <h2 className="text-3xl font-bold text-rose-600 mt-1 tabular-nums">{meetingSkippedCount}</h2>
          <div className="mt-2 flex items-center text-rose-600 text-xs font-bold">
            <CalendarX className="w-3 h-3 mr-1" /> ติดภารกิจอื่น
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">ยังไม่สแกน QR Code</p>
          <h2 className="text-3xl font-bold text-slate-400 mt-1 tabular-nums">{Math.max(0, missingCount)}</h2>
          <div className="mt-2 flex items-center text-slate-400 text-xs font-bold">
            <AlertCircle className="w-3 h-3 mr-1" />{' '}
            {todayHolidayInfo ? `วันหยุด (${todayHolidayInfo.name})` : 'ขาดหาย'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-stretch">
        <MorningMeeting3DCard
          selectedDept={selectedDept}
          activeCardTimeRange={activeCardTimeRange}
          totalEmployeesCount={totalEmployeesCount}
          filteredCheckIns={filteredCheckIns}
          filteredEmployees={filteredEmployees}
          missingEmployees={missingEmployees}
          meetingJoinedCount={meetingJoinedCount}
          meetingSkippedCount={meetingSkippedCount}
          onTimeCount={onTimeCount}
          lateCount={lateCount}
          missingCount={missingCount}
          joinPct={joinPct}
          skipPct={skipPct}
          missingPct={missingPct}
        />

        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[27rem] lg:h-[37rem] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-lg">พนักงานที่ยังไม่เช็คอิน</h3>
            <span className="text-rose-600 text-xs font-bold tabular-nums">
              รอสแกน {missingEmployees.length} คน
            </span>
          </div>
          
          <div className="overflow-y-auto flex-1 pr-2">
            {missingEmployees.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-bold">สแกนครบทุกคนแล้ว!</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {missingEmployees.map(emp => (
                  <li key={emp.id} className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100">
                    <span className="font-bold text-sm text-slate-800">{emp.name}</span>
                    <span className="text-xs font-semibold text-slate-500">
                      แผนก {emp.department || 'IE'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 min-h-[27rem] lg:h-[37rem]">
          <Leaderboard checkIns={filteredCheckIns} monthlyPointsMap={monthlyPointsMap} />
        </div>
      </div>

      {/* Expanded QR Code Modal on Dashboard */}
      {isQrExpanded && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsQrExpanded(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 px-6 py-5 text-white border-b-4 border-blue-500 flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>แผนก {activeQrDept}</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight">สแกน QR Code เช็คอินเข้าประชุมเช้า</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  เวลาเข้าประชุม ({activeQrDept}): <strong className="text-white">{activeQrTimeRange} น.</strong> • เช็คอินแล้ว <strong className="text-emerald-400">{qrDeptCheckIns.length} คน</strong> • รอเช็คอิน <strong className="text-amber-400">{qrDeptMissingCount} คน</strong>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-3xl font-bold tabular-nums tracking-tight">
                    {format(currentTime, 'HH:mm')}
                    <span className="text-blue-400 text-xl">:{format(currentTime, 'ss')}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">{format(currentTime, 'EEE, MMM d')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrExpanded(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="ปิดหน้าต่างขยาย (ESC)"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {!scopedDept && departments.length > 1 && (
              <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 mr-1">เลือกแผนกสำหรับสแกน:</span>
                {departments.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleSelectQrDept(dept)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeQrDept === dept
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6 sm:p-8 bg-slate-50 flex flex-col items-center">
              {qrWindow.isOpen ? (
                <>
                  <div className="w-[min(76vw,420px)] h-[min(76vw,420px)] bg-white rounded-3xl p-6 border-4 border-blue-500 shadow-xl flex items-center justify-center">
                    {qrUrl && <QRCode value={qrUrl} size={380} className="w-full h-full text-slate-900" />}
                  </div>

                  <div className="mt-5 text-center">
                    <p className="text-base font-bold text-slate-800">
                      นำกล้องโทรศัพท์สแกน QR Code เพื่อเช็คอินแผนก <span className="text-blue-600">{activeQrDept}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      ระบบรีเฟรชรหัสความปลอดภัยอัตโนมัติทุก 10 วินาที
                    </p>
                  </div>
                </>
              ) : qrWindow.isBeforeStart ? (
                <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in">
                  <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                    <Clock className="w-10 h-10" />
                  </div>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-2">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    รอเปิดเช็คอินเวลา {qrWindow.startLabel} น.
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">ยังไม่ถึงเวลาเปิดเช็คอิน (แผนก {activeQrDept})</h3>
                  <p className="text-slate-500 mt-2 max-w-xs text-sm">
                    ช่วงเวลาเข้าประชุมของแผนก {activeQrDept} คือ <strong>{activeQrTimeRange} น.</strong><br />
                    ระบบจะเปิดแสดง QR Code อัตโนมัติเมื่อถึงเวลา <strong>{qrWindow.startLabel} น.</strong>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-20 h-20 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mb-4">
                    <Clock className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">หมดเวลาเช็คอิน (แผนก {activeQrDept})</h3>
                  <p className="text-slate-500 mt-2 max-w-xs text-sm">
                    เลยกำหนดเวลาเข้าประชุมของแผนก {activeQrDept} ({activeQrTimeRange} น.) หากมีเหตุจำเป็น กรุณาติดต่อผู้ดูแลระบบ
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsQrExpanded(false)}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-blue-400" />
                <span>{qrWindow.isOpen ? 'ย่อขนาด QR Code' : 'ปิดหน้าต่าง'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
