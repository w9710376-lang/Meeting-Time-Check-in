import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn, Employee } from '../types';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Download, BarChart2, CheckCircle2, Clock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

type Period = 'weekly' | 'monthly';

export function SummaryReport() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);

  useEffect(() => {
    const empQ = query(collection(db, 'employees'), where('isActive', '==', true));
    const unsubEmp = onSnapshot(empQ, (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach(doc => empData.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      setEmployees(empData);
    }, console.warn);

    return () => unsubEmp();
  }, []);

  useEffect(() => {
    setLoading(true);
    let startDate: Date;
    let endDate: Date;

    if (period === 'weekly') {
      startDate = startOfWeek(referenceDate, { weekStartsOn: 1 }); // Monday
      endDate = endOfWeek(referenceDate, { weekStartsOn: 1 }); // Sunday
    } else {
      startDate = startOfMonth(referenceDate);
      endDate = endOfMonth(referenceDate);
    }

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    const checkinsQ = query(
      collection(db, 'checkins'),
      where('dateStr', '>=', startStr),
      where('dateStr', '<=', endStr)
    );

    const unsubCheckins = onSnapshot(checkinsQ, (snapshot) => {
      const data: CheckIn[] = [];
      snapshot.forEach(doc => data.push(doc.data() as CheckIn));
      setCheckIns(data);
      setLoading(false);
    }, (error) => {
      console.warn("Offline mode or error:", error.message);
      setLoading(false);
    });

    return () => unsubCheckins();
  }, [period, referenceDate]);

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    setReferenceDate(new Date());
  };

  const handlePrev = () => {
    setReferenceDate(prev => period === 'weekly' ? subWeeks(prev, 1) : subMonths(prev, 1));
  };

  const handleNext = () => {
    setReferenceDate(prev => period === 'weekly' ? addWeeks(prev, 1) : addMonths(prev, 1));
  };

  const handleToday = () => {
    setReferenceDate(new Date());
  };

  const getReportData = () => {
    const report = employees.map(emp => {
      const empCheckIns = checkIns.filter(c => c.userId === emp.id);
      const onTime = empCheckIns.filter(c => c.status === 'on-time').length;
      const late = empCheckIns.filter(c => c.status === 'late').length;
      const joinMeeting = empCheckIns.filter(c => c.meetingStatus === 'join').length;
      const skipMeeting = empCheckIns.filter(c => c.meetingStatus === 'skip').length;
      
      return {
        id: emp.id,
        name: emp.name,
        totalPoints: emp.totalPoints || 0,
        total: empCheckIns.length,
        onTime,
        late,
        joinMeeting,
        skipMeeting
      };
    });
    
    // Sort by points descending, then by name
    return report.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return (b.totalPoints || 0) - (a.totalPoints || 0);
      }
      return a.name.localeCompare(b.name, 'th');
    });
  };

  const reportData = getReportData();

  // Aggregate for Charts
  const totalOnTime = reportData.reduce((acc, curr) => acc + curr.onTime, 0);
  const totalLate = reportData.reduce((acc, curr) => acc + curr.late, 0);
  const chartData = [
    { name: 'ตรงเวลา', value: totalOnTime, fill: '#10B981' },
    { name: 'สาย', value: totalLate, fill: '#F59E0B' }
  ];

  const handleExport = () => {
    try {
      const exportData = reportData.map((data, index) => ({
        'No.': index + 1,
        'ชื่อ - นามสกุล': data.name,
        'คะแนนสะสม': data.totalPoints,
        'จำนวนวันเช็คอิน': data.total,
        'ตรงเวลา (วัน)': data.onTime,
        'มาสาย (วัน)': data.late,
        'เข้าร่วมประชุม (วัน)': data.joinMeeting,
        'ไม่เข้าร่วมประชุม (วัน)': data.skipMeeting
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
      XLSX.writeFile(wb, `TimeSync_Summary_${period}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Failed to export data.");
    }
  };

  const periodLabel = period === 'weekly' 
    ? `สัปดาห์ที่ ${format(startOfWeek(referenceDate, { weekStartsOn: 1 }), 'd MMM', { locale: th })} - ${format(endOfWeek(referenceDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: th })}`
    : `เดือน ${format(startOfMonth(referenceDate), 'MMMM yyyy', { locale: th })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">สรุปรายสัปดาห์และรายเดือน</h1>
          <p className="text-sm text-slate-500">ตรวจสอบสถิติการเข้างานและการเข้าร่วมประชุมของพนักงาน</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <button onClick={handlePrev} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={handleToday} className="px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-md transition-colors">ปัจจุบัน</button>
            <button onClick={handleNext} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => handlePeriodChange('weekly')}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                period === 'weekly' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              รายสัปดาห์
            </button>
            <button
              onClick={() => handlePeriodChange('monthly')}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                period === 'monthly' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              รายเดือน
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 font-bold animate-pulse">กำลังประมวลผลข้อมูล...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center">
                <CalendarDays className="w-5 h-5 mr-2 text-blue-500" /> ภาพรวม {period === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'}
              </h3>
              <p className="text-sm text-slate-500 mb-6">{periodLabel}</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center text-slate-600 font-medium">
                    <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-500" /> เช็คอินตรงเวลา
                  </div>
                  <span className="text-xl font-bold text-emerald-600">{totalOnTime}</span>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center text-slate-600 font-medium">
                    <Clock className="w-5 h-5 mr-2 text-amber-500" /> เช็คอินสาย
                  </div>
                  <span className="text-xl font-bold text-amber-600">{totalLate}</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center">
                <BarChart2 className="w-5 h-5 mr-2 text-blue-500" /> สัดส่วนการเข้างาน
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} fontWeight="bold" />
                    <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-bold text-slate-800 text-lg flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-blue-500" /> รายงานสรุปรายบุคคล
              </h3>
              <button
                onClick={handleExport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                ส่งออก Excel
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                    <th className="py-4 px-4 w-16 text-center">No.</th>
                    <th className="py-4 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-4 px-4 text-center text-purple-600">คะแนนสะสม 🏆</th>
                    <th className="py-4 px-4 text-center">มา (วัน)</th>
                    <th className="py-4 px-4 text-center text-emerald-600">ตรงเวลา</th>
                    <th className="py-4 px-4 text-center text-amber-600">สาย</th>
                    <th className="py-4 px-4 text-center text-blue-600">ประชุม (เข้า)</th>
                    <th className="py-4 px-4 text-center text-rose-600">ประชุม (ไม่เข้า)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length > 0 ? (
                    reportData.map((data, index) => (
                      <tr key={data.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500 font-medium">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">{data.name}</td>
                        <td className="py-3 px-4 text-center font-bold text-purple-600">{data.totalPoints}</td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-700">{data.total}</td>
                        <td className="py-3 px-4 text-center font-semibold text-emerald-600">{data.onTime > 0 ? data.onTime : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-amber-600">{data.late > 0 ? data.late : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-blue-600">{data.joinMeeting > 0 ? data.joinMeeting : '-'}</td>
                        <td className="py-3 px-4 text-center font-semibold text-rose-600">{data.skipMeeting > 0 ? data.skipMeeting : '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        ไม่มีข้อมูลพนักงาน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
