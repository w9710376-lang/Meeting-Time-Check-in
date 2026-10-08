export type Role = 'employee' | 'manager';
export type AppRole = 'super_admin' | 'dept_manager' | 'qr_kiosk';
export type Department = string;
export type DepartmentScope = 'ALL' | Department;

export const DEFAULT_DEPARTMENTS: Department[] = ['IE', 'EE', 'ME', 'MES', 'MER'];
export const DEPARTMENTS: Department[] = DEFAULT_DEPARTMENTS;

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  pin: string;
  role: Role;
  appRole: AppRole;
  departmentScope: DepartmentScope;
  canEditTime: boolean;
  canManageEmployees: boolean;
  canViewReports: boolean;
  canManageRoles: boolean;
  isActive: boolean;
  createdAt: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  appRole?: AppRole;
  departmentScope?: DepartmentScope;
  canEditTime?: boolean;
  canManageEmployees?: boolean;
  canViewReports?: boolean;
  canManageRoles?: boolean;
  earlyPoints: number;
  createdAt: number;
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  department?: Department;
  isActive: boolean;
  totalPoints?: number;
  pointsMonth?: string; // YYYY-MM for monthly point accumulation reset
  createdAt: number;
}

export interface CheckIn {
  id: string;
  userId: string;
  userName: string;
  department?: Department;
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  } | null;
  status: 'on-time' | 'late';
  meetingStatus?: 'join' | 'skip';
  dateStr: string; // YYYY-MM-DD for easy querying
  earnedPoints?: number;
}

export interface DailySummary {
  dateStr: string;
  totalEmployees: number;
  onTimeCount: number;
  lateCount: number;
  missingCount: number;
}
