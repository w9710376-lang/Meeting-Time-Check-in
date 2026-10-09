import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import * as XLSX from 'xlsx';
import QRCode from 'react-qr-code';
import { Download, Users, AlertCircle, CheckCircle2, CalendarCheck, CalendarX, Maximize2, Minimize2, Building2, X } from 'lucide-react';
import { Leaderboard } from './Leaderboard';

export function Dashboard() {
  const { profile, departments } = useAuth();
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

  const [loading, setLoading] = useState(true);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([]);
  const [monthCheckIns, setMonthCheckIns] = useState<CheckIn[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDept, setSelectedDept] = useState<'ALL' | Department>(scopedDept || 'ALL');

  const [currentTime, setCurrentTime] = useState(new Date());
  const [defaultTimeRange, setDefaultTimeRange] = useState('07:30-07:45');
  const [deptTimeRanges, setDeptTimeRanges] = useState<Partial<Record<Department, string>>>({});
  const [qrDept, setQrDept] = useState<Department>(
    scopedDept || ((localStorage.getItem('selected_checkin_dept') as Department) || departments[0] || 'IE')
  );
  const [qrUrl, setQrUrl] = useState('');
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  useEffect(() => {
    setSelectedDept(scopedDept || 'ALL');
    if (scopedDept) {
      setQrDept(scopedDept);
    }
  }, [scopedDept]);

  useEffect(() => {
    if (selectedDept !== 'ALL') {
      setQrDept(selectedDept);
    }
  }, [selectedDept]);

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

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'checkin'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.targetTimeRange) {
          setDefaultTimeRange(data.targetTimeRange);
        }
        if (data.departmentTimeRanges) {
          setDeptTimeRanges(data.departmentTimeRanges);
        }
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
      url.searchParams.set('t', Date.now().toString());
      return url.toString();
    };

    setQrUrl(buildQrUrl());

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      if (now.getSeconds() % 10 === 0) {
        setQrUrl(buildQrUrl());
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQrDept]);
  
  useEffect(() => {
    // Fetch active employees
    const empQ = query(collection(db, 'employees'), where('isActive', '==', true));
    const unsubEmp = onSnapshot(empQ, (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach(doc => empData.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      empData.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setEmployees(empData);
    }, console.warn);

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const checkinsQ = query(collection(db, 'checkins'), where('dateStr', '==', todayStr));
    
    const unsubscribe = onSnapshot(checkinsQ, (snapshot) => {
      const checkinsData: CheckIn[] = [];
      snapshot.forEach((doc) => checkinsData.push(doc.data() as CheckIn));
      setTodayCheckIns(checkinsData);
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
    monthlyPointsMap[c.userId] = (monthlyPointsMap[c.userId] || 0) + (c.earnedPoints || 0);
  });

  const handleExport = async () => {
    try {
      const currentMonthPrefix = format(new Date(), 'yyyy-MM');
      const checkinsSnap = await getDocs(collection(db, 'checkins'));
      const empDeptMap = new Map(employees.map(e => [e.id, e.department || 'IE']));
      const allCheckins: any[] = [];
      checkinsSnap.forEach((doc) => {
        const data = doc.data() as CheckIn;
        if (!data.dateStr || !data.dateStr.startsWith(currentMonthPrefix)) return;
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
          DeviceID: data.deviceId || '-',
          DeviceModel: data.deviceLabel || '-',
          SecurityVerification: data.suspiciousFlag
            ? `ตรวจสอบ: ${data.suspiciousReason || 'ฮาร์ดแวร์สแกนซ้ำใกล้กัน'}`
            : 'ปกติ (Verified 1:1)',
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
  const missingCount = Math.max(0, totalEmployeesCount - filteredCheckIns.length);

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

  const handleSelectQrDept = (dept: Department) => {
    if (scopedDept) return;
    setQrDept(dept);
    localStorage.setItem('selected_checkin_dept', dept);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-700">
            Executive Dashboard: <span className="text-blue-600 font-bold">{format(new Date(), 'MMM dd, yyyy')}</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!scopedDept && (
              <button
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
                onClick={() => {
                  setSelectedDept(dept);
                  setQrDept(dept);
                  localStorage.setItem('selected_checkin_dept', dept);
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsQrExpanded(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors"
          >
            <Maximize2 className="w-4 h-4 mr-2 text-blue-400" />
            ขยาย QR Code ({activeQrDept})
          </button>
          <button
            onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </button>
        </div>
      </div>

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
            <AlertCircle className="w-3 h-3 mr-1" /> ขาดหาย
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-stretch">
        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[27rem] lg:h-[28rem] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-snug">
                สถิติการประชุมเช้า ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                เวลาประชุม {activeCardTimeRange} น. <span aria-hidden="true">·</span> พนักงาน {totalEmployeesCount} คน
              </p>
            </div>
            <div className="text-right tabular-nums">
              <span className="text-xs text-slate-500 block">เช็คอินแล้ว</span>
              <span className="text-sm font-bold text-slate-900">
                {filteredCheckIns.length}/{totalEmployeesCount} คน
              </span>
            </div>
          </div>

          <div className="relative h-44 my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={76}
                  paddingAngle={hasChartActivity ? 3 : 0}
                  cornerRadius={hasChartActivity ? 6 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                {hasChartActivity && (
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white px-3 py-2 rounded-xl shadow-lg text-xs tabular-nums">
                          <p className="font-bold">{item.name}</p>
                          <p className="text-slate-300 mt-0.5">
                            จำนวน <strong className="text-white">{item.value} คน</strong> ({item.pct}%)
                          </p>
                        </div>
                      );
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              <span className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-none">
                {joinPct}%
              </span>
              <span className="text-[11px] font-semibold text-slate-500 mt-1">
                เข้าประชุมเช้า
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Multi-segment progress bar */}
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
              {meetingJoinedCount > 0 && (
                <div
                  style={{ width: `${joinPct}%` }}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  title={`เข้าร่วมประชุมเช้า ${joinPct}%`}
                />
              )}
              {meetingSkippedCount > 0 && (
                <div
                  style={{ width: `${skipPct}%` }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title={`ไม่เข้าร่วม ${skipPct}%`}
                />
              )}
              {missingCount > 0 && (
                <div
                  style={{ width: `${missingPct}%` }}
                  className="bg-slate-300 h-full transition-all duration-300"
                  title={`รอสแกน ${missingPct}%`}
                />
              )}
            </div>

            {/* Structured Breakdown List */}
            <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1 text-xs">
              <div className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                    <span className="font-bold text-slate-800 truncate">เข้าร่วมประชุมเช้า</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pl-4.5 mt-0.5 tabular-nums">
                    ตรงเวลา {onTimeCount} คน <span aria-hidden="true">·</span> สาย {lateCount} คน
                  </p>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <span className="font-bold text-emerald-600 text-sm">{meetingJoinedCount} คน</span>
                  <span className="text-slate-400 ml-1.5">({joinPct}%)</span>
                </div>
              </div>

              <div className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shrink-0" />
                  <span className="font-bold text-slate-700 truncate">ไม่เข้าร่วม (ติดภารกิจ)</span>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <span className="font-bold text-rose-600 text-sm">{meetingSkippedCount} คน</span>
                  <span className="text-slate-400 ml-1.5">({skipPct}%)</span>
                </div>
              </div>

              <div className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 shrink-0" />
                  <span className="font-bold text-slate-600 truncate">รอสแกน QR Code</span>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <span className="font-bold text-slate-700 text-sm">{missingCount} คน</span>
                  <span className="text-slate-400 ml-1.5">({missingPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[27rem] lg:h-[28rem] flex flex-col">
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

        <div className="col-span-12 lg:col-span-4 min-h-[27rem] lg:h-[28rem]">
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

              <button
                type="button"
                onClick={() => setIsQrExpanded(false)}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-blue-400" />
                <span>ย่อขนาด QR Code</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
