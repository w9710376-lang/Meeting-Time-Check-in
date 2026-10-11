import React, { useState } from 'react';
import { CheckIn, Department, Employee } from '../types';
import { format } from 'date-fns';
import { X, CheckCircle2, CalendarX, QrCode, Clock, Sparkles } from 'lucide-react';

interface MorningMeeting3DCardProps {
  selectedDept: 'ALL' | Department;
  activeCardTimeRange: string;
  totalEmployeesCount: number;
  filteredCheckIns: CheckIn[];
  filteredEmployees: Employee[];
  missingEmployees: Employee[];
  meetingJoinedCount: number;
  meetingSkippedCount: number;
  onTimeCount: number;
  lateCount: number;
  missingCount: number;
  joinPct: number;
  skipPct: number;
  missingPct: number;
}

type StatusCategory = 'attended' | 'absent' | 'waiting' | null;

/**
 * Miniature 3D Claymation Avatar Bust (for seated amphitheater & status clusters)
 */
function ClayAvatarBust({
  x,
  y,
  scale = 1,
  skin = '#FDBA74',
  hair = '#334155',
  shirt = '#10B981',
  facing = 'center',
  hasGlasses = false,
}: {
  x: number;
  y: number;
  scale?: number;
  skin?: string;
  hair?: string;
  shirt?: string;
  facing?: 'left' | 'center' | 'right';
  hasGlasses?: boolean;
}) {
  const eyeOffsetX = facing === 'left' ? -1.4 : facing === 'right' ? 1.4 : 0;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} filter="url(#claySoftShadow)">
      {/* Ambient ground shadow under avatar */}
      <ellipse cx="0" cy="11" rx="9" ry="3.8" fill="rgba(15,23,42,0.16)" />

      {/* 3D Clay Shoulders / Torso */}
      <path
        d="M -8.5 10 C -8.5 3.5, 8.5 3.5, 8.5 10 C 8.5 12, -8.5 12, -8.5 10 Z"
        fill={shirt}
      />
      {/* Specular clay highlight on shoulder */}
      <ellipse cx="-2.5" cy="6.5" rx="4" ry="1.6" fill="rgba(255,255,255,0.38)" />

      {/* Neck */}
      <rect x="-2.2" y="1.5" width="4.4" height="3.5" rx="2" fill={skin} />

      {/* 3D Clay Head */}
      <circle cx="0" cy="-3.2" r="6.2" fill={skin} />
      {/* Cheek blush */}
      <circle cx={-3.2 + eyeOffsetX * 0.5} cy="-1.8" r="1.2" fill="#FB7185" opacity="0.45" />
      <circle cx={3.2 + eyeOffsetX * 0.5} cy="-1.8" r="1.2" fill="#FB7185" opacity="0.45" />

      {/* Clay Hair Cap */}
      <path
        d="M -6.4 -4.2 C -6.4 -9.5, 6.4 -9.5, 6.4 -4.2 C 5.2 -6.5, -5.2 -6.5, -6.4 -4.2 Z"
        fill={hair}
      />
      <circle cx="-3.8" cy="-7.2" r="2.2" fill={hair} />
      <circle cx="1.5" cy="-7.8" r="2.6" fill={hair} />
      {/* Hair clay specular shine */}
      <ellipse cx="-1.5" cy="-8.2" rx="2.5" ry="0.9" fill="rgba(255,255,255,0.28)" />

      {/* Eyes */}
      <circle cx={-2.1 + eyeOffsetX} cy="-3.2" r="0.85" fill="#1E293B" />
      <circle cx={2.1 + eyeOffsetX} cy="-3.2" r="0.85" fill="#1E293B" />
      <circle cx={-2.3 + eyeOffsetX} cy="-3.5" r="0.3" fill="#FFFFFF" />
      <circle cx={1.9 + eyeOffsetX} cy="-3.5" r="0.3" fill="#FFFFFF" />

      {hasGlasses && (
        <g stroke="#475569" strokeWidth="0.65" fill="none">
          <circle cx={-2.1 + eyeOffsetX} cy="-3.2" r="1.6" />
          <circle cx={2.1 + eyeOffsetX} cy="-3.2" r="1.6" />
          <line x1={-0.5 + eyeOffsetX} y1="-3.2" x2={0.5 + eyeOffsetX} y2="-3.2" />
        </g>
      )}

      {/* Smile */}
      <path
        d={`M ${-1.4 + eyeOffsetX} -1.3 Q ${0 + eyeOffsetX} -0.2 ${1.4 + eyeOffsetX} -1.3`}
        stroke="#7C2D12"
        strokeWidth="0.75"
        strokeLinecap="round"
        fill="none"
      />

      {/* Head clay highlight */}
      <ellipse cx="-2.2" cy="-5.8" rx="2" ry="1" fill="rgba(255,255,255,0.42)" />
    </g>
  );
}

