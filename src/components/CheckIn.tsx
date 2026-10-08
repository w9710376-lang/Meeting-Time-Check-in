import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CheckIn as CheckInType, Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { MapPin, CheckCircle, AlertTriangle, Search, Users, CalendarX, CalendarCheck, Edit2, Check, Clock, Building2, Plus, X, Maximize2, Minimize2 } from 'lucide-react';

type Step = 'scan' | 'select-name' | 'meeting' | 'processing' | 'success' | 'error';

export function CheckIn({ onComplete }: { onComplete?: () => void }) {
  const { profile, departments, addDepartment, removeDepartment } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchParams = new URLSearchParams(window.location.search);
  const isScanMode = searchParams.get('mode') === 'scan';
  const urlScanTime = searchParams.get('t');
  const urlDept = searchParams.get('dept') as Department | null;

  const isSuperAdmin = !isScanMode && profile?.appRole === 'super_admin';
  const scopedDept: Department | null =
    !isScanMode && profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;
  const lockedDept: Department | null = isScanMode && urlDept ? urlDept : scopedDept;
  const visibleDepartments: Department[] = lockedDept ? [lockedDept] : departments;
  const canEditTime = !isScanMode && (profile?.canEditTime ?? true);

  const initialDept: Department = lockedDept
    ? lockedDept
    : ((localStorage.getItem('selected_checkin_dept') as Department) || departments[0] || 'IE');

  const [selectedDept, setSelectedDept] = useState<Department>(initialDept || 'IE');
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<Department | null>(null);

  useEffect(() => {
    if (lockedDept) {
      setSelectedDept(lockedDept);
    }
  }, [lockedDept]);

  const handleQuickAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !newDeptInput.trim()) return;
    const res = await addDepartment(newDeptInput);
    if (res.success && res.dept) {
      setSelectedDept(res.dept);
      if (!isScanMode) {
        localStorage.setItem('selected_checkin_dept', res.dept);
      }
    }
    setNewDeptInput('');
    setIsAddingDept(false);
  };

  const handleQuickDeleteDept = async (deptToDelete: Department) => {
    if (!isSuperAdmin || departments.length <= 1) return;
    const res = await removeDepartment(deptToDelete);
    if (res.success) {
      if (selectedDept === deptToDelete) {
        const nextDept = departments.find((d) => d !== deptToDelete) || 'IE';
        setSelectedDept(nextDept);
        localStorage.setItem('selected_checkin_dept', nextDept);
      }
      setConfirmDeleteDept(null);
    }
  };

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
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  useEffect(() => {
    if (!isQrExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsQrExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQrExpanded]);

  // Keep editTimeValue synced when switching departments
  useEffect(() => {
    setEditTimeValue(deptTimeRanges[selectedDept] || defaultTimeRange);
  }, [selectedDept, deptTimeRanges, defaultTimeRange]);

  const handleDeptChange = (dept: Department) => {
    if (lockedDept && dept !== lockedDept) return;
    setSelectedDept(dept);
    setIsEditingTime(false);
    setSelectedEmployee(null);
    setMeetingStatus(null);
    setSearchQuery('');
    if (step === 'meeting') {
      setStep('select-name');
    }
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

      // Update monthly accumulated points in employee profile (resets automatically each new month)
      const currentMonthStr = format(now, 'yyyy-MM');
      const previousMonthlyPoints =
        selectedEmployee.pointsMonth === currentMonthStr ? (selectedEmployee.totalPoints || 0) : 0;
      if (earnedPoints > 0 || selectedEmployee.pointsMonth !== currentMonthStr) {
        setDoc(doc(db, 'employees', selectedEmployee.id), {
          totalPoints: previousMonthlyPoints + earnedPoints,
          pointsMonth: currentMonthStr
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
  const deptEmployees = employees.filter(
    emp => (emp.department || 'IE').trim().toUpperCase() === selectedDept.trim().toUpperCase()
  );
  const filteredEmployees = deptEmployees
    .filter(emp => !checkedInIds.has(emp.id))
    .filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
      <div className="bg-slate-900 px-6 py-7 text-center text-white border-b-4 border-blue-500 relative">
        <h2 className="text-2xl font-bold tracking-tight">Meeting Time Check-in</h2>

        {/* Department Selector Tabs */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="inline-flex flex-wrap justify-center items-center bg-slate-800 p-1 rounded-xl border border-slate-700 gap-1">
            {visibleDepartments.map(dept => (
              <div key={dept} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => handleDeptChange(dept)}
                  disabled={Boolean(lockedDept)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
                    selectedDept === dept
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <span>{lockedDept ? `แผนก ${dept}` : dept}</span>
                  {isSuperAdmin && !lockedDept && departments.length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteDept(dept);
                        setIsAddingDept(false);
                      }}
                      className={`p-0.5 rounded hover:bg-rose-500 hover:text-white transition-colors ${
                        selectedDept === dept ? 'text-blue-200' : 'text-slate-500'
                      }`}
                      title={`ลบแผนก ${dept} (เฉพาะ Super Admin)`}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </div>
            ))}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingDept(!isAddingDept);
                  setConfirmDeleteDept(null);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-400 hover:text-white hover:bg-slate-700/60 transition-all inline-flex items-center gap-1"
                title="เพิ่มแผนกใหม่ (เฉพาะ Super Admin)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มแผนก</span>
              </button>
            )}
          </div>

          {confirmDeleteDept && isSuperAdmin && (
            <div className="inline-flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-rose-500/60 text-xs">
              <span className="text-slate-200 font-semibold">
                ยืนยันลบแผนก <strong className="text-rose-400">{confirmDeleteDept}</strong>?
              </span>
              <button
                type="button"
                onClick={() => handleQuickDeleteDept(confirmDeleteDept)}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors"
              >
                ยืนยันลบ
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteDept(null)}
                className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          )}

          {isAddingDept && isSuperAdmin && (
            <form
              onSubmit={handleQuickAddDept}
              className="inline-flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-blue-500/60"
            >
              <input
                type="text"
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                placeholder="ชื่อแผนกใหม่ (เช่น QA, PE)"
                className="bg-transparent text-white text-xs font-bold outline-none w-36 placeholder:text-slate-500"
                autoFocus
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg p-1 transition-colors"
                title="บันทึกแผนกใหม่"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingDept(false);
                  setNewDeptInput('');
                }}
                className="text-slate-400 hover:text-white p-1 transition-colors"
                title="ยกเลิก"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
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
                <div
                  onClick={() => setIsQrExpanded(true)}
                  title="คลิกเพื่อขยาย QR Code ให้ใหญ่"
                  className="w-64 h-64 bg-white rounded-2xl mb-3 relative overflow-hidden border-2 border-slate-200 hover:border-blue-500 shadow-sm flex items-center justify-center p-5 cursor-pointer group transition-all"
                >
                  {appUrl && <QRCode value={appUrl} size={220} className="w-full h-full text-slate-800" />}
                  <div className="absolute top-2.5 right-2.5 bg-slate-900/80 group-hover:bg-blue-600 text-white p-1.5 rounded-lg shadow transition-colors">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrExpanded(true)}
                  className="mb-5 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl shadow-sm transition-all"
                >
                  <Maximize2 className="w-4 h-4 text-blue-400" />
                  <span>ขยาย QR Code ให้ใหญ่</span>
                </button>
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
      
      {/* Expanded QR Code Modal */}
      {isQrExpanded && step === 'scan' && isCheckInOpen() && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsQrExpanded(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 px-6 py-5 text-white border-b-4 border-blue-500 flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>แผนก {selectedDept}</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight">สแกน QR Code เช็คอินเข้าประชุมเช้า</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  เวลาเข้าประชุม ({selectedDept}): <strong className="text-white">{targetTimeRange} น.</strong> • รอเช็คอิน <strong className="text-amber-400">{filteredEmployees.length} คน</strong>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-3xl font-bold tabular-nums tracking-tight">
                    {format(currentTime, 'HH:mm')}
                    <span className="text-blue-400 text-xl">:{format(currentTime, 'ss')}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">{format(currentTime, 'EEE, MMM d')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrExpanded(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="ปิดหน้าต่างขยาย (ESC)"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {!lockedDept && visibleDepartments.length > 1 && (
              <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 mr-1">เลือกแผนก:</span>
                {visibleDepartments.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleDeptChange(dept)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      selectedDept === dept
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6 sm:p-8 bg-slate-50 flex flex-col items-center">
              <div className="w-[min(76vw,420px)] h-[min(76vw,420px)] bg-white rounded-3xl p-6 border-4 border-blue-500 shadow-xl flex items-center justify-center">
                {appUrl && <QRCode value={appUrl} size={380} className="w-full h-full text-slate-900" />}
              </div>

              <div className="mt-5 text-center">
                <p className="text-base font-bold text-slate-800">
                  นำกล้องโทรศัพท์สแกน QR Code เพื่อเช็คอินแผนก <span className="text-blue-600">{selectedDept}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบรีเฟรชรหัสความปลอดภัยอัตโนมัติทุก 10 วินาที
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsQrExpanded(false)}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-blue-400" />
                <span>ย่อขนาด QR Code</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
