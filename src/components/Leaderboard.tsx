import React from 'react';
import { CheckIn } from '../types';
import { Trophy, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { getShortDeviceCode } from '../lib/deviceFingerprint';

interface LeaderboardProps {
  checkIns?: CheckIn[];
  monthlyPointsMap?: Record<string, number>;
}

export function Leaderboard({ checkIns = [], monthlyPointsMap = {} }: LeaderboardProps) {
  const sorted = [...checkIns].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      <div className="mb-4">
        <h3 className="font-bold text-slate-800 text-lg flex items-center">
          <Trophy className="w-5 h-5 text-yellow-500 mr-2" /> พนักงานที่เช็คอินแล้ว
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">คะแนนสะสมรายเดือน · ตรวจสอบอุปกรณ์ 1:1</p>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            ยังไม่มีผู้เช็คอิน เป็นคนแรกที่เช็คอินวันนี้เลย!
          </div>
        ) : (
          sorted.map((checkIn, index) => {
            // Ranking styles
            let badgeClass = "bg-slate-100 text-slate-500";
            if (index === 0) badgeClass = "bg-yellow-400 text-yellow-900";
            else if (index === 1) badgeClass = "bg-slate-300 text-slate-800";
            else if (index === 2) badgeClass = "bg-orange-300 text-orange-900";

            const monthTotal = monthlyPointsMap[checkIn.userId] ?? (checkIn.earnedPoints || 0);

            return (
              <div
                key={checkIn.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  checkIn.suspiciousFlag
                    ? 'bg-amber-50/70 border-amber-300'
                    : index < 3
                    ? 'bg-slate-50 border-slate-100'
                    : 'bg-white border-slate-100 opacity-85'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm shrink-0 tabular-nums ${badgeClass}`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate">{checkIn.userName}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                        {checkIn.department || 'IE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {checkIn.meetingStatus === 'join' ? 'เข้าร่วมประชุม' : 'ไม่เข้าร่วม'}
                      {checkIn.earnedPoints ? ` · +${checkIn.earnedPoints} คะแนน` : ''}
                      {` · สะสม ${monthTotal} คะแนน`}
                    </p>
                    {checkIn.deviceId && (
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 tabular-nums">
                        <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>
                          {checkIn.deviceId === 'ADMIN_KIOSK'
                            ? 'เช็คอินผ่านหน้าจอหลัก'
                            : `${getShortDeviceCode(checkIn.deviceId)}${
                                checkIn.deviceLabel ? ` (${checkIn.deviceLabel})` : ''
                              }`}
                        </span>
                      </p>
                    )}
                    {checkIn.suspiciousFlag && checkIn.suspiciousReason && (
                      <p className="text-[10px] font-semibold text-amber-700 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{checkIn.suspiciousReason}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-blue-600 font-bold text-sm tabular-nums">{format(new Date(checkIn.timestamp), 'HH:mm')}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