/**
 * Mini 3D Clay Group Icon + Avatars for "Attended" (Green)
 */
function ClayAttendedBadge() {
  return (
    <svg viewBox="0 0 88 48" className="w-[76px] h-11 shrink-0 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="greenTileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <filter id="greenBadgeShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3.5" stdDeviation="3" floodColor="#059669" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* 3D Clay Isometric Green Icon Cube on Left */}
      <g filter="url(#greenBadgeShadow)">
        <rect x="3" y="9" width="31" height="31" rx="9.5" fill="#047857" />
        <rect x="3" y="6" width="31" height="31" rx="9.5" fill="url(#greenTileGrad)" />
        <ellipse cx="14" cy="11" rx="8.5" ry="2.8" fill="rgba(255,255,255,0.42)" />
        {/* 3D Clay Checkmark */}
        <path
          d="M 12 22 L 16.8 26.8 L 25.5 17"
          stroke="#FFFFFF"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Group of 3 Mini 3D Clay Avatars for 'Attended' */}
      <g transform="translate(36, -2)">
        <ClayAvatarBust x={13} y={24} scale={0.76} skin="#FDE68A" hair="#475569" shirt="#34D399" facing="center" />
        <ClayAvatarBust x={35} y={24} scale={0.76} skin="#FDBA74" hair="#1E293B" shirt="#059669" facing="left" hasGlasses />
        <ClayAvatarBust x={24} y={31} scale={0.84} skin="#FED7AA" hair="#7C2D12" shirt="#10B981" facing="center" />
      </g>
    </svg>
  );
}

/**
 * Mini 3D Clay Icon + Avatars for "Absent" (Red)
 */
function ClayAbsentBadge() {
  return (
    <svg viewBox="0 0 88 48" className="w-[76px] h-11 shrink-0 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="redTileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="55%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#BE123C" />
        </linearGradient>
        <filter id="redBadgeShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3.5" stdDeviation="3" floodColor="#E11D48" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* 3D Clay Isometric Red Icon Cube on Left */}
      <g filter="url(#redBadgeShadow)">
        <rect x="3" y="9" width="31" height="31" rx="9.5" fill="#9F1239" />
        <rect x="3" y="6" width="31" height="31" rx="9.5" fill="url(#redTileGrad)" />
        <ellipse cx="14" cy="11" rx="8.5" ry="2.8" fill="rgba(255,255,255,0.42)" />
        {/* 3D Clay Cross / Away Symbol */}
        <path
          d="M 13.5 16.5 L 23.5 26.5 M 23.5 16.5 L 13.5 26.5"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* Pair of Mini 3D Clay Avatars with Away Bubble for 'Absent' */}
      <g transform="translate(36, -2)">
        <ClayAvatarBust x={15} y={27} scale={0.80} skin="#FED7AA" hair="#334155" shirt="#FB7185" facing="right" />
        <ClayAvatarBust x={33} y={30} scale={0.82} skin="#FDBA74" hair="#78350F" shirt="#E11D48" facing="left" />
        {/* Floating 3D Clay Away Clock Pill */}
        <g transform="translate(25, 11)">
          <rect x="-7" y="-5" width="14" height="10" rx="5" fill="#FFE4E6" stroke="#FDA4AF" strokeWidth="1" />
          <circle cx="0" cy="0" r="2.8" fill="#F43F5E" />
          <path d="M 0 -1.4 L 0 0 L 1.2 0.8" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Mini 3D Clay Icon + Avatars Standing in Line for "Waiting to scan QR Code" (Grey)
 */
