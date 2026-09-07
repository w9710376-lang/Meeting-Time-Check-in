import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Fingerprint, Users, FileText } from 'lucide-react';
import { CheckIn } from './CheckIn';
import { Dashboard } from './Dashboard';
import { EmployeeManager } from './EmployeeManager';
import { SummaryReport } from './SummaryReport';

export function Layout() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'checkin' | 'dashboard' | 'employees' | 'summary'>(profile?.role === 'manager' ? 'dashboard' : 'checkin');

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-xl">T</div>
          <span className="text-xl font-bold tracking-tight">TimeSync Pro</span>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          {profile?.role === 'manager' && (
            <>
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
            </>
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
            <span className="font-medium">Check In</span>
          </button>
        </nav>
        <div className="p-6 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {profile?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold truncate">{profile?.name}</p>
                <p className="text-xs text-slate-500 uppercase tracking-widest truncate">{profile?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-700">
            {activeTab === 'dashboard' ? 'Executive Dashboard' : activeTab === 'employees' ? 'จัดการพนักงาน' : activeTab === 'summary' ? 'รายงานสรุป' : 'Daily Check In'}
          </h1>
        </header>
        <div className="flex-1 overflow-auto p-8">
          {activeTab === 'dashboard' ? <Dashboard /> : activeTab === 'employees' ? <EmployeeManager /> : activeTab === 'summary' ? <SummaryReport /> : <CheckIn onComplete={() => setActiveTab('dashboard')} />}
        </div>
      </main>
    </div>
  );
}
