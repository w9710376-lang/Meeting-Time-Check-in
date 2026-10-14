import React, { useState, useEffect } from 'react';
import { CheckIn, Employee, Department } from '../types';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import {
  Clock,
  Building2,
  Users,
  CalendarCheck,
  CalendarX,
  AlertCircle,
  CheckCircle2,
  Maximize,
  Minimize,
  Tv,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { MorningMeeting3DCard } from './MorningMeeting3DCard';
import { Leaderboard } from './Leaderboard';
import { getCheckInWindowStatus } from '../lib/checkinTime';

interface LiveMeetingSplitViewProps {
  departments: Department[];
  scopedDept: Department | null;
  selectedDept: 'ALL' | Department;
  onSelectDept: (dept: 'ALL' | Department) => void;
  activeQrDept: Department;
  onSelectQrDept: (dept: Department) => void;
  activeQrTimeRange: string;
  defaultTimeRange: string;
  deptTimeRanges: Partial<Record<Department, string>>;
  employees: Employee[];
  filteredEmployees: Employee[];
  todayCheckIns: CheckIn[];
  filteredCheckIns: CheckIn[];
  missingEmployees: Employee[];
  meetingJoinedCount: number;
  meetingSkippedCount: number;
  onTimeCount: number;
  lateCount: number;
  missingCount: number;
  joinPct: number;
  skipPct: number;
  missingPct: number;
  monthlyPointsMap: Record<string, number>;
  todayHolidayInfo: { name: string } | null;
  onExitSplitMode: () => void;
}

export function LiveMeetingSplitView({
  departments,
  scopedDept,
  selectedDept,
  onSelectDept,
  activeQrDept,
  onSelectQrDept,
  activeQrTimeRange,
  employees,
  filteredEmployees,
  filteredCheckIns,
  missingEmployees,
  meetingJoinedCount,
  meetingSkippedCount,
  onTimeCount,
  lateCount,
  missingCount,
  joinPct,
  skipPct,
  missingPct,
  monthlyPointsMap,
  todayHolidayInfo,
  onExitSplitMode,
}: LiveMeetingSplitViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [qrUrl, setQrUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const qrWindow = getCheckInWindowStatus(activeQrTimeRange, currentTime);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

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

  // Dept check-ins specifically for activeQrDept
  const empDeptMap = new Map(employees.map(e => [e.id, (e.department || 'IE').trim().toUpperCase()]));
  const qrDeptEmployees = employees.filter(
    e => (e.department || 'IE').trim().toUpperCase() === activeQrDept.trim().toUpperCase()
  );
  const qrDeptCheckIns = filteredCheckIns.filter(
    c => (c.department || empDeptMap.get(c.userId) || 'IE').trim().toUpperCase() === activeQrDept.trim().toUpperCase()
  );
  const qrDeptCheckedInIds = new Set(qrDeptCheckIns.map(c => c.userId));
  const qrDeptMissingCount = Math.max(0, qrDeptEmployees.length - qrDeptCheckedInIds.size);
  const qrDeptScannedCount = qrDeptCheckedInIds.size;
  const qrDeptScannedPct = qrDeptEmployees.length > 0
    ? Math.round((qrDeptScannedCount / qrDeptEmployees.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Top Bar for Live Meeting Mode */}
      <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExitSplitMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่มุมมองปกติ</span>
          </button>
          <div className="h-4 w-px bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              <Tv className="w-4 h-4 text-blue-400" />
              <span>โหมดจอพรีเซนต์ห้องประชุมเช้า (Live Split-Screen)</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {todayHolidayInfo && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              วันหยุด ({todayHolidayInfo.name})
            </span>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors"
            title="ขยายเต็มหน้าจอทีวี / โปรเจกเตอร์ (F11)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span>{isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มหน้าจอทีวี'}</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid: Left QR Station (~40%) + Right Live Dashboard (~60%) */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Live QR Code Kiosk Station */}
        <div className="col-span-12 xl:col-span-5 bg-white rounded-3xl border-2 border-blue-500/30 shadow-lg p-5 sm:p-6 flex flex-col space-y-5">
          {/* Header & Clock */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white rounded-2xl p-5 border border-blue-500/20 text-center relative overflow-hidden">
            <div className="absolute top-3 right-3 text-blue-400/30">
              <Sparkles className="w-6 h-6" />
            </div>

            <div className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight flex items-center justify-center">
              <span>{format(currentTime, 'HH:mm')}</span>
              <span className="text-blue-400 text-2xl sm:text-3xl font-bold ml-1">
                :{format(currentTime, 'ss')}
              </span>
            </div>
            <p className="text-xs uppercase tracking-wider text-slate-300 font-semibold mt-1">
              {format(currentTime, 'EEEE, MMM do yyyy')}
            </p>

            <div className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs">
              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>
                เวลาเข้าประชุม ({activeQrDept}): <strong className="text-white font-bold">{activeQrTimeRange} น.</strong>
              </span>
            </div>
          </div>

          {/* Department Selection Tabs */}
          {!scopedDept && departments.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>สลับแผนกสำหรับสแกน:</span>
                </span>
                <span className="text-blue-600 font-bold">แผนก {activeQrDept}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => {
                      onSelectQrDept(dept);
                      onSelectDept(dept);
                    }}
                    className={`flex-1 min-w-[60px] py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center ${
                      activeQrDept === dept
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live QR Box / Status Box */}
          <div className="flex flex-col items-center justify-center py-2">
            {qrWindow.isOpen ? (
              <div className="flex flex-col items-center w-full">
                <div className="w-[min(68vw,320px)] h-[min(68vw,320px)] sm:w-[320px] sm:h-[320px] bg-white rounded-3xl p-5 border-4 border-blue-500 shadow-xl flex items-center justify-center transition-transform hover:scale-[1.02]">
                  {qrUrl && <QRCode value={qrUrl} size={280} className="w-full h-full text-slate-900" />}
                </div>

                <div className="mt-4 text-center space-y-1">
                  <p className="text-base font-extrabold text-slate-900">
                    นำกล้องสแกน QR Code เพื่อเช็คอินแผนก <span className="text-blue-600">{activeQrDept}</span>
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    ระบบรีเฟรชรหัสความปลอดภัยอัตโนมัติทุก 10 วินาที · สแกน 1 คน ต่อ 1 เครื่อง
                  </p>
                </div>
              </div>
            ) : qrWindow.isBeforeStart ? (
              <div className="w-full py-10 px-6 rounded-3xl bg-amber-50/80 border-2 border-amber-200 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs">
                  <Clock className="w-8 h-8" />
                </div>
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-2">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  รอเปิดเช็คอินเวลา {qrWindow.startLabel} น.
                </div>
                <h3 className="text-lg font-bold text-slate-900">ยังไม่ถึงเวลาเปิดเช็คอิน (แผนก {activeQrDept})</h3>
                <p className="text-xs text-slate-600 mt-2 max-w-xs leading-relaxed">
                  ช่วงเวลาเข้าประชุมคือ <strong>{activeQrTimeRange} น.</strong><br />
                  ระบบจะเปิดแสดง QR Code ให้อัตโนมัติเมื่อถึงเวลา <strong>{qrWindow.startLabel} น.</strong>
                </p>
              </div>
            ) : (
              <div className="w-full py-10 px-6 rounded-3xl bg-slate-100 border-2 border-slate-200 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center mb-3.5">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">หมดเวลาเช็คอิน (แผนก {activeQrDept})</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  เลยกำหนดเวลาเข้าประชุม ({activeQrTimeRange} น.) หากมีเหตุจำเป็น กรุณาติดต่อผู้ดูแลระบบ
                </p>
              </div>
            )}
          </div>

          {/* Department Progress Summary */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-700">ความคืบหน้าการเช็คอิน แผนก {activeQrDept}</span>
              <span className="text-blue-600 font-extrabold tabular-nums">
                {qrDeptScannedCount} / {qrDeptEmployees.length} คน ({qrDeptScannedPct}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, qrDeptScannedPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> เช็คอินแล้ว {qrDeptScannedCount} คน
              </span>
              <span className="text-amber-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> รอสแกน {qrDeptMissingCount} คน
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Real-Time Executive Dashboard */}
        <div className="col-span-12 xl:col-span-7 space-y-5">
          {/* KPI Mini-Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <p className="text-xs text-slate-500 font-semibold truncate">
                พนักงาน ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})
              </p>
              <h4 className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{filteredEmployees.length}</h4>
              <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1 mt-1">
                <Users className="w-3 h-3" /> เปิดใช้งาน
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <p className="text-xs text-slate-500 font-semibold truncate">เข้าประชุมเช้า</p>
              <h4 className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">{meetingJoinedCount}</h4>
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                <CalendarCheck className="w-3 h-3" /> เช็คอินสำเร็จ
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <p className="text-xs text-slate-500 font-semibold truncate">ไม่เข้าประชุม</p>
              <h4 className="text-2xl font-bold text-rose-600 mt-1 tabular-nums">{meetingSkippedCount}</h4>
              <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1 mt-1">
                <CalendarX className="w-3 h-3" /> ติดภารกิจ
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <p className="text-xs text-slate-500 font-semibold truncate">รอสแกน QR</p>
              <h4 className="text-2xl font-bold text-slate-400 mt-1 tabular-nums">{Math.max(0, missingCount)}</h4>
              <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> รอดำเนินการ
              </span>
            </div>
          </div>

          {/* 3D Miniature Amphitheater Card */}
          <div className="w-full">
            <MorningMeeting3DCard
              selectedDept={selectedDept}
              activeCardTimeRange={activeQrTimeRange}
              totalEmployeesCount={filteredEmployees.length}
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
          </div>

          {/* Bottom Feeds: Missing List + Recent Check-in Leaderboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Real-Time Missing Employees */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 flex flex-col h-[22rem]">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  <span>พนักงานที่ยังไม่เช็คอิน</span>
                </h4>
                <span className="text-rose-600 text-xs font-bold tabular-nums">
                  รอสแกน {missingEmployees.length} คน
                </span>
              </div>

              <div className="overflow-y-auto flex-1 pr-1.5">
                {missingEmployees.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 flex flex-col items-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 opacity-80" />
                    <p className="font-bold text-sm text-slate-700">เช็คอินครบทุกคนแล้ว!</p>
                    <p className="text-xs text-slate-400 mt-0.5">ทุกคนในแผนกสแกนเรียบร้อยแล้ว</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {missingEmployees.map(emp => (
                      <li
                        key={emp.id}
                        className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 text-xs"
                      >
                        <span className="font-bold text-slate-800 truncate">{emp.name}</span>
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0 ml-2">
                          แผนก {emp.department || 'IE'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Live Leaderboard / Recent Check-in Feed */}
            <div className="h-[22rem]">
              <Leaderboard checkIns={filteredCheckIns} monthlyPointsMap={monthlyPointsMap} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