function ClayWaitingQueueBadge() {
  return (
    <svg viewBox="0 0 88 48" className="w-[76px] h-11 shrink-0 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="greyTileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#CBD5E1" />
          <stop offset="55%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <filter id="greyBadgeShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3.5" stdDeviation="3" floodColor="#475569" floodOpacity="0.24" />
        </filter>
      </defs>

      {/* 3D Clay Isometric Grey QR Icon Cube on Left */}
      <g filter="url(#greyBadgeShadow)">
        <rect x="3" y="9" width="31" height="31" rx="9.5" fill="#475569" />
        <rect x="3" y="6" width="31" height="31" rx="9.5" fill="url(#greyTileGrad)" />
        <ellipse cx="14" cy="11" rx="8.5" ry="2.8" fill="rgba(255,255,255,0.45)" />
        {/* Mini 3D Clay QR Code blocks inside icon */}
        <rect x="10.5" y="13.5" width="5.8" height="5.8" rx="1.4" fill="#FFFFFF" />
        <rect x="20.5" y="13.5" width="5.8" height="5.8" rx="1.4" fill="#FFFFFF" />
        <rect x="10.5" y="23.5" width="5.8" height="5.8" rx="1.4" fill="#FFFFFF" />
        <rect x="20.5" y="23.5" width="2.7" height="2.7" rx="0.8" fill="#FFFFFF" />
        <rect x="23.8" y="26.8" width="2.7" height="2.7" rx="0.8" fill="#FFFFFF" />
      </g>

      {/* 3 Mini 3D Clay Avatars Standing in an Isometric Queue Line waiting to scan */}
      <g transform="translate(38, 1)">
        {/* Isometric Queue Floor Line */}
        <path
          d="M 4 37 L 45 27"
          stroke="#CBD5E1"
          strokeWidth="2.2"
          strokeDasharray="3 2.5"
          strokeLinecap="round"
        />

        {/* Person 3 (Back of line) */}
        <g transform="translate(39, 14) scale(0.60)">
          <ellipse cx="0" cy="19" rx="6.5" ry="2.4" fill="rgba(15,23,42,0.14)" />
          <rect x="-3.2" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#64748B" />
          <rect x="0.6" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#475569" />
          <rect x="-5.5" y="1.5" width="11" height="10.5" rx="4.5" fill="#94A3B8" />
          <circle cx="0" cy="-4.5" r="5.5" fill="#FDE68A" />
          <path d="M -5.5 -5.5 C -5.5 -10, 5.5 -10, 5.5 -5.5 Z" fill="#475569" />
          <circle cx="-2" cy="-4.5" r="0.8" fill="#1E293B" />
        </g>

        {/* Person 2 (Middle of line) */}
        <g transform="translate(24, 18) scale(0.66)">
          <ellipse cx="0" cy="19" rx="6.5" ry="2.4" fill="rgba(15,23,42,0.16)" />
          <rect x="-3.2" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#475569" />
          <rect x="0.6" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#334155" />
          <rect x="-5.5" y="1.5" width="11" height="10.5" rx="4.5" fill="#64748B" />
          <circle cx="0" cy="-4.5" r="5.5" fill="#FDBA74" />
          <path d="M -5.5 -5.5 C -5.5 -10, 5.5 -10, 5.5 -5.5 Z" fill="#1E293B" />
          <circle cx="-2" cy="-4.5" r="0.8" fill="#1E293B" />
        </g>

        {/* Person 1 (Front of line holding phone toward QR icon) */}
        <g transform="translate(9, 22) scale(0.72)">
          <ellipse cx="0" cy="19" rx="7" ry="2.6" fill="rgba(15,23,42,0.18)" />
          <rect x="-3.2" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#475569" />
          <rect x="0.6" y="10.5" width="2.6" height="7.5" rx="1.3" fill="#334155" />
          <rect x="-5.5" y="1.5" width="11" height="10.5" rx="4.5" fill="#475569" />
          {/* Tiny 3D Phone held out to scan */}
          <rect x="-9.5" y="2.5" width="3.8" height="6" rx="1" fill="#1E293B" stroke="#38BDF8" strokeWidth="0.7" />
          <circle cx="0" cy="-4.5" r="5.5" fill="#FED7AA" />
          <path d="M -5.5 -5.5 C -5.5 -10, 5.5 -10, 5.5 -5.5 Z" fill="#7C2D12" />
          <circle cx="-2.2" cy="-4.5" r="0.8" fill="#1E293B" />
        </g>
      </g>
    </svg>
  );
}

