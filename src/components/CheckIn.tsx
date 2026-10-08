import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn as CheckInType, Employee, Department, DEPARTMENTS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { MapPin, CheckCircle, AlertTriangle, Search, Users, CalendarX, CalendarCheck, Edit2, Check, Clock, Building2 } from 'lucide-react';

type Step = 'scan' | 'select-name' | 'meeting' | 'processing' | 'success' | 'error';

export function CheckIn({ onComplete }: { onComplete?: () => void }) {
  const { profile } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchParams = new URLSearchParams(window.location.search);
  const isScanMode = searchParams.get('mode') === 'scan';
  const urlScanTime = searchParams.get('t');
  const urlDept = searchParams.get('dept') as Department | null;

  const scopedDept: Department | null =
    !isScanMode && profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;
  const canEditTime = !isScanMode && (profile?.canEditTime ?? true);

  const initialDept: Department = (urlDept && DEPARTMENTS.includes(urlDept))
    ? urlDept
    : scopedDept
    ? scopedDept
    : ((localStorage.getItem('selected_checkin_dept') as Department) || 'IE');

  const [selectedDept, setSelectedDept] = useState<Department>(
    DEPARTMENTS.includes(initialDept) ? initialDept : 'IE'
  );

  useEffect(() => {
    if (scopedDept) {
      setSelectedDept(scopedDept);
    }
  }, [scopedDept]);

  // Real-time employee list
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  
  // Try to load remembered employee for scan mode
  const rememberedEmpId = localStorage.getItem('remembered_employee_id');
  
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Check if QR expired immediately on load
  const isQrExpired = isScanMode && (!urlScanTime || Date.now() - parseInt(urlScanTime, 10) > 30000);
  const [step, setStep] = useState<Step>(isScanMode ? (isQrExpired ? 'error' : (rememberedEmpId ? 'meeting' : 'select-name')) : 'scan');
  
  const [meetingStatus, setMeetingStatus] = useState<'join' | 'skip' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState(isQrExpired ? 'QR Code หมดอายุ กรุณาสแกนใหม่จากหน้าจอหลัก' : '');
  
  const [defaultTimeRange, setDefaultTimeRange] = useState('07:30-07:45');
  const [deptTimeRanges, setDeptTimeRanges] = useState<Partial<Record<Department, string>>>({});
  const [isEditingTime, setIsEditingTime] = useState(false);

  const targetTimeRange = deptTimeRanges[selectedDept] || defaultTimeRange;
  const [editTimeValue, setEditTimeValue] = useState(targetTimeRange);
  
  const [appUrl, setAppUrl] = useState('');

  // Keep editTimeValue synced when switching departments
  useEffect(() => {
    setEditTimeValue(deptTimeRanges[selectedDept] || defaultTimeRange);
  }, [selectedDept, deptTimeRanges, defaultTimeRange]);

  const handleDeptChange = (dept: Department) => {
    setSelectedDept(dept);
    setIsEditingTime(false);
    if (!isScanMode) {
      localStorage.setItem('selected_checkin_dept', dept);
    }
  };

  // Calculate if QR code should be visible based on current time and targetTimeRange
  const isCheckInOpen = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const timeVal = hours + minutes / 60;

    let limitTimeVal = 9.0; // Default fallback
    const timeParts = targetTimeRange.split('-');
    if (timeParts.length > 1) {
      const endTimeStr = timeParts[1].trim();
      const endParts = endTimeStr.split(':');
      if (endParts.length >= 2) {
        const limitHours = parseInt(endParts[0], 10);
        const limitMinutes = parseInt(endParts[1], 10);
        if (!isNaN(limitHours) && !isNaN(limitMinutes)) {
          limitTimeVal = limitHours + limitMinutes / 60;
        }
      }
    }
    
    // Let's hide the QR code completely if it's past the end time.
    return timeVal <= limitTimeVal;
  };

  useEffect(() => {
    // Load config
    const unsubscribeConfig = onSnapshot(doc(db, 'settings', 'checkin'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.targetTimeRange) {
          setDefaultTimeRange(data.targetTimeRange);
        }
        if (data.departmentTimeRanges) {
          setDeptTimeRanges(data.departmentTimeRanges);
        }
      }
    });

    return () => {
      unsubscribeConfig();
    };
  }, []);

  // Build and refresh QR Code URL with selectedDept
  useEffect(() => {
    const buildQrUrl = () => {
      const url = new URL(window.location.href);
      if (url.hostname.includes('ais-dev-')) {
        url.hostname = url.hostname.replace('ais-dev-', 'ais-pre-');
      }
      url.searchParams.set('mode', 'scan');
      url.searchParams.set('dept', selectedDept);
      url.searchParams.set('t', Date.now().toString());
      return url.toString();
    };

    if (!isScanMode) {
      setAppUrl(buildQrUrl());
    } else {
      setAppUrl(window.location.href);
    }

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Dynamic QR: Update QR code token every 10 seconds for central screen
      if (!isScanMode && now.getSeconds() % 10 === 0) {
        setAppUrl(buildQrUrl());
      }
    }, 1000);
    
    return () => {
      clearInterval(timer);
    };
  }, [selectedDept, isScanMode]);

  useEffect(() => {
    // Only fetch active employees
    const q = query(collection(db, 'employees'), where('isActive', '==', true));
    const unsubscribeEmp = onSnapshot(q, (snapshot) => {
      const emps: Employee[] = [];
      snapshot.forEach(doc => emps.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      // Sort alphabetically once when data arrives, instead of every render tick
      emps.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setEmployees(emps);
      
      if (isScanMode && rememberedEmpId && !selectedEmployee) {
        const found = emps.find(e => e.id === rememberedEmpId);
        // Only auto-select remembered employee if they belong to the scanned department (if urlDept was specified)
        const empDept = found?.department || 'IE';
        if (found && (!urlDept || empDept === urlDept)) {
          setSelectedEmployee(found);
          setSelectedDept(empDept);
        } else {
          // If employee not found or belongs to another department, let user select from the scanned department
          setStep('select-name');
          if (!found) {
            localStorage.removeItem('remembered_employee_id');
          }
        }
      }
    }, console.warn);

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const checkinsQ = query(collection(db, 'checkins'), where('dateStr', '==', todayStr));
    const unsubscribeCheckins = onSnapshot(checkinsQ, (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach(doc => ids.add(doc.data().userId));
      setCheckedInIds(ids);
    }, console.warn);
    
    return () => {
      unsubscribeEmp();
      unsubscribeCheckins();
    };
  }, []);

  const handleScanSuccess = () => {
    setStep('select-name');
  };

  const handleNameSelect = (employee: Employee) => {
    if (isScanMode) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const lockedDate = localStorage.getItem('device_checkin_date');
      const lockedEmp = localStorage.getItem('device_checkin_emp');
      
      // Prevent selecting a different employee if this device already checked in today
      if (lockedDate === todayStr && lockedEmp && lockedEmp !== employee.id) {
        setMessage('อุปกรณ์นี้ได้ทำการเช็คอินสำหรับวันนี้ไปแล้ว ไม่สามารถเช็คอินแทนบุคคลอื่นได้');
        setStep('error');
        return;
      }
      
      localStorage.setItem('remembered_employee_id', employee.id);
    }
    
    setSelectedEmployee(employee);
    if (employee.department) {
      setSelectedDept(employee.department);
    }
    setStep('meeting');
  };

  const handleMeetingSelect = (status: 'join' | 'skip') => {
    setMeetingStatus(status);
    // ข้ามหน้าต่าง processing ไปเลยเพื่อให้ UI โหลดทันที (Optimistic UI)
    
    try {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const timeVal = hours + minutes / 60;
      
      const empDept: Department = selectedEmployee?.department || selectedDept;
      const activeTimeRange = deptTimeRanges[empDept] || defaultTimeRange;

      // Parse the targetTimeRange to get start and end times for point calculation
      let startHours = 7, startMinutes = 30; // Default 07:30
      let endHours = 7, endMinutes = 45; // Default 07:45
      
      const timeParts = activeTimeRange.split('-');
      if (timeParts.length === 2) {
        const startParts = timeParts[0].trim().split(':');
        const endParts = timeParts[1].trim().split(':');
        
        if (startParts.length >= 2) {
          startHours = parseInt(startParts[0], 10);
          startMinutes = parseInt(startParts[1], 10);
        }
        if (endParts.length >= 2) {
          endHours = parseInt(endParts[0], 10);
          endMinutes = parseInt(endParts[1], 10);
        }
      }
      
      const limitTimeVal = endHours + endMinutes / 60;
      
      const isOnTime = timeVal <= limitTimeVal;
      const checkInStatus = isOnTime ? 'on-time' : 'late';
      
      // Calculate earned points dynamically
      let earnedPoints = 0;
      if (status === 'join' && isOnTime) {
        // Calculate total duration in minutes
        const totalDurationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
        
        // Calculate minutes elapsed since start
        // If they scan before start time, it will be negative, we cap it at 0
        const elapsedMinutes = Math.max(0, (hours * 60 + minutes) - (startHours * 60 + startMinutes));
        
        if (totalDurationMinutes > 0) {
          const percentageElapsed = elapsedMinutes / totalDurationMinutes;
          
          if (percentageElapsed <= 0.33) {
            earnedPoints = 10; // First 33% (e.g. 0-5 mins of 15 mins)
          } else if (percentageElapsed <= 0.66) {
            earnedPoints = 5;  // Middle 33% (e.g. 6-10 mins)
          } else {
            earnedPoints = 2;  // Last 34% (e.g. 11-15 mins)
          }
        } else {
          // Fallback if someone enters weird times where start >= end
          earnedPoints = 5;
        }
      }
      
      if (!selectedEmployee) throw new Error("No employee selected");
      const checkInId = `${selectedEmployee.id}_${format(now, 'yyyy-MM-dd')}`;
      
      const newCheckIn: CheckInType = {
        id: checkInId,
        userId: selectedEmployee.id,
        userName: selectedEmployee.name,
        department: empDept,
        timestamp: now.getTime(),
        location: null,
        status: checkInStatus,
        meetingStatus: status,
        dateStr: format(now, 'yyyy-MM-dd'),
        earnedPoints: earnedPoints
      };

      // Update total points in employee profile
      if (earnedPoints > 0) {
        setDoc(doc(db, 'employees', selectedEmployee.id), {
          totalPoints: (selectedEmployee.totalPoints || 0) + earnedPoints
        }, { merge: true }).catch(console.warn);
      }

      // Fire and forget
      setDoc(doc(db, 'checkins', checkInId), newCheckIn).catch(console.warn);
      
      // Record successful checkin on this device for today
      if (isScanMode) {
        localStorage.setItem('device_checkin_date', format(now, 'yyyy-MM-dd'));
        localStorage.setItem('device_checkin_emp', selectedEmployee.id);
      }
      
      setStep('success');
      
      if (earnedPoints > 0) {
        setMessage(`เช็คอินสำเร็จ! แผนก ${empDept} เข้าร่วมประชุมเช้า และได้รับ ${earnedPoints} คะแนน 🎉`);
      } else {
        setMessage(`เช็คอินสำเร็จ! คุณ${status === 'join' ? 'เข้าร่วม' : 'ไม่เข้าร่วม'}ประชุมเช้า (แผนก ${empDept})`);
      }
    } catch (error: any) {
      console.warn(error);
      setStep('success');
      setMessage(`เช็คอินสำเร็จ (โหมดออฟไลน์)! คุณ${status === 'join' ? 'เข้าร่วม' : 'ไม่เข้าร่วม'}ประชุมเช้า`);
    }
  };

  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        resetFlow();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const saveTimeRange = async () => {
    try {
      const updatedRanges = {
        ...deptTimeRanges,
        [selectedDept]: editTimeValue.trim()
      };
      await setDoc(doc(db, 'settings', 'checkin'), {
        departmentTimeRanges: updatedRanges
      }, { merge: true });
      setIsEditingTime(false);
    } catch (error) {
      console.warn("Failed to save time range", error);
    }
  };

  const resetFlow = () => {
    if (onComplete && !isScanMode) {
      onComplete();
    } else {
      setSelectedEmployee(null);
      setMeetingStatus(null);
      setSearchQuery('');
      setStep(isScanMode ? (rememberedEmpId ? 'meeting' : 'select-name') : 'scan');
    }
  };

  // Filter active employees by selected department and search query
  const deptEmployees = employees.filter(emp => (emp.department || 'IE') === selectedDept);
  const filteredEmployees = deptEmployees
    .filter(emp => !checkedInIds.has(emp.id))
    .filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
      <div className="bg-slate-900 px-6 py-7 text-center text-white border-b-4 border-blue-500 relative">
        <h2 className="text-2xl font-bold tracking-tight">Meeting Time Check-in</h2>

        {/* Department Selector Tabs */}
        <div className="mt-4 flex justify-center">
          <div className="inline-flex bg-slate-800 p-1 rounded-xl border border-slate-700 gap-1">
            {(scopedDept ? [scopedDept] : DEPARTMENTS).map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => handleDeptChange(dept)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  selectedDept === dept
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                { scopedDept ? `แผนก ${dept}` : dept }
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-center items-center space-x-2 text-5xl font-bold text-white tabular-nums tracking-tighter">
          <span>{format(currentTime, 'HH:mm')}</span><span className="text-blue-500 opacity-80 text-3xl">:{format(currentTime, 'ss')}</span>
        </div>
        <p className="mt-2 text-slate-400 text-sm font-semibold uppercase tracking-wider">{format(currentTime, 'EEEE, MMM do')}</p>
        
        <div className="mt-4 flex justify-center items-center">
          {isEditingTime ? (
            <div className="flex items-center space-x-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
              <span className="text-xs font-bold text-blue-400 pl-2">{selectedDept}:</span>
              <input 
                type="text" 
                value={editTimeValue}
                onChange={e => setEditTimeValue(e.target.value)}
                className="bg-transparent text-white text-sm text-center outline-none w-28"
                placeholder="07:30-07:45"
                autoFocus
              />
              <button 
                onClick={saveTimeRange}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded p-1 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-slate-300 text-sm bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50 group">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>เวลาเข้าประชุม ({selectedDept}): <strong className="text-white">{targetTimeRange} น.</strong></span>
              {canEditTime && (
                <button 
                  onClick={() => { setEditTimeValue(targetTimeRange); setIsEditingTime(true); }} 
                  className="ml-2 text-slate-400 hover:text-white transition-colors"
                  title={`แก้ไขเวลาเช็คอินของแผนก ${selectedDept}`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
        
        {step !== 'scan' && (
          <button onClick={resetFlow} className="absolute top-4 right-4 text-xs font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 transition-colors">
            เริ่มใหม่
          </button>
        )}
      </div>
      
      <div className="p-6 bg-slate-50 min-h-[350px] flex flex-col justify-center relative">
        {step === 'scan' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            {isCheckInOpen() ? (
              <>
                <div className="mb-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  QR Code สำหรับแผนก {selectedDept} (รอเช็คอิน {filteredEmployees.length} คน)
                </div>
                <div className="w-64 h-64 bg-white rounded-2xl mb-6 relative overflow-hidden border-2 border-slate-200 shadow-sm flex items-center justify-center p-5">
                  {appUrl && <QRCode value={appUrl} size={220} className="w-full h-full text-slate-800" />}
                </div>
                <h3 className="text-lg font-bold text-slate-900">สแกน QR Code แผนก {selectedDept}</h3>
                <p className="text-slate-500 text-sm mt-1 text-center mb-6">นำกล้องจ่อที่ QR Code หน้าห้องประชุมเพื่อเช็คอินเข้าแผนก {selectedDept}</p>
                
                <button
                  onClick={handleScanSuccess}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors"
                >
                  ค้นหารายชื่อแผนก {selectedDept}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-20 h-20 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mb-4">
                  <Clock className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">หมดเวลาเช็คอิน (แผนก {selectedDept})</h3>
                <p className="text-slate-500 mt-2 max-w-xs">เลยกำหนดเวลาเข้าประชุมของแผนก {selectedDept} ({targetTimeRange} น.) หากมีเหตุจำเป็น กรุณาติดต่อผู้ดูแลระบบ</p>
              </div>
            )}
          </div>
        )}

        {step === 'select-name' && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-300 w-full">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 mb-2">
              แผนก {selectedDept}
            </div>
            <h3 className="text-lg font-bold text-slate-900">ค้นหารายชื่อของคุณ</h3>
            <p className="text-slate-500 text-sm mt-1 text-center mb-4">แสดงเฉพาะรายชื่อพนักงานในแผนก {selectedDept}</p>
            
            <div className="w-full relative mb-4">
              <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`พิมพ์ชื่อพนักงานแผนก ${selectedDept}...`}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="w-full space-y-2 max-h-60 overflow-y-auto pr-1">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handleNameSelect(emp)}
                    className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="font-bold text-slate-900">{emp.name}</div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
                      {emp.department || 'IE'}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center p-4 text-slate-500 text-sm border border-dashed border-slate-300 rounded-xl">
                  ไม่พบรายชื่อในแผนก {selectedDept} ที่ยังไม่ได้เช็คอิน
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'meeting' && selectedEmployee && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-300 w-full">
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 mb-2">
                แผนก {selectedEmployee.department || selectedDept}
              </span>
              <p className="text-sm font-medium text-slate-500">คุณกำลังเช็คอินในชื่อ</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{selectedEmployee.name}</h3>
            </div>

            <p className="font-bold text-slate-700 mb-4">คุณจะเข้าร่วมประชุมเช้าหรือไม่?</p>

            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => handleMeetingSelect('join')}
                className="flex flex-col items-center p-4 bg-white border-2 border-emerald-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 transition-colors group"
              >
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <CalendarCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="font-bold text-emerald-700 text-center">เข้าร่วมประชุมเช้า</span>
              </button>
              <button
                onClick={() => handleMeetingSelect('skip')}
                className="flex flex-col items-center p-4 bg-white border-2 border-rose-200 rounded-xl hover:bg-rose-50 hover:border-rose-500 transition-colors group"
              >
                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <CalendarX className="w-6 h-6 text-rose-600" />
                </div>
                <span className="font-bold text-rose-700 text-center">ไม่เข้าร่วมประชุมเช้า</span>
              </button>
            </div>
            
            {isScanMode && (
              <button 
                onClick={() => {
                  localStorage.removeItem('remembered_employee_id');
                  setSelectedEmployee(null);
                  setStep('select-name');
                }}
                className="mt-6 text-sm text-slate-500 underline hover:text-blue-600"
              >
                ไม่ใช่นามสกุล/ชื่อฉันใช่ไหม? กดที่นี่เพื่อเปลี่ยนชื่อ
              </button>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-8 animate-in fade-in duration-300">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="font-bold text-slate-700">กำลังบันทึกข้อมูล...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-4 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">เช็คอินเรียบร้อย!</h3>
            <p className="text-emerald-700 font-medium mt-2 text-center max-w-xs">{message}</p>
            <p className="text-slate-500 text-sm mt-4">บันทึกเวลา: {format(currentTime, 'HH:mm')}</p>
            
            {isScanMode && (
              <p className="text-slate-500 text-sm mt-2 font-medium">สามารถปิดหน้าต่างนี้ได้เลย</p>
            )}
            
            <button
              onClick={resetFlow}
              className="mt-8 px-6 py-2 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors"
            >
              {(onComplete && !isScanMode) ? 'กลับหน้า Dashboard' : (isScanMode ? 'เสร็จสิ้น' : 'กลับหน้าหลัก')}
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center justify-center py-4 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">เกิดข้อผิดพลาด</h3>
            <p className="text-rose-700 font-medium mt-2 text-center max-w-xs">{message}</p>
            
            <button
              onClick={() => setStep('meeting')}
              className="mt-8 px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        )}
      </div>
      
      {/* Custom CSS for scanner animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(100%); }
        }
      `}} />
    </div>
  );
}
