import React from 'react';
import { CheckIn } from '../types';
import { Trophy } from 'lucide-react';
import { format } from 'date-fns';

interface LeaderboardProps {
  checkIns?: CheckIn[];
}

export function Leaderboard({ checkIns = [] }: LeaderboardProps) {
  const sorted = [...checkIns].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center">
        <Trophy className="w-5 h-5 text-yellow-500 mr-2" /> พนักงานที่เช็คอินแล้ว
      </h3>
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

            return (
              <div key={checkIn.id} className={`flex items-center justify-between p-3 rounded-xl border ${index < 3 ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 opacity-80'}`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm ${badgeClass}`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{checkIn.userName}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                      {checkIn.meetingStatus === 'join' ? 'เข้าร่วมประชุม' : 'ไม่เข้าร่วม'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-blue-600 font-bold text-sm">{format(new Date(checkIn.timestamp), 'HH:mm')}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