export function MorningMeeting3DCard({
  selectedDept,
  activeCardTimeRange,
  totalEmployeesCount,
  filteredCheckIns,
  filteredEmployees,
  missingEmployees,
  meetingJoinedCount,
  meetingSkippedCount,
  onTimeCount,
  lateCount,
  missingCount,
  joinPct,
  skipPct,
  missingPct,
}: MorningMeeting3DCardProps) {
  const [activeCategory, setActiveCategory] = useState<StatusCategory>(null);

  // Circular 3D Clay Ring geometry
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const hasActivity = meetingJoinedCount + meetingSkippedCount + missingCount > 0;

  // Normalize visual arc shares so all non-zero segments are clearly visible
  const totalCount = Math.max(1, meetingJoinedCount + meetingSkippedCount + missingCount);
  const joinFraction = hasActivity ? meetingJoinedCount / totalCount : 0;
  const skipFraction = hasActivity ? meetingSkippedCount / totalCount : 0;
  const missingFraction = hasActivity ? missingCount / totalCount : 1;

  const joinDash = joinFraction * circumference;
  const skipDash = skipFraction * circumference;
  const missingDash = missingFraction * circumference;

  const joinOffset = 0;
  const skipOffset = -joinDash;
  const missingOffset = -(joinDash + skipDash);

  // Prepare modal employee lists
  const attendedCheckIns = filteredCheckIns
    .filter((c) => c.meetingStatus === 'join')
    .sort((a, b) => a.timestamp - b.timestamp);

  const absentCheckIns = filteredCheckIns
    .filter((c) => c.meetingStatus === 'skip')
    .sort((a, b) => a.timestamp - b.timestamp);

  // Amphitheater seats configuration (outer tier + inner tier) with fill priority
  const amphitheaterAvatars = [
    // Top / Back curved amphitheater tier (5 seats)
    { x: 96, y: 78, scale: 0.72, skin: '#FED7AA', hair: '#1E293B', shirt: '#10B981', facing: 'right' as const, priority: 9 },
    { x: 116, y: 69, scale: 0.72, skin: '#FDE68A', hair: '#78350F', shirt: '#34D399', facing: 'center' as const, hasGlasses: true, priority: 3 },
    { x: 140, y: 65, scale: 0.74, skin: '#FDBA74', hair: '#334155', shirt: '#059669', facing: 'center' as const, priority: 1 },
    { x: 164, y: 69, scale: 0.72, skin: '#FED7AA', hair: '#475569', shirt: '#10B981', facing: 'center' as const, priority: 4 },
    { x: 184, y: 78, scale: 0.72, skin: '#FDBA74', hair: '#1E293B', shirt: '#0D9488', facing: 'left' as const, hasGlasses: true, priority: 10 },

    // Middle curved amphitheater tier (left & right wings)
    { x: 82, y: 102, scale: 0.78, skin: '#FDE68A', hair: '#334155', shirt: '#10B981', facing: 'right' as const, priority: 13 },
    { x: 102, y: 95, scale: 0.76, skin: '#FDBA74', hair: '#7C2D12', shirt: '#34D399', facing: 'right' as const, priority: 7 },
    { x: 178, y: 95, scale: 0.76, skin: '#FED7AA', hair: '#1E293B', shirt: '#059669', facing: 'left' as const, priority: 8 },
    { x: 198, y: 102, scale: 0.78, skin: '#FDE68A', hair: '#475569', shirt: '#10B981', facing: 'left' as const, priority: 14 },

    // Front curved amphitheater tier (foreground rows attending the stage)
    { x: 88, y: 176, scale: 0.84, skin: '#FDBA74', hair: '#1E293B', shirt: '#059669', facing: 'right' as const, priority: 11 },
    { x: 112, y: 188, scale: 0.86, skin: '#FED7AA', hair: '#78350F', shirt: '#10B981', facing: 'center' as const, hasGlasses: true, priority: 5 },
    { x: 140, y: 192, scale: 0.88, skin: '#FDE68A', hair: '#334155', shirt: '#34D399', facing: 'center' as const, priority: 2 },
    { x: 168, y: 188, scale: 0.86, skin: '#FDBA74', hair: '#475569', shirt: '#0D9488', facing: 'center' as const, priority: 6 },
    { x: 192, y: 176, scale: 0.84, skin: '#FED7AA', hair: '#1E293B', shirt: '#10B981', facing: 'left' as const, priority: 12 },
  ];

  // Show 0 avatars when nobody has joined the meeting yet; show seated avatars only when meetingJoinedCount > 0
  const visibleSeatCount =
    meetingJoinedCount <= 0
      ? 0
      : Math.min(
          amphitheaterAvatars.length,
          Math.max(
            meetingJoinedCount,
            Math.round((joinPct / 100) * amphitheaterAvatars.length)
          )
        );

  return (
    <>
      <div className="col-span-12 lg:col-span-4 rounded-[28px] bg-gradient-to-b from-white via-[#F9FBFF] to-[#EEF3FA] p-5 sm:p-6 h-full border border-white shadow-[0_22px_50px_-12px_rgba(15,23,42,0.12),0_4px_16px_-2px_rgba(15,23,42,0.05),inset_0_2px_4px_rgba(255,255,255,0.95)] flex flex-col justify-between gap-3 relative overflow-hidden">
        {/* Subtle Futuristic White Clay Ambient Lighting */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-gradient-to-br from-emerald-200/30 via-sky-200/25 to-transparent blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-gradient-to-tr from-blue-200/25 via-indigo-100/20 to-transparent blur-2xl"
          aria-hidden="true"
        />

        {/* Top Header */}
        <div className="relative z-10 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Morning Meeting Statistics</span>
            </div>
            <h3 className="font-extrabold text-slate-900 text-lg leading-snug mt-0.5">
              สถิติการประชุมเช้า ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              เวลาประชุม {activeCardTimeRange} น. <span aria-hidden="true">·</span> พนักงานทั้งหมด {totalEmployeesCount} คน
            </p>
          </div>
          <div className="text-right tabular-nums bg-white/90 border border-slate-200/80 shadow-[0_4px_12px_rgba(15,23,42,0.05),inset_0_1px_2px_#fff] rounded-2xl px-3 py-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-slate-400 block">สแกนแล้ว</span>
            <span className="text-sm font-extrabold text-slate-800">
              {filteredCheckIns.length}/{totalEmployeesCount} คน
            </span>
          </div>
        </div>

        {/* CENTER: 3D Miniature Amphitheater inside a 3D Circular Chart with Tiny 3D Avatars & Large 3D Percentage */}
        <div className="relative z-10 my-1 flex flex-col items-center justify-center">
          <div className="relative w-[220px] h-[220px] sm:w-[232px] sm:h-[232px] flex items-center justify-center select-none">
            <svg
              viewBox="0 0 280 280"
              className="w-full h-full overflow-visible"
              role="img"
              aria-label={`สถิติการประชุมเช้า เข้าร่วม ${joinPct}% ไม่เข้าร่วม ${skipPct}% รอสแกน ${missingPct}%`}
            >
              <defs>
                {/* Soft 3D Clay Drop Shadows */}
                <filter id="clayRingShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0F172A" floodOpacity="0.14" />
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.08" />
                </filter>
                <filter id="claySoftShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.18" />
                </filter>
                <filter id="clay3DTextShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="3" stdDeviation="0" floodColor="#CBD5E1" floodOpacity="1" />
                  <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.18" />
                </filter>

                {/* Porcelain & Amphitheater Gradients */}
                <radialGradient id="amphitheaterOuterShell" cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="70%" stopColor="#F1F5F9" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </radialGradient>
                <radialGradient id="amphitheaterBowlGrad" cx="50%" cy="38%" r="60%">
                  <stop offset="0%" stopColor="#F8FAFC" />
                  <stop offset="65%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#CBD5E1" />
                </radialGradient>
                <linearGradient id="tierStepGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
                <linearGradient id="tierStepGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#F8FAFC" />
                  <stop offset="100%" stopColor="#CBD5E1" />
                </linearGradient>
                <radialGradient id="stageFloorGrad" cx="50%" cy="45%" r="55%">
                  <stop offset="0%" stopColor="#ECFDF5" />
                  <stop offset="65%" stopColor="#D1FAE5" />
                  <stop offset="100%" stopColor="#A7F3D0" />
                </radialGradient>

                {/* 3D Clay Donut Segment Gradients */}
                <linearGradient id="clayGreenArc" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6EE7B7" />
                  <stop offset="35%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="clayRedArc" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FDA4AF" />
                  <stop offset="35%" stopColor="#F43F5E" />
                  <stop offset="100%" stopColor="#BE123C" />
                </linearGradient>
                <linearGradient id="clayGreyArc" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F1F5F9" />
                  <stop offset="40%" stopColor="#CBD5E1" />
                  <stop offset="100%" stopColor="#64748B" />
                </linearGradient>
              </defs>

              {/* Outer 3D Porcelain Pedestal Base */}
              <circle
                cx="140"
                cy="144"
                r="122"
                fill="#E2E8F0"
                opacity="0.65"
              />
              <circle
                cx="140"
                cy="140"
                r="122"
                fill="url(#amphitheaterOuterShell)"
                filter="url(#clayRingShadow)"
                stroke="#FFFFFF"
                strokeWidth="3"
              />

              {/* Recessed Circular Track Groove for the 3D Chart */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="24"
              />
              <circle
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke="#F8FAFC"
                strokeWidth="20"
              />

              {/* 3D Circular Chart Segments (Rotated -90deg so chart starts at 12 o'clock) */}
              <g transform="rotate(-90 140 140)" filter="url(#claySoftShadow)">
                {/* Waiting to Scan Segment (Grey Clay) */}
                {missingFraction > 0 && (
                  <circle
                    cx="140"
                    cy="140"
                    r={radius}
                    fill="none"
                    stroke="url(#clayGreyArc)"
                    strokeWidth="22"
                    strokeDasharray={`${missingDash} ${circumference}`}
                    strokeDashoffset={missingOffset}
                    strokeLinecap="round"
                  />
                )}

                {/* Absent Segment (Red Clay) */}
                {skipFraction > 0 && (
                  <circle
                    cx="140"
                    cy="140"
                    r={radius}
                    fill="none"
                    stroke="url(#clayRedArc)"
                    strokeWidth="22"
                    strokeDasharray={`${skipDash} ${circumference}`}
                    strokeDashoffset={skipOffset}
                    strokeLinecap="round"
                  />
                )}

                {/* Attended Segment (Green Clay) */}
                {joinFraction > 0 && (
                  <circle
                    cx="140"
                    cy="140"
                    r={radius}
                    fill="none"
                    stroke="url(#clayGreenArc)"
                    strokeWidth="22"
                    strokeDasharray={`${joinDash} ${circumference}`}
                    strokeDashoffset={joinOffset}
                    strokeLinecap="round"
                  />
                )}
              </g>

              {/* Specular Gloss Highlight Ring on top of the 3D Donut */}
              <circle
                cx="140"
                cy="140"
                r={radius + 6}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1.5"
              />

              {/* ===================================================================== */}
              {/* INSIDE THE CHART: 3D MINIATURE AMPHITHEATER / MEETING ROOM           */}
              {/* ===================================================================== */}
              <g>
                {/* Amphitheater Bowl Rim */}
                <circle
                  cx="140"
                  cy="140"
                  r="86"
                  fill="url(#amphitheaterBowlGrad)"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                />

                {/* Isometric Amphitheater Tier 3 (Outer Seating Step) */}
                <ellipse
                  cx="140"
                  cy="136"
                  rx="76"
                  ry="68"
                  fill="url(#tierStepGrad1)"
                  stroke="#CBD5E1"
                  strokeWidth="1.2"
                />
                {/* Isometric Amphitheater Tier 2 (Middle Seating Step) */}
                <ellipse
                  cx="140"
                  cy="139"
                  rx="61"
                  ry="54"
                  fill="url(#tierStepGrad2)"
                  stroke="#CBD5E1"
                  strokeWidth="1.2"
                />
                {/* Isometric Amphitheater Tier 1 (Inner Acoustic Ring) */}
                <ellipse
                  cx="140"
                  cy="142"
                  rx="46"
                  ry="40"
                  fill="url(#stageFloorGrad)"
                  stroke="#A7F3D0"
                  strokeWidth="1.5"
                />

                {/* Miniature 3D Curved Conference Table / Podium Arc at Top of Amphitheater */}
                <path
                  d="M 116 92 Q 140 84 164 92"
                  stroke="#10B981"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#claySoftShadow)"
                />
                <path
                  d="M 118 91 Q 140 83 162 91"
                  stroke="#A7F3D0"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Empty Amphitheater Seat Cushions (shown on unoccupied seats) */}
                {amphitheaterAvatars.map((av, idx) => {
                  const isSeatedAttending = av.priority <= visibleSeatCount;
                  if (isSeatedAttending) return null;
                  return (
                    <g key={`seat-${idx}`} transform={`translate(${av.x}, ${av.y + 8}) scale(${av.scale})`}>
                      <ellipse cx="0" cy="1.5" rx="7.5" ry="3.2" fill="#CBD5E1" opacity="0.65" />
                      <ellipse cx="0" cy="0" rx="7.5" ry="3.2" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="0.8" />
                    </g>
                  );
                })}

                {/* Tiny 3D Avatar Characters Sitting & Attending the Morning Meeting (only shown when meetingJoinedCount > 0) */}
                {visibleSeatCount > 0 &&
                  amphitheaterAvatars
                    .filter((av) => av.priority <= visibleSeatCount)
                    .map((av, idx) => (
                      <ClayAvatarBust
                        key={`avatar-${idx}`}
                        x={av.x}
                        y={av.y}
                        scale={av.scale}
                        skin={av.skin}
                        hair={av.hair}
                        shirt={av.shirt}
                        facing={av.facing}
                        hasGlasses={av.hasGlasses}
                      />
                    ))}

                {/* Center Frosted 3D Clay Pedestal for Large 3D Percentage Text */}
                <g filter="url(#claySoftShadow)">
                  <ellipse
                    cx="140"
                    cy="137"
                    rx="42"
                    ry="34"
                    fill="rgba(255,255,255,0.92)"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />
                  <ellipse
                    cx="140"
                    cy="135"
                    rx="38"
                    ry="30"
                    fill="none"
                    stroke="#D1FAE5"
                    strokeWidth="1.2"
                  />
                </g>

                {/* LARGE 3D SCULPTED PERCENTAGE TEXT IN THE MIDDLE */}
                <g filter="url(#clay3DTextShadow)">
                  <text
                    x="140"
                    y="138"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="font-black tabular-nums"
                    fill="#0F172A"
                    fontSize="30"
                    fontWeight="900"
                    letterSpacing="-1"
                  >
                    {joinPct}%
                  </text>
                </g>
                <text
                  x="140"
                  y="156"
                  textAnchor="middle"
                  fill="#059669"
                  fontSize="8.5"
                  fontWeight="800"
                  letterSpacing="0.6"
                >
                  ATTENDED
                </text>
              </g>
            </svg>
          </div>

          {/* 3D Clay Multi-Segment Capsule Bar */}
          <div className="w-full mt-1 px-1">
            <div className="h-3 w-full rounded-full bg-slate-200/80 p-0.5 shadow-inner flex overflow-hidden">
              {meetingJoinedCount > 0 && (
                <div
                  style={{ width: `${joinPct}%` }}
                  className="h-full first:rounded-l-full last:rounded-r-full bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-all duration-500"
                  title={`เข้าร่วมประชุมเช้า ${joinPct}%`}
                />
              )}
              {meetingSkippedCount > 0 && (
                <div
                  style={{ width: `${skipPct}%` }}
                  className="h-full first:rounded-l-full last:rounded-r-full bg-gradient-to-b from-rose-400 to-rose-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-all duration-500"
                  title={`ไม่เข้าร่วม ${skipPct}%`}
                />
              )}
              {missingCount > 0 && (
                <div
                  style={{ width: `${missingPct}%` }}
                  className="h-full first:rounded-l-full last:rounded-r-full bg-gradient-to-b from-slate-300 to-slate-400 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-all duration-500"
                  title={`รอสแกน QR Code ${missingPct}%`}
                />
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM DETAILS: Clean Status List with 3D Clay Icons and Mini 3D Avatars next to text */}
        <div className="relative z-10 space-y-2 pb-1">
          {/* 1. Green icon with group of avatars for 'Attended' */}
          <button
            type="button"
            onClick={() => setActiveCategory('attended')}
            className="w-full text-left group rounded-2xl bg-white/95 hover:bg-emerald-50/50 border border-slate-200/80 hover:border-emerald-300 px-3 py-2 shadow-[0_6px_16px_-4px_rgba(15,23,42,0.06),inset_0_2px_2px_#ffffff] transition-all flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ClayAttendedBadge />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">
                    เข้าร่วมประชุมเช้า
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 shrink-0">· Attended</span>
                </div>
                <p className="text-[11px] text-slate-500 tabular-nums truncate">
                  ตรงเวลา {onTimeCount} คน <span aria-hidden="true">·</span> สาย {lateCount} คน
                </p>
              </div>
            </div>
            <div className="text-right tabular-nums shrink-0 pl-1">
              <span className="block font-black text-emerald-600 text-sm sm:text-base leading-tight">
                {meetingJoinedCount} คน
              </span>
              <span className="text-[11px] font-bold text-slate-400">{joinPct}%</span>
            </div>
          </button>

          {/* 2. Red icon with avatars for 'Absent' */}
          <button
            type="button"
            onClick={() => setActiveCategory('absent')}
            className="w-full text-left group rounded-2xl bg-white/95 hover:bg-rose-50/50 border border-slate-200/80 hover:border-rose-300 px-3 py-2 shadow-[0_6px_16px_-4px_rgba(15,23,42,0.06),inset_0_2px_2px_#ffffff] transition-all flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ClayAbsentBadge />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">
                    ไม่เข้าร่วมประชุม
                  </span>
                  <span className="text-[10px] font-bold text-rose-600 shrink-0">· Absent</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  ติดภารกิจอื่น / แจ้งเหตุผล
                </p>
              </div>
            </div>
            <div className="text-right tabular-nums shrink-0 pl-1">
              <span className="block font-black text-rose-600 text-sm sm:text-base leading-tight">
                {meetingSkippedCount} คน
              </span>
              <span className="text-[11px] font-bold text-slate-400">{skipPct}%</span>
            </div>
          </button>

          {/* 3. Grey icon with avatars standing in line for 'Waiting to scan QR Code' */}
          <button
            type="button"
            onClick={() => setActiveCategory('waiting')}
            className="w-full text-left group rounded-2xl bg-white/95 hover:bg-slate-100/80 border border-slate-200/80 hover:border-slate-300 px-3 py-2 shadow-[0_6px_16px_-4px_rgba(15,23,42,0.06),inset_0_2px_2px_#ffffff] transition-all flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ClayWaitingQueueBadge />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-800 text-xs sm:text-sm truncate">
                    รอสแกน QR Code
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">· Waiting</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  Waiting to scan QR Code
                </p>
              </div>
            </div>
            <div className="text-right tabular-nums shrink-0 pl-1">
              <span className="block font-black text-slate-700 text-sm sm:text-base leading-tight">
                {missingCount} คน
              </span>
              <span className="text-[11px] font-bold text-slate-400">{missingPct}%</span>
            </div>
          </button>
        </div>
      </div>

      {/* Interactive Employee Breakdown Modal when clicking Attended / Absent / Waiting */}
      {activeCategory && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActiveCategory(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[82vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`px-6 py-4 text-white flex items-center justify-between ${
                activeCategory === 'attended'
                  ? 'bg-emerald-600'
                  : activeCategory === 'absent'
                  ? 'bg-rose-600'
                  : 'bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {activeCategory === 'attended' && <CheckCircle2 className="w-5 h-5" />}
                {activeCategory === 'absent' && <CalendarX className="w-5 h-5" />}
                {activeCategory === 'waiting' && <QrCode className="w-5 h-5" />}
                <div>
                  <h4 className="font-bold text-base">
                    {activeCategory === 'attended'
                      ? `เข้าร่วมประชุมเช้า (Attended · ${attendedCheckIns.length} คน)`
                      : activeCategory === 'absent'
                      ? `ไม่เข้าร่วมประชุมเช้า (Absent · ${absentCheckIns.length} คน)`
                      : `รอสแกน QR Code (Waiting · ${missingEmployees.length} คน)`}
                  </h4>
                  <p className="text-xs text-white/80">
                    แผนก: {selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept} · เวลาประชุม {activeCardTimeRange} น.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-2.5">
              {activeCategory === 'attended' &&
                (attendedCheckIns.length === 0 ? (
                  <p className="text-center py-8 text-sm text-slate-400 font-medium">
                    ยังไม่มีพนักงานเช็คอินเข้าร่วมประชุมเช้าในขณะนี้
                  </p>
                ) : (
                  attendedCheckIns.map((c, i) => (
                    <div
                      key={c.id || i}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80"
                    >
                      <div>
                        <p className="font-bold text-sm text-slate-900">
                          {i + 1}. {c.userName}
                        </p>
                        <p className="text-xs text-slate-500">
                          แผนก {c.department || 'IE'} ·{' '}
                          <span
                            className={
                              c.status === 'on-time'
                                ? 'text-emerald-600 font-semibold'
                                : 'text-amber-600 font-semibold'
                            }
                          >
                            {c.status === 'on-time' ? 'ตรงเวลา' : 'มาสาย'}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-700 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{format(new Date(c.timestamp), 'HH:mm:ss')} น.</span>
                      </div>
                    </div>
                  ))
                ))}

              {activeCategory === 'absent' &&
                (absentCheckIns.length === 0 ? (
                  <p className="text-center py-8 text-sm text-slate-400 font-medium">
                    ไม่มีพนักงานแจ้งไม่เข้าร่วมประชุมเช้าในวันนี้
                  </p>
                ) : (
                  absentCheckIns.map((c, i) => (
                    <div
                      key={c.id || i}
                      className="flex items-start justify-between p-3 rounded-2xl bg-rose-50/50 border border-rose-200/70 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900">
                          {i + 1}. {c.userName}{' '}
                          <span className="text-xs font-semibold text-slate-500">
                            (แผนก {c.department || 'IE'})
                          </span>
                        </p>
                        <p className="text-xs text-rose-700 font-medium mt-0.5">
                          เหตุผล: {c.skipReason || 'ติดภารกิจด่วน (ไม่ระบุรายละเอียด)'}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">
                        {format(new Date(c.timestamp), 'HH:mm')} น.
                      </span>
                    </div>
                  ))
                ))}

              {activeCategory === 'waiting' &&
                (missingEmployees.length === 0 ? (
                  <p className="text-center py-8 text-sm text-emerald-600 font-bold">
                    พนักงานทุกคนสแกน QR Code ครบเรียบร้อยแล้ว!
                  </p>
                ) : (
                  missingEmployees.map((emp, i) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80"
                    >
                      <span className="font-bold text-sm text-slate-800">
                        {i + 1}. {emp.name}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        แผนก {emp.department || 'IE'}
                      </span>
                    </div>
                  ))
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
