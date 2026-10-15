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

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const scopeLabel =
    !profile?.departmentScope || profile.departmentScope === 'ALL'
      ? 'ทุกแผนก (ALL)'
      : `แผนก ${profile.departmentScope}`;

  const navItems: { id: TabType; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }>; visible: boolean }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'หน้าหลัก',
      icon: LayoutDashboard,
      visible: Boolean(!isKiosk && profile?.role === 'manager'),
    },
    {
      id: 'employees',
      label: 'พนักงาน',
      shortLabel: 'พนักงาน',
      icon: Users,
      visible: Boolean(!isKiosk && canManageEmployees),
    },
    {
      id: 'summary',
      label: 'รายงานสรุป',
      shortLabel: 'รายงาน',
      icon: FileText,
      visible: Boolean(!isKiosk && canViewReports),
    },
    {
      id: 'roles',
      label: 'ตั้งค่า Role / สิทธิ์',
      shortLabel: 'ตั้งค่าสิทธิ์',
      icon: Shield,
      visible: Boolean(!isKiosk && canManageRoles),
    },
    {
      id: 'checkin',
      label: 'Check In (QR)',
      shortLabel: 'เช็คอิน QR',
      icon: Fingerprint,
      visible: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] w-full bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/40 font-sans text-slate-900 overflow-hidden">
      {/* Desktop Sidebar (Rendered ONLY on lg screen and up) */}
      {isDesktop && (
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 desktop-only-sidebar bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 text-white border-r border-slate-800/80">
          <div className="p-6 flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
              M
            </div>
            <span className="text-lg font-bold tracking-tight whitespace-nowrap">Meeting Check-in</span>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors ${
                    activeTab === item.id
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
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
      )}

      {/* Main Content Area (100% clean width on mobile) */}
      <main className="flex-1 flex flex-col w-full min-w-0 overflow-hidden relative z-0">
        <header
          className="min-h-14 lg:h-16 bg-white border-b border-slate-200 px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2 shadow-xs shrink-0 relative z-10"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingLeft: 'calc(0.875rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(0.875rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 truncate">
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
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-600 shrink-0">
            <span className="hidden sm:inline">
              ผู้ใช้งาน: <strong className="text-slate-900">{profile?.name}</strong> · ขอบเขต:{' '}
              <strong className="text-blue-600">{scopeLabel}</strong>
            </span>
            <span className="sm:hidden font-bold text-blue-600 truncate max-w-[110px]">
              {scopeLabel}
            </span>
            <button
              type="button"
              onClick={logout}
              className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors"
              title="สลับบัญชี / ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div
          className={`flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full min-w-0 ${
            activeTab === 'checkin'
              ? 'p-0 sm:p-4 lg:p-8 pb-20 lg:pb-8 flex flex-col'
              : 'p-3 sm:p-5 lg:p-8 pb-24 lg:pb-8'
          }`}
        >
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

        {/* Mobile Bottom Tab Bar (< lg) */}
        {visibleNavItems.length > 1 && (
          <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around px-1 shadow-lg"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`flex-1 flex flex-col items-center justify-center h-full py-1 transition-colors ${
                    isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-[10px] leading-tight mt-0.5 truncate max-w-[68px]">
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </main>
    </div>
  );
}
