import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  UserAccount,
  AppRole,
  Department,
  DepartmentScope,
  DEPARTMENTS,
  Employee,
  Role,
} from '../types';
import {
  Shield,
  UserPlus,
  KeyRound,
  Check,
  Trash2,
  Building2,
  Users,
  Search,
  Lock,
  CheckCircle2,
} from 'lucide-react';

export function RoleManager() {
  const { accounts, profile } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'accounts' | 'employees'>('accounts');

  // New Account Form State
  const [newName, setNewName] = useState('');
  const [newAppRole, setNewAppRole] = useState<AppRole>('dept_manager');
  const [newDeptScope, setNewDeptScope] = useState<DepartmentScope>('IE');
  const [newPin, setNewPin] = useState('1234');
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // Inline PIN editing state
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [tempPinValue, setTempPinValue] = useState('');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [confirmDeleteAccId, setConfirmDeleteAccId] = useState<string | null>(null);

  // Employee Role Management State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [empDeptFilter, setEmpDeptFilter] = useState<'ALL' | Department>('ALL');
  const [empRoleFilter, setEmpRoleFilter] = useState<'ALL' | Role>('ALL');

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Employee[] = [];
        snap.forEach((d) =>
          list.push({ ...(d.data() as Employee), id: d.id, isActive: d.data().isActive ?? true })
        );
        list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setEmployees(list);
      },
      console.warn
    );
    return () => unsub();
  }, []);

  const showSavedMessage = (msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => {
      setSavedBanner(null);
    }, 2500);
  };

  // Automatically set default permissions when selecting role preset in Add Form
  const handlePresetRoleChange = (role: AppRole) => {
    setNewAppRole(role);
    if (role === 'super_admin') {
      setNewDeptScope('ALL');
    } else if (role === 'dept_manager' && newDeptScope === 'ALL') {
      setNewDeptScope('IE');
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPin.trim()) return;

    setIsAddingAccount(true);
    try {
      const id = 'acc-' + Math.random().toString(36).substring(2, 9);
      const isSuper = newAppRole === 'super_admin';
      const isManager = newAppRole === 'super_admin' || newAppRole === 'dept_manager';

      const newAcc: UserAccount = {
        id,
        username: id,
        name: newName.trim(),
        pin: newPin.trim(),
        role: isManager ? 'manager' : 'employee',
        appRole: newAppRole,
        departmentScope: isSuper ? 'ALL' : newDeptScope,
        canEditTime: isManager,
        canManageEmployees: isManager,
        canViewReports: isManager,
        canManageRoles: isSuper,
        isActive: true,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'accounts', id), newAcc);
      setNewName('');
      setNewPin('1234');
      showSavedMessage(`เพิ่มบัญชี "${newAcc.name}" เรียบร้อยแล้ว`);
    } catch (error) {
      console.error('Error creating account:', error);
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleUpdateAccountField = async (acc: UserAccount, updates: Partial<UserAccount>) => {
    try {
      // If appRole changes, sync base role & defaults
      if (updates.appRole) {
        if (updates.appRole === 'super_admin') {
          updates.role = 'manager';
          updates.departmentScope = 'ALL';
          updates.canEditTime = true;
          updates.canManageEmployees = true;
          updates.canViewReports = true;
          updates.canManageRoles = true;
        } else if (updates.appRole === 'dept_manager') {
          updates.role = 'manager';
          if (acc.departmentScope === 'ALL') updates.departmentScope = 'IE';
          updates.canEditTime = true;
          updates.canManageEmployees = true;
          updates.canViewReports = true;
          updates.canManageRoles = false;
        } else if (updates.appRole === 'qr_kiosk') {
          updates.role = 'employee';
          updates.canEditTime = false;
          updates.canManageEmployees = false;
          updates.canViewReports = false;
          updates.canManageRoles = false;
        }
      }
      await setDoc(doc(db, 'accounts', acc.id), { ...acc, ...updates }, { merge: true });
      showSavedMessage(`อัปเดตสิทธิ์ของ "${acc.name}" เรียบร้อยแล้ว`);
    } catch (err) {
      console.error('Error updating account:', err);
    }
  };

  const handleSavePin = async (acc: UserAccount) => {
    if (!tempPinValue.trim()) return;
    await handleUpdateAccountField(acc, { pin: tempPinValue.trim() });
    setEditingPinId(null);
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'accounts', id));
      setConfirmDeleteAccId(null);
      showSavedMessage('ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว');
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  // Employee Role & Department Updates
  const handleEmployeeRoleUpdate = async (emp: Employee, newRole: Role) => {
    try {
      await updateDoc(doc(db, 'employees', emp.id), { role: newRole });
      showSavedMessage(
        `ตั้งค่า Role ของ ${emp.name} เป็น "${newRole === 'manager' ? 'หัวหน้างาน (Manager)' : 'พนักงาน (Employee)'}" แล้ว`
      );
    } catch (err) {
      console.error('Error updating employee role:', err);
    }
  };

  const handleEmployeeDeptUpdate = async (emp: Employee, newDept: Department) => {
    try {
      await updateDoc(doc(db, 'employees', emp.id), { department: newDept });
      showSavedMessage(`ย้ายแผนกของ ${emp.name} ไปยังแผนก ${newDept} แล้ว`);
    } catch (err) {
      console.error('Error updating employee department:', err);
    }
  };

  const handleCreateAccountFromEmployee = async (emp: Employee) => {
    const dept = emp.department || 'IE';
    const accId = `emp-acc-${emp.id.toLowerCase()}`;
    const existing = accounts.find((a) => a.id === accId || a.name === emp.name);
    if (existing) {
      showSavedMessage(`มีบัญชีของ "${emp.name}" ในระบบแล้ว (รหัส PIN: ${existing.pin})`);
      setActiveSubTab('accounts');
      return;
    }

    const newAcc: UserAccount = {
      id: accId,
      username: accId,
      name: `${emp.name} (${dept})`,
      pin: '1234',
      role: 'manager',
      appRole: 'dept_manager',
      departmentScope: dept,
      canEditTime: true,
      canManageEmployees: true,
      canViewReports: true,
      canManageRoles: false,
      isActive: true,
      createdAt: Date.now(),
    };

    try {
      await setDoc(doc(db, 'accounts', accId), newAcc);
      showSavedMessage(`สร้างบัญชีเข้าสู่ระบบให้ "${emp.name}" สำเร็จ (รหัส PIN เริ่มต้น: 1234)`);
      setActiveSubTab('accounts');
    } catch (err) {
      console.error('Error creating account for employee:', err);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const dept = emp.department || 'IE';
    const matchesDept = empDeptFilter === 'ALL' || dept === empDeptFilter;
    const matchesRole = empRoleFilter === 'ALL' || emp.role === empRoleFilter;
    const matchesSearch = emp.name.toLowerCase().includes(empSearch.toLowerCase());
    return matchesDept && matchesRole && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            ตั้งค่า Role และสิทธิ์การเข้าใช้งาน (Role & Access Control)
          </h1>
          <p className="text-sm text-slate-500">
            กำหนดรหัสผ่าน (PIN), ขอบเขตแผนก (IE, EE, ME, MES, MER) และสิทธิ์ของหัวหน้าแผนกหรือพนักงาน
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('accounts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 whitespace-nowrap ${
              activeSubTab === 'accounts'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-4 h-4 text-blue-600" />
            <span>1. บัญชี Login & สิทธิ์แอดมิน ({accounts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('employees')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 whitespace-nowrap ${
              activeSubTab === 'employees'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>2. ตั้งค่า Role พนักงานรายบุคคล ({employees.length})</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {activeSubTab === 'accounts' ? (
        <div className="space-y-6">
          {/* Add New Login Account Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              <span>เพิ่มบัญชีผู้ใช้งาน / หัวหน้าแผนกใหม่</span>
            </h2>

            <form onSubmit={handleAddAccount} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ชื่อบัญชี / ชื่อผู้ใช้งาน
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="เช่น หัวหน้าแผนก IE (คุณสมชาย)"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ระดับสิทธิ์ (Role)
                </label>
                <select
                  value={newAppRole}
                  onChange={(e) => handlePresetRoleChange(e.target.value as AppRole)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="dept_manager">Department Manager (หัวหน้าแผนก)</option>
                  <option value="super_admin">Super Admin (ผู้ดูแลระบบสูงสุด)</option>
                  <option value="qr_kiosk">QR Kiosk (จุดแสดง QR Code)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  แผนกที่รับผิดชอบ
                </label>
                <select
                  value={newAppRole === 'super_admin' ? 'ALL' : newDeptScope}
                  disabled={newAppRole === 'super_admin'}
                  onChange={(e) => setNewDeptScope(e.target.value as DepartmentScope)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="ALL">ทุกแผนก (ALL)</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      แผนก {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  รหัส PIN / รหัสผ่าน
                </label>
                <input
                  type="text"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="เช่น 1234"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-1">
                <button
                  type="submit"
                  disabled={!newName.trim() || !newPin.trim() || isAddingAccount}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
                >
                  + เพิ่ม
                </button>
              </div>
            </form>
          </div>

          {/* Accounts & Permissions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  รายการบัญชีผู้ใช้งานและตารางกำหนดสิทธิ์ (Role Matrix)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  คลิกเปลี่ยน Role, แผนกสังกัด, รหัส PIN หรือติ๊กเปิด-ปิดสิทธิ์ย่อยของแต่ละบัญชีได้ทันที
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 whitespace-nowrap">
                    <th className="py-3.5 px-4">ชื่อบัญชีผู้ใช้งาน</th>
                    <th className="py-3.5 px-4">ระดับ Role</th>
                    <th className="py-3.5 px-4 text-center">แผนกที่ดูแล</th>
                    <th className="py-3.5 px-4 text-center">รหัส PIN เข้าใช้งาน</th>
                    <th className="py-3.5 px-3 text-center">แก้เวลาประชุม</th>
                    <th className="py-3.5 px-3 text-center">จัดการพนักงาน</th>
                    <th className="py-3.5 px-3 text-center">ดูรายงาน/Excel</th>
                    <th className="py-3.5 px-3 text-center">ตั้งค่า Role</th>
                    <th className="py-3.5 px-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const isCurrentUser = profile?.id === acc.id;
                    return (
                      <tr
                        key={acc.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors text-sm"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center space-x-2">
                            <span>{acc.name}</span>
                            {isCurrentUser && (
                              <span className="text-[11px] font-semibold text-blue-600">
                                · กำลังใช้งาน
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={acc.appRole}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, {
                                appRole: e.target.value as AppRole,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 outline-none cursor-pointer hover:bg-slate-200"
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="dept_manager">Dept Manager</option>
                            <option value="qr_kiosk">QR Kiosk</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <select
                            value={acc.departmentScope}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, {
                                departmentScope: e.target.value as DepartmentScope,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 outline-none cursor-pointer hover:bg-blue-100"
                          >
                            <option value="ALL">ทุกแผนก (ALL)</option>
                            {DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>
                                แผนก {dept}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {editingPinId === acc.id ? (
                            <div className="inline-flex items-center space-x-1">
                              <input
                                type="text"
                                value={tempPinValue}
                                onChange={(e) => setTempPinValue(e.target.value)}
                                className="w-20 px-2 py-1 text-xs font-mono font-bold text-center border border-blue-400 rounded-lg outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePin(acc)}
                                className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                title="บันทึกรหัส PIN"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPinId(acc.id);
                                setTempPinValue(acc.pin);
                              }}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-xs font-bold tabular-nums transition-colors"
                              title="คลิกเพื่อเปลี่ยนรหัส PIN"
                            >
                              <KeyRound className="w-3 h-3 text-slate-500" />
                              <span>{acc.pin}</span>
                            </button>
                          )}
                        </td>

                        {/* Granular Permission Checkboxes */}
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={acc.canEditTime}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, { canEditTime: e.target.checked })
                            }
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={acc.canManageEmployees}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, {
                                canManageEmployees: e.target.checked,
                              })
                            }
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={acc.canViewReports}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, { canViewReports: e.target.checked })
                            }
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={acc.canManageRoles}
                            onChange={(e) =>
                              handleUpdateAccountField(acc, { canManageRoles: e.target.checked })
                            }
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {acc.id === 'super-admin' ? (
                            <span className="text-xs text-slate-400">บัญชีหลัก</span>
                          ) : confirmDeleteAccId === acc.id ? (
                            <div className="inline-flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteAccount(acc.id)}
                                className="px-2 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAccId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAccId(acc.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                              title="ลบบัญชีนี้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Sub-tab 2: Employee Role & Department Assignment */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                ตั้งค่าตำแหน่ง (Role) และแผนกของพนักงานรายบุคคล
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดว่าใครเป็นหัวหน้างาน (Manager) หรือพนักงานทั่วไป (Employee) และสามารถกดสร้างบัญชี Login ให้หัวหน้าได้ทันที
              </p>
            </div>

            {/* Role Filter */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setEmpRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  empRoleFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทุกตำแหน่ง ({employees.length})
              </button>
              <button
                type="button"
                onClick={() => setEmpRoleFilter('manager')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  empRoleFilter === 'manager'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Manager ({employees.filter((e) => e.role === 'manager').length})
              </button>
              <button
                type="button"
                onClick={() => setEmpRoleFilter('employee')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  empRoleFilter === 'employee'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Employee ({employees.filter((e) => e.role === 'employee').length})
              </button>
            </div>
          </div>

          {/* Department Filter + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setEmpDeptFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  empDeptFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ทุกแผนก
              </button>
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setEmpDeptFilter(dept)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    empDeptFilter === dept
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  แผนก {dept}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="ค้นหาชื่อพนักงาน..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50">
                  <th className="py-3 px-4 w-16 text-center">ลำดับ</th>
                  <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                  <th className="py-3 px-4 text-center">แผนกสังกัด</th>
                  <th className="py-3 px-4 text-center">ตั้งค่า Role (ตำแหน่ง)</th>
                  <th className="py-3 px-4 text-right">สร้างสิทธิ์เข้าสู่ระบบ (Login)</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, idx) => (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors text-sm"
                  >
                    <td className="py-3 px-4 text-center text-slate-500 font-mono tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{emp.name}</td>
                    <td className="py-3 px-4 text-center">
                      <select
                        value={emp.department || 'IE'}
                        onChange={(e) =>
                          handleEmployeeDeptUpdate(emp, e.target.value as Department)
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 outline-none cursor-pointer"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleEmployeeRoleUpdate(emp, 'employee')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                            emp.role === 'employee'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Employee
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEmployeeRoleUpdate(emp, 'manager')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                            emp.role === 'manager'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Manager
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {emp.role === 'manager' ? (
                        <button
                          type="button"
                          onClick={() => handleCreateAccountFromEmployee(emp)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>สร้างบัญชี Login แผนก {emp.department || 'IE'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">สแกนผ่าน QR (ไม่ต้อง Login)</span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">
                      ไม่พบรายชื่อพนักงานที่ค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
