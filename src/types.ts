export type Role = 'employee' | 'manager';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  earlyPoints: number;
  createdAt: number;
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: number;
}

export interface CheckIn {
  id: string;
  userId: string;
  userName: string;
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  } | null;
  status: 'on-time' | 'late';
  meetingStatus?: 'join' | 'skip';
  dateStr: string; // YYYY-MM-DD for easy querying
}

export interface DailySummary {
  dateStr: string;
  totalEmployees: number;
  onTimeCount: number;
  lateCount: number;
  missingCount: number;
}
