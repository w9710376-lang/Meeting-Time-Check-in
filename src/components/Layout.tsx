import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Fingerprint, Users, FileText, Shield, LogOut } from 'lucide-react';
import { CheckIn } from './CheckIn';

const Dashboard = React.lazy(() =>
  import('./Dashboard').then((m) => ({ default: m.Dashboard }))
);
const EmployeeManager = React.lazy(() =>
  import('./EmployeeManager').then((m) => ({ default: m.EmployeeManager }))
);
const SummaryReport = React.lazy(() =>
  import('./SummaryReport').then((m) => ({ default: m.SummaryReport }))
);
const RoleManager = React.lazy(() =>
  import('./RoleManager').then((m) => ({ default: m.RoleManager }))
);

type TabType = 'checkin' | 'dashboard' | 'employees' | 'summary' | 'roles';

export function Layout() {
  const { profile, logout } = useAuth();
  const isKiosk = profile?.appRole === 'qr_kiosk';
  const canManageEmployees = profile?.canManageEmployees ?? profile?.role === 'manager';
  const canViewReports = profile?.canViewReports ?? profile?.role === 'manager';
  const canManageRoles = profile?.canManageRoles ?? profile?.appRole === 'super_admin';

  const [activeTab, setActiveTab] = useState<TabType>(
    isKiosk ? 'checkin' : profile?.role === 'manager' ? 'dashboard' : 'checkin'
  );

  useEffect(() => {
    if (isKiosk) {
      setActiveTab('checkin');
    }
  }, [isKiosk, profile?.id]);

  const scopeLabel =
    !profile?.departmentScope || profile.departmentScope === 'ALL'
      ? 'ทุกแผนก (ALL)'
      : `แผนก ${profile.departmentScope}`;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-xl">
            M
          </div>
          <span className="text-lg font-bold tracking-tight">Meeting Check-in</span>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          {!isKiosk && profile?.role === 'manager' && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </button>
          )}

          {!isKiosk && canManageEmployees && (
            <button
              onClick={() => setActiveTab('employees')}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
                activeTab === 'employees'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">พนักงาน</span>
            </button>
          )}

          {!isKiosk && canViewReports && (
            <button
              onClick={() => setActiveTab('summary')}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
                activeTab === 'summary'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">รายงานสรุป</span>
            </button>
          )}

          {!isKiosk && canManageRoles && (
            <button
              onClick={() => setActiveTab('roles')}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
                activeTab === 'roles'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">ตั้งค่า Role / สิทธิ์</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('checkin')}
            className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
              activeTab === 'checkin'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Fingerprint className="w-5 h-5" />
            <span className="font-medium">Check In (QR)</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="truncate">
              <p className="text-sm font-semibold truncate">{profile?.name}</p>
              <p className="text-xs text-slate-400 truncate">
                {profile?.appRole === 'super_admin'
                  ? 'Super Admin (ผู้ดูแลระบบกลาง)'
                  : profile?.appRole === 'dept_manager'
                  ? scopeLabel
                  : 'QR Kiosk'}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-bold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>สลับบัญชี / ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm">
          <h1 className="text-lg font-semibold text-slate-700">
            {activeTab === 'dashboard'
              ? 'Executive Dashboard'
              : activeTab === 'employees'
              ? 'จัดการพนักงาน'
              : activeTab === 'summary'
              ? 'รายงานสรุป'
              : activeTab === 'roles'
              ? 'ตั้งค่า Role และสิทธิ์การใช้งาน'
              : 'Meeting Time Check-in'}
          </h1>

          <div className="flex items-center space-x-4 text-xs text-slate-600">
            <span>
              ผู้ใช้งาน: <strong className="text-slate-900">{profile?.name}</strong> · ขอบเขต:{' '}
              <strong className="text-blue-600">{scopeLabel}</strong>
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            }
          >
            {activeTab === 'dashboard' ? (
              <Dashboard />
            ) : activeTab === 'employees' ? (
              <EmployeeManager />
            ) : activeTab === 'summary' ? (
              <SummaryReport />
            ) : activeTab === 'roles' ? (
              <RoleManager />
            ) : (
              <CheckIn onComplete={() => setActiveTab(isKiosk ? 'checkin' : 'dashboard')} />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
