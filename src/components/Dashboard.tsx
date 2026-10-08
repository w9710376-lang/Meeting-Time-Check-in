import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee, Department, DEPARTMENTS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { Download, Users, AlertCircle, CheckCircle2, CalendarCheck, CalendarX } from 'lucide-react';
import { Leaderboard } from './Leaderboard';

export function Dashboard() {
  const { profile } = useAuth();
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

  const [loading, setLoading] = useState(true);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDept, setSelectedDept] = useState<'ALL' | Department>(scopedDept || 'ALL');

  useEffect(() => {
    setSelectedDept(scopedDept || 'ALL');
  }, [scopedDept]);
  
  useEffect(() => {
    // Fetch active employees
    const empQ = query(collection(db, 'employees'), where('isActive', '==', true));
    const unsubEmp = onSnapshot(empQ, (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach(doc => empData.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      empData.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setEmployees(empData);
    }, console.warn);

    const todayStr = format(new Date(), 'yyyy-MM-dd');
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

    return () => {
      unsubEmp();
      unsubscribe();
    };
  }, []);

  const handleExport = async () => {
    try {
      const checkinsSnap = await getDocs(collection(db, 'checkins'));
      const empDeptMap = new Map(employees.map(e => [e.id, e.department || 'IE']));
      const allCheckins: any[] = [];
      checkinsSnap.forEach((doc) => {
        const data = doc.data() as CheckIn;
        const dept = data.department || empDeptMap.get(data.userId) || 'IE';
        if (selectedDept !== 'ALL' && dept !== selectedDept) return;
        allCheckins.push({
          Name: data.userName,
          Department: dept,
          Date: data.dateStr,
          Time: format(new Date(data.timestamp), 'HH:mm:ss'),
          ArrivalStatus: data.status,
          Points: data.earnedPoints || 0,
          MeetingStatus: data.meetingStatus === 'join' ? 'เข้าร่วมประชุม' : data.meetingStatus === 'skip' ? 'ไม่เข้าร่วมประชุม' : 'N/A'
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

  const empDeptMap = new Map(employees.map(e => [e.id, e.department || 'IE']));
  const filteredEmployees = selectedDept === 'ALL'
    ? employees
    : employees.filter(e => (e.department || 'IE') === selectedDept);

  const filteredCheckIns = selectedDept === 'ALL'
    ? todayCheckIns
    : todayCheckIns.filter(c => (c.department || empDeptMap.get(c.userId) || 'IE') === selectedDept);

  const meetingJoinedCount = filteredCheckIns.filter(c => c.meetingStatus === 'join').length;
  const meetingSkippedCount = filteredCheckIns.filter(c => c.meetingStatus === 'skip').length;
  const missingCount = filteredEmployees.length - filteredCheckIns.length;

  const chartData = [
    { name: 'Joined Meeting', value: meetingJoinedCount, color: '#10B981' }, 
    { name: 'Skipped Meeting', value: meetingSkippedCount, color: '#E11D48' }, 
    { name: 'Pending Scan', value: Math.max(0, missingCount), color: '#94A3B8' } 
  ];

  const checkedInIds = new Set(filteredCheckIns.map(c => c.userId));
  const missingEmployees = filteredEmployees.filter(e => !checkedInIds.has(e.id));

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
            {(scopedDept ? [scopedDept] : DEPARTMENTS).map(dept => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDept === dept ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {scopedDept ? `เฉพาะแผนก ${dept}` : dept}
              </button>
            ))}
          </div>
        </div>
        <div className="flex space-x-4">
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
          <h2 className="text-3xl font-bold text-slate-900 mt-1">{filteredEmployees.length}</h2>
          <div className="mt-2 flex items-center text-blue-600 text-xs font-bold">
            <Users className="w-3 h-3 mr-1" /> พนักงานที่เปิดใช้งาน
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">เข้าร่วมประชุมเช้า</p>
          <h2 className="text-3xl font-bold text-emerald-600 mt-1">{meetingJoinedCount}</h2>
          <div className="mt-2 flex items-center text-emerald-600 text-xs font-bold">
            <CalendarCheck className="w-3 h-3 mr-1" /> เช็คอินสำเร็จ
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">ไม่เข้าร่วมประชุมเช้า</p>
          <h2 className="text-3xl font-bold text-rose-600 mt-1">{meetingSkippedCount}</h2>
          <div className="mt-2 flex items-center text-rose-600 text-xs font-bold">
            <CalendarX className="w-3 h-3 mr-1" /> ติดภารกิจอื่น
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm text-slate-500 font-medium">ยังไม่สแกน QR Code</p>
          <h2 className="text-3xl font-bold text-slate-400 mt-1">{Math.max(0, missingCount)}</h2>
          <div className="mt-2 flex items-center text-slate-400 text-xs font-bold">
            <AlertCircle className="w-3 h-3 mr-1" /> ขาดหาย
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-96 flex flex-col">
          <h3 className="font-bold text-slate-800 text-lg mb-4">สถิติการประชุมเช้า ({selectedDept === 'ALL' ? 'ทุกแผนก' : selectedDept})</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-96 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-lg">พนักงานที่ยังไม่เช็คอิน</h3>
            <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2 py-1 rounded-md">
              {missingEmployees.length} คน
            </span>
          </div>
          
          <div className="overflow-y-auto flex-1 pr-2">
            {missingEmployees.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-bold">สแกนครบทุกคนแล้ว!</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {missingEmployees.map(emp => (
                  <li key={emp.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-sm text-slate-800">{emp.name}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      {emp.department || 'IE'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 h-96">
          <Leaderboard checkIns={filteredCheckIns} />
        </div>
      </div>
    </div>
  );
}
