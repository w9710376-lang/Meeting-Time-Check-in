import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Employee, Department } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { EMPLOYEE_LIST } from '../data/employees';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Trash2,
  Power,
  Search,
  Building2,
  Plus,
  Check,
  X,
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  Smartphone,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { getShortDeviceCode } from '../lib/deviceFingerprint';
import { saveCachedEmployees } from '../lib/checkinFastCache';

interface ParsedUploadRow {
  rowIndex: number;
  rawId: string;
  name: string;
  fileDept: string;
  isActive: boolean;
  isSample: boolean;
  isValid: boolean;
  selected: boolean;
}

export function EmployeeManager() {
  const { profile, departments, addDepartment } = useAuth();
  const isSuperAdmin = profile?.appRole === 'super_admin';
  const scopedDept =
    profile?.departmentScope && profile.departmentScope !== 'ALL'
      ? profile.departmentScope
      : null;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState<'ALL' | Department>(scopedDept || 'ALL');
  
  // Add new employee state
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState<Department>(scopedDept || 'IE');
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add new department inline state
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState('');

  // Excel Upload & Preview Modal state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelTargetDept, setExcelTargetDept] = useState<Department>(scopedDept || 'IE');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedUploadRow[]>([]);
  const [deptMode, setDeptMode] = useState<'force_selected' | 'use_file_column'>('force_selected');
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleAddDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !newDeptCode.trim()) return;
    const res = await addDepartment(newDeptCode);
    if (res.success && res.dept) {
      setNewDept(res.dept);
      setFilterDept(res.dept);
      setExcelTargetDept(res.dept);
    }
    setNewDeptCode('');
    setIsAddingDept(false);
  };

  useEffect(() => {
    if (scopedDept) {
      setFilterDept(scopedDept);
      setNewDept(scopedDept);
      setExcelTargetDept(scopedDept);
      setDeptMode('force_selected');
    } else {
      setFilterDept('ALL');
    }
  }, [scopedDept]);

  // Sync newDept and excelTargetDept when user clicks a specific department filter button
  const handleSelectFilterDept = (dept: 'ALL' | Department) => {
    setFilterDept(dept);
    if (dept !== 'ALL') {
      setNewDept(dept);
      setExcelTargetDept(dept);
      localStorage.setItem('selected_checkin_dept', dept);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const empData: Employee[] = [];
      snapshot.forEach((doc) => empData.push({ ...doc.data(), id: doc.id, isActive: doc.data().isActive ?? true } as Employee));
      
      // Auto seed if database is empty
      if (empData.length === 0 && !snapshot.metadata.hasPendingWrites) {
        try {
          const batchPromises = EMPLOYEE_LIST.map((emp) => {
            const newEmp: Employee = {
              id: emp.id,
              name: emp.name,
              role: emp.role as 'manager' | 'employee',
              department: 'IE',
              isActive: true,
              createdAt: Date.now()
            };
            return setDoc(doc(db, 'employees', emp.id), newEmp);
          });
          await Promise.all(batchPromises);
          // Snapshot will re-trigger after inserts
        } catch (e) {
          console.error('Failed to seed employees', e);
        }
      }

      empData.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setEmployees(empData);
      saveCachedEmployees(empData);
      setLoading(false);
    }, (error) => {
      console.warn("Offline mode or error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Download Excel Template for the selected department
  const handleDownloadTemplate = () => {
    const targetDept = scopedDept || excelTargetDept || 'IE';
    const templateRows = [
      {
        'ลำดับ': 1,
        'รหัสพนักงาน': '',
        'ชื่อ - นามสกุล': 'ตัวอย่าง: สมชาย ใจดี',
        'แผนก': targetDept,
        'สถานะ': 'เปิดใช้งาน',
      },
      {
        'ลำดับ': 2,
        'รหัสพนักงาน': '',
        'ชื่อ - นามสกุล': 'ตัวอย่าง: สมหญิง รักงาน',
        'แผนก': targetDept,
        'สถานะ': 'เปิดใช้งาน',
      },
      {
        'ลำดับ': 3,
        'รหัสพนักงาน': '',
        'ชื่อ - นามสกุล': '',
        'แผนก': targetDept,
        'สถานะ': 'เปิดใช้งาน',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 10 }, // ลำดับ
      { wch: 20 }, // รหัสพนักงาน
      { wch: 36 }, // ชื่อ - นามสกุล
      { wch: 16 }, // แผนก
      { wch: 16 }, // สถานะ
    ];
    XLSX.utils.book_append_sheet(wb, ws, `รายชื่อแผนก_${targetDept}`);

    const guideRows = [
      { 'หัวข้อ': 'คำแนะนำการกรอกแบบฟอร์มรายชื่อพนักงาน', 'รายละเอียด': '' },
      { 'หัวข้อ': '1. ชื่อ - นามสกุล (จำเป็น)', 'รายละเอียด': 'กรอกชื่อและนามสกุลของพนักงาน (ลบแถวตัวอย่างออกหรือทับแถวตัวอย่างได้เลย)' },
      { 'หัวข้อ': '2. แผนก', 'รายละเอียด': `ระบุชื่อแผนก เช่น ${departments.join(', ')} (ค่าเริ่มต้นตั้งไว้ที่แผนก ${targetDept})` },
      { 'หัวข้อ': '3. รหัสพนักงาน (เว้นว่างได้)', 'รายละเอียด': 'หากเว้นว่าง ระบบจะสร้างรหัสพนักงานให้อัตโนมัติเมื่ออัปโหลด' },
      { 'หัวข้อ': '4. สถานะ', 'รายละเอียด': 'ใส่ "เปิดใช้งาน" หรือ "ปิดใช้งาน" (หากเว้นว่างจะเป็น เปิดใช้งาน อัตโนมัติ)' },
    ];
    const wsGuide = XLSX.utils.json_to_sheet(guideRows);
    wsGuide['!cols'] = [{ wch: 32 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'คำแนะนำ');

    XLSX.writeFile(wb, `Template_Employees_${targetDept}.xlsx`);
  };

  // 2. Export Current Filtered Roster to Excel
  const handleExportCurrentRoster = () => {
    const deptLabel = filterDept === 'ALL' ? 'ALL_Departments' : filterDept;
    const exportRows = filteredEmployees.map((emp, idx) => ({
      'ลำดับ': idx + 1,
      'รหัสพนักงาน': emp.id,
      'ชื่อ - นามสกุล': emp.name,
      'แผนก': emp.department || 'IE',
      'สถานะ': emp.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      exportRows.length > 0
        ? exportRows
        : [
            {
              'ลำดับ': 1,
              'รหัสพนักงาน': '',
              'ชื่อ - นามสกุล': '',
              'แผนก': filterDept === 'ALL' ? excelTargetDept : filterDept,
              'สถานะ': 'เปิดใช้งาน',
            },
          ]
    );
    ws['!cols'] = [
      { wch: 10 },
      { wch: 20 },
      { wch: 36 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, `Employees_${deptLabel}`);
    XLSX.writeFile(wb, `Employees_List_${deptLabel}.xlsx`);
  };

  // 3. Parse Uploaded Excel File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFeedback(null);
    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        const rows: ParsedUploadRow[] = [];

        rawJson.forEach((record, index) => {
          const keys = Object.keys(record);
          // Helper to match column keys loosely
          const findValue = (candidates: string[]) => {
            for (const key of keys) {
              const normKey = key.trim().toLowerCase();
              if (candidates.some((c) => normKey === c || normKey.includes(c))) {
                return String(record[key] ?? '').trim();
              }
            }
            return '';
          };

          let nameVal = findValue(['ชื่อ - นามสกุล', 'ชื่อ-นามสกุล', 'ชื่อ', 'รายชื่อ', 'full name', 'fullname', 'name']);
          // Fallback: if only 1-2 columns exist and no header matched, check if first text column is a name
          if (!nameVal && keys.length > 0) {
            for (const k of keys) {
              const v = String(record[k] ?? '').trim();
              if (v && isNaN(Number(v)) && !departments.includes(v.toUpperCase())) {
                nameVal = v;
                break;
              }
            }
          }

          const idVal = findValue(['รหัสพนักงาน', 'รหัส', 'employee id', 'emp id', 'id']);
          const deptVal = findValue(['แผนก', 'สังกัด', 'department', 'dept']).toUpperCase();
          const statusVal = findValue(['สถานะ', 'status']).toLowerCase();

          // Skip completely empty rows
          if (!nameVal && !idVal) {
            return;
          }

          const isSample =
            nameVal.startsWith('ตัวอย่าง:') ||
            nameVal.startsWith('ตัวอย่าง ') ||
            nameVal.toLowerCase().startsWith('example:');

          const cleanedName = nameVal.replace(/^ตัวอย่าง\s*:\s*/i, '').trim();
          const isActive =
            statusVal === 'ปิดใช้งาน' || statusVal === 'inactive' || statusVal === 'false' || statusVal === '0'
              ? false
              : true;

          const isValid = cleanedName.length > 0;

          rows.push({
            rowIndex: index + 2, // Excel row number (1-indexed + header)
            rawId: idVal,
            name: isSample ? nameVal : cleanedName,
            fileDept: deptVal,
            isActive,
            isSample,
            isValid,
            selected: isValid && !isSample,
          });
        });

        setParsedRows(rows);
        setIsPreviewOpen(true);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        setImportFeedback({
          type: 'error',
          message: 'ไม่สามารถอ่านไฟล์ Excel ได้ กรุณาตรวจสอบรูปแบบไฟล์ (.xlsx หรือ .xls)',
        });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Resolve target department for a single row based on mode and permissions
  const resolveRowDepartment = (row: ParsedUploadRow): Department => {
    if (scopedDept) {
      return scopedDept;
    }
    if (deptMode === 'use_file_column' && row.fileDept) {
      return row.fileDept;
    }
    return excelTargetDept;
  };

  // Find if a row matches an existing employee
  const findExistingMatch = (row: ParsedUploadRow) => {
    const targetDept = resolveRowDepartment(row);
    const normName = row.name.replace(/^ตัวอย่าง\s*:\s*/i, '').trim().toLowerCase();

    if (row.rawId) {
      const byId = employees.find((e) => e.id.toLowerCase() === row.rawId.toLowerCase());
      if (byId) return { employee: byId, sameDept: (byId.department || 'IE') === targetDept };
    }

    const bySameDeptName = employees.find(
      (e) => e.name.trim().toLowerCase() === normName && (e.department || 'IE') === targetDept
    );
    if (bySameDeptName) {
      return { employee: bySameDeptName, sameDept: true };
    }

    const byAnyDeptName = employees.find((e) => e.name.trim().toLowerCase() === normName);
    if (byAnyDeptName) {
      return { employee: byAnyDeptName, sameDept: false };
    }

    return null;
  };

  const toggleRowSelection = (idx: number) => {
    setParsedRows((prev) =>
      prev.map((r, i) => (i === idx && r.isValid ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleSelectAllValid = (checked: boolean) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.isValid ? { ...r, selected: checked } : r))
    );
  };

  // Confirm & Execute Import to Firestore
  const handleConfirmImport = async () => {
    const selectedRows = parsedRows.filter((r) => r.selected && r.isValid);
    if (selectedRows.length === 0) return;

    setIsImporting(true);
    setImportFeedback(null);

    try {
      // If Super Admin and using file departments, register any new departments first
      if (isSuperAdmin && deptMode === 'use_file_column') {
        const uniqueFileDepts = Array.from(
          new Set(selectedRows.map((r) => resolveRowDepartment(r)).filter(Boolean))
        );
        for (const d of uniqueFileDepts) {
          if (!departments.includes(d)) {
            await addDepartment(d);
          }
        }
      }

      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      // Track names added in this batch to avoid self-duplicates within the same Excel file
      const seenInBatch = new Set<string>();
      const operations: Array<{ ref: ReturnType<typeof doc>; data: Employee; isUpdate: boolean }> = [];

      for (const row of selectedRows) {
        const cleanName = row.name.replace(/^ตัวอย่าง\s*:\s*/i, '').trim();
        if (!cleanName) continue;

        const targetDept = resolveRowDepartment(row);
        const batchKey = `${cleanName.toLowerCase()}__${targetDept}`;
        if (seenInBatch.has(batchKey)) {
          skippedCount++;
          continue;
        }
        seenInBatch.add(batchKey);

        const existingMatch = findExistingMatch(row);

        if (existingMatch) {
          if (duplicateAction === 'skip') {
            skippedCount++;
            continue;
          } else {
            // Update existing employee record (respecting scopedDept if not super admin)
            if (scopedDept && (existingMatch.employee.department || 'IE') !== scopedDept) {
              skippedCount++;
              continue;
            }
            const updatedEmp: Employee = {
              ...existingMatch.employee,
              name: cleanName,
              department: targetDept,
              isActive: row.isActive,
            };
            operations.push({
              ref: doc(db, 'employees', existingMatch.employee.id),
              data: updatedEmp,
              isUpdate: true,
            });
            updatedCount++;
          }
        } else {
          const newId =
            row.rawId && !employees.some((e) => e.id === row.rawId)
              ? row.rawId
              : 'EMP-' + Math.random().toString(36).substring(2, 11).toUpperCase();

          const newEmp: Employee = {
            id: newId,
            name: cleanName,
            role: 'employee',
            department: targetDept,
            isActive: row.isActive,
            createdAt: Date.now(),
          };
          operations.push({
            ref: doc(db, 'employees', newId),
            data: newEmp,
            isUpdate: false,
          });
          addedCount++;
        }
      }

      // Commit in Firestore batches of 400
      const CHUNK_SIZE = 400;
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((op) => {
          batch.set(op.ref, op.data, { merge: op.isUpdate });
        });
        await batch.commit();
      }

      // Switch filter to target department so user immediately sees their uploaded employees
      if (deptMode === 'force_selected') {
        setFilterDept(excelTargetDept);
      }

      setIsPreviewOpen(false);
      setParsedRows([]);
      setImportFeedback({
        type: 'success',
        message: `อัปโหลดสำเร็จ! เพิ่มพนักงานใหม่ ${addedCount} คน${
          updatedCount > 0 ? `, อัปเดตข้อมูล ${updatedCount} คน` : ''
        }${skippedCount > 0 ? `, ข้ามรายชื่อซ้ำ ${skippedCount} คน` : ''}`,
      });
    } catch (error) {
      console.error('Error importing employees from Excel:', error);
      setImportFeedback({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการบันทึกรายชื่อลงฐานข้อมูล กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    setIsAdding(true);
    try {
      const id = 'EMP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const newEmp: Employee = {
        id,
        name: newName.trim(),
        role: 'employee',
        department: newDept,
        isActive: true,
        createdAt: Date.now()
      };
      await setDoc(doc(db, 'employees', id), newEmp);
      setNewName('');
    } catch (error) {
      console.error("Error adding employee:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDepartmentChange = async (emp: Employee, dept: Department) => {
    try {
      await updateDoc(doc(db, 'employees', emp.id), {
        department: dept
      });
    } catch (error) {
      console.error("Error updating department:", error);
    }
  };

  const toggleStatus = async (emp: Employee) => {
    try {
      await updateDoc(doc(db, 'employees', emp.id), {
        isActive: !emp.isActive
      });
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      setConfirmDeleteId(null);
    } catch (error) {
      console.error("Error deleting employee:", error);
    }
  };

  const resetDeviceBinding = async (emp: Employee) => {
    if (!isSuperAdmin) {
      setImportFeedback({
        type: 'error',
        message: 'เฉพาะ Super Admin (ผู้ดูแลระบบกลาง) เท่านั้นที่สามารถรีเซ็ตเครื่องที่ผูกได้',
      });
      return;
    }
    try {
      await updateDoc(doc(db, 'employees', emp.id), {
        boundDeviceId: null,
        boundHardwareSig: null,
        boundDeviceLabel: null,
        boundAt: null,
      });
      setImportFeedback({
        type: 'success',
        message: `ปลดล็อกเครื่องมือถือของ "${emp.name}" เรียบร้อยแล้ว พนักงานสามารถสแกนเพื่อผูกมือถือเครื่องใหม่ได้ทันที`,
      });
    } catch (error) {
      console.error('Error resetting device binding:', error);
      setImportFeedback({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการรีเซ็ตเครื่องที่ผูก กรุณาลองใหม่',
      });
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const empDept = emp.department || 'IE';
    const matchesDept = filterDept === 'ALL' || empDept === filterDept;
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  // Summary counts for the preview modal
  const previewStats = parsedRows.reduce(
    (acc, row) => {
      if (!row.isValid) {
        acc.invalid++;
        return acc;
      }
      if (!row.selected) {
        acc.unselected++;
        return acc;
      }
      const match = findExistingMatch(row);
      if (match) {
        acc.duplicate++;
      } else {
        acc.newCount++;
      }
      return acc;
    },
    { newCount: 0, duplicate: 0, invalid: 0, unselected: 0 }
  );

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">กำลังโหลดข้อมูลพนักงาน...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">จัดการรายชื่อพนักงานแยกตามแผนก</h1>
          <p className="text-sm text-slate-500">เพิ่ม ลบ ย้ายสังกัดแผนก หรือนำเข้ารายชื่อพนักงานด้วยไฟล์ Excel ({departments.join(', ')})</p>
        </div>
      </div>

      {/* Excel Template Download & Upload Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 p-5 rounded-2xl border border-emerald-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>นำเข้ารายชื่อพนักงานด้วย Excel แยกตามแผนก</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  แผนกเป้าหมาย: {scopedDept || excelTargetDept}
                </span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                1. เลือกแผนกที่ต้องการ &rarr; 2. กดดาวน์โหลดฟอร์ม Excel ออกไปกรอกรายชื่อ &rarr; 3. กดอัปโหลดไฟล์ Excel กลับเข้าแผนกนั้นทันที
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Target Department Selector for Excel */}
            <div className="flex items-center gap-2 bg-white border border-emerald-300 rounded-xl px-3 py-2 shadow-xs">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-500">แผนก:</span>
              <select
                value={scopedDept || excelTargetDept}
                onChange={(e) => {
                  const val = e.target.value as Department;
                  setExcelTargetDept(val);
                  setNewDept(val);
                  setFilterDept(val);
                }}
                disabled={Boolean(scopedDept)}
                className="bg-transparent font-bold text-emerald-800 text-sm outline-none cursor-pointer"
              >
                {(scopedDept ? [scopedDept] : departments).map((dept) => (
                  <option key={dept} value={dept}>
                    แผนก {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 1: Download Blank Form Template */}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-xs sm:text-sm rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
              title={`ดาวน์โหลดแบบฟอร์มเปล่าสำหรับกรอกรายชื่อแผนก ${scopedDept || excelTargetDept}`}
            >
              <Download className="w-4 h-4" />
              <span>1. ดาวน์โหลดแบบฟอร์ม ({scopedDept || excelTargetDept})</span>
            </button>

            {/* Step 2: Upload Filled Form */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors inline-flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>2. อัปโหลดรายชื่อเข้าแผนก {scopedDept || excelTargetDept}</span>
            </button>

            {/* Optional: Export Current List */}
            <button
              type="button"
              onClick={handleExportCurrentRoster}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="ส่งออกรายชื่อพนักงานที่แสดงอยู่ในตารางเป็นไฟล์ Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ส่งออกรายชื่อ ({filterDept === 'ALL' ? 'ทุกแผนก' : filterDept})</span>
            </button>
          </div>
        </div>

        {importFeedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm font-bold ${
              importFeedback.type === 'success'
                ? 'bg-emerald-100/90 border-emerald-300 text-emerald-900'
                : 'bg-rose-100 border-rose-300 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {importFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{importFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportFeedback(null)}
              className="p-1 hover:bg-black/5 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <form onSubmit={handleAddEmployee} className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-500">แผนก:</span>
            <select
              value={newDept}
              onChange={(e) => {
                const val = e.target.value as Department;
                setNewDept(val);
                setExcelTargetDept(val);
              }}
              className="bg-transparent font-bold text-slate-800 text-sm outline-none cursor-pointer"
              disabled={isAdding || Boolean(scopedDept)}
            >
              {(scopedDept ? [scopedDept] : departments).map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อ - นามสกุล พนักงานใหม่ (เพิ่มรายคน)..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            disabled={isAdding}
          />
          <button
            type="submit"
            disabled={!newName.trim() || isAdding}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center shadow-sm"
          >
            {isAdding ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><UserPlus className="w-5 h-5 mr-2" /> เพิ่มเข้าแผนก {newDept}</>}
          </button>
        </form>

        {/* Department Filter Buttons + Add New Dept */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {!scopedDept && (
            <button
              type="button"
              onClick={() => handleSelectFilterDept('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filterDept === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ทุกแผนก ({employees.length})
            </button>
          )}
          {(scopedDept ? [scopedDept] : departments).map(dept => {
            const count = employees.filter(e => (e.department || 'IE') === dept).length;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => handleSelectFilterDept(dept)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  filterDept === dept
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {dept} ({count})
              </button>
            );
          })}
          {isSuperAdmin && (
            isAddingDept ? (
              <form onSubmit={handleAddDeptSubmit} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-300 rounded-xl px-2.5 py-1">
                <input
                  type="text"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  placeholder="ชื่อแผนกใหม่ (เช่น QA)"
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none w-32"
                  autoFocus
                />
                <button type="submit" className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="บันทึกแผนก">
                  <Check className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => setIsAddingDept(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingDept(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors inline-flex items-center gap-1"
                title="เฉพาะ Super Admin เท่านั้นที่เพิ่มแผนกได้"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มแผนก</span>
              </button>
            )
          )}
        </div>

        <div className="relative mb-6">
          <Search className="w-5 h-5 absolute left-4 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหารายชื่อพนักงาน..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-300 outline-none transition-all"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-sm font-bold text-slate-500">
                <th className="py-3 px-4 w-16 text-center">No.</th>
                <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                <th className="py-3 px-4 text-center">แผนก</th>
                <th className="py-3 px-4 text-center">อุปกรณ์ที่ผูก (1:1)</th>
                <th className="py-3 px-4 text-center">สถานะ</th>
                <th className="py-3 px-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp, index) => (
                <tr key={emp.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${!emp.isActive ? 'opacity-60' : ''}`}>
                  <td className="py-3 px-4 text-center text-slate-500 font-medium tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{emp.name}</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={emp.department || 'IE'}
                      onChange={(e) => handleDepartmentChange(emp, e.target.value as Department)}
                      disabled={Boolean(scopedDept)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 outline-none cursor-pointer hover:bg-blue-100 transition-colors disabled:opacity-75 disabled:cursor-default"
                    >
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {emp.boundDeviceId ? (
                      <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-2">
                        <div className="text-left">
                          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 tabular-nums">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{getShortDeviceCode(emp.boundDeviceId)}</span>
                          </div>
                          {emp.boundDeviceLabel && (
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {emp.boundDeviceLabel}
                            </p>
                          )}
                        </div>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => resetDeviceBinding(emp)}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                            title="ปลดล็อกเครื่องเดิม เพื่อให้พนักงานผูกกับโทรศัพท์เครื่องใหม่ได้ (เฉพาะ Super Admin)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>รีเซ็ตเครื่อง</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>รอผูกเมื่อสแกนครั้งแรก</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleStatus(emp)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-colors ${emp.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                      title={emp.isActive ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                    >
                      <Power className="w-3 h-3 mr-1" />
                      {emp.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {confirmDeleteId === emp.id ? (
                      <div className="inline-flex items-center space-x-1">
                        <button
                          onClick={() => deleteEmployee(emp.id)}
                          className="px-2.5 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors"
                        >
                          ยืนยันลบ
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(emp.id)}
                        className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors inline-flex"
                        title="ลบพนักงาน"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="mb-4">ไม่พบรายชื่อพนักงานในหมวดที่เลือก</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excel Preview & Validation Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">ตรวจสอบรายชื่อก่อนนำเข้า (Excel Preview)</h3>
                  <p className="text-xs text-slate-300">
                    ไฟล์: <span className="font-semibold text-white">{uploadedFileName}</span> ({parsedRows.length} แถวที่พบข้อมูล)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                disabled={isImporting}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configuration & Summary Bar */}
            <div className="p-5 bg-slate-50 border-b border-slate-200 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Target Department Selection */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 mb-2">
                    1. เลือกแผนกปลายทางที่จะนำเข้ารายชื่อ
                  </label>
                  {scopedDept ? (
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                      <Building2 className="w-4 h-4" />
                      <span>นำเข้าเฉพาะแผนก {scopedDept} (ตามสิทธิ์ผู้ใช้งาน)</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id="mode_force"
                          name="deptMode"
                          checked={deptMode === 'force_selected'}
                          onChange={() => setDeptMode('force_selected')}
                          className="accent-emerald-600"
                        />
                        <label htmlFor="mode_force" className="text-xs font-bold text-slate-800 cursor-pointer">
                          นำเข้าทุกคนเข้าแผนก:
                        </label>
                        <select
                          value={excelTargetDept}
                          onChange={(e) => setExcelTargetDept(e.target.value as Department)}
                          disabled={deptMode !== 'force_selected'}
                          className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold outline-none"
                        >
                          {departments.map((d) => (
                            <option key={d} value={d}>
                              แผนก {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id="mode_file"
                          name="deptMode"
                          checked={deptMode === 'use_file_column'}
                          onChange={() => setDeptMode('use_file_column')}
                          className="accent-emerald-600"
                        />
                        <label htmlFor="mode_file" className="text-xs font-bold text-slate-700 cursor-pointer">
                          ใช้คอลัมน์ "แผนก" ตามที่ระบุในไฟล์ Excel (หากว่างให้เข้า {excelTargetDept})
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Duplicate Handling Mode */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 mb-2">
                    2. กรณีพบรายชื่อซ้ำกับที่มีอยู่แล้วในระบบ
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="dupMode"
                        checked={duplicateAction === 'skip'}
                        onChange={() => setDuplicateAction('skip')}
                        className="accent-emerald-600"
                      />
                      <span>ข้ามรายชื่อที่ซ้ำ (เพิ่มเฉพาะพนักงานใหม่เท่านั้น)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="dupMode"
                        checked={duplicateAction === 'update'}
                        onChange={() => setDuplicateAction('update')}
                        className="accent-emerald-600"
                      />
                      <span>อัปเดตทับข้อมูลเดิม (อัปเดตแผนกและสถานะตามไฟล์ Excel)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Summary Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    เพิ่มใหม่: {previewStats.newCount} คน
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    รายชื่อซ้ำ: {previewStats.duplicate} คน ({duplicateAction === 'skip' ? 'จะถูกข้าม' : 'จะถูกอัปเดต'})
                  </span>
                  {previewStats.unselected > 0 && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                      ไม่เลือกนำเข้า (รวมแถวตัวอย่าง): {previewStats.unselected} แถว
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleSelectAllValid(true)}
                    className="text-blue-600 hover:underline font-bold"
                  >
                    เลือกทั้งหมด
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAllValid(false)}
                    className="text-slate-500 hover:underline font-bold"
                  >
                    ยกเลิกทั้งหมด
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {parsedRows.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <HelpCircle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold">ไม่พบข้อมูลรายชื่อพนักงานในไฟล์ Excel นี้</p>
                  <p className="text-xs mt-1">กรุณาตรวจสอบว่ามีคอลัมน์ "ชื่อ - นามสกุล" และมีข้อมูลอย่างน้อย 1 แถว</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50">
                      <th className="py-2.5 px-3 w-12 text-center">เลือก</th>
                      <th className="py-2.5 px-3 w-16 text-center">แถว</th>
                      <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                      <th className="py-2.5 px-3 text-center">แผนกที่จะเข้า</th>
                      <th className="py-2.5 px-3 text-center">สถานะใช้งาน</th>
                      <th className="py-2.5 px-3 text-right">ผลการตรวจสอบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, idx) => {
                      const targetDept = resolveRowDepartment(row);
                      const existing = findExistingMatch(row);

                      return (
                        <tr
                          key={idx}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${
                            !row.selected ? 'opacity-50 bg-slate-50/50' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={!row.isValid}
                              onChange={() => toggleRowSelection(idx)}
                              className="w-4 h-4 accent-emerald-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs text-slate-400 font-mono">
                            #{row.rowIndex}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">
                            {row.name || <span className="text-rose-500 italic">ไม่มีชื่อ</span>}
                            {row.rawId && (
                              <span className="ml-2 text-[11px] font-mono text-slate-400">
                                ({row.rawId})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {targetDept}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                row.isActive
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {row.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {row.isSample ? (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
                                แถวตัวอย่าง (ข้ามอัตโนมัติ)
                              </span>
                            ) : !row.isValid ? (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                ข้อมูลไม่ครบ
                              </span>
                            ) : existing ? (
                              existing.sameDept ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                  มีชื่อแล้วในแผนก {existing.employee.department || 'IE'}
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                                  อยู่แผนก {existing.employee.department || 'IE'} (ซ้ำชื่อ)
                                </span>
                              )
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                พร้อมเพิ่มใหม่
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                * แถวที่มีคำว่า "ตัวอย่าง:" จะถูกติ๊กออกให้อัตโนมัติเพื่อป้องกันการนำเข้าข้อมูลตัวอย่างโดยไม่ตั้งใจ
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  disabled={isImporting}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm rounded-xl transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={
                    isImporting ||
                    (previewStats.newCount === 0 &&
                      (duplicateAction === 'skip' || previewStats.duplicate === 0))
                  }
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl transition-colors inline-flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังนำเข้าข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        ยืนยันนำเข้า ({previewStats.newCount + (duplicateAction === 'update' ? previewStats.duplicate : 0)} คน)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

