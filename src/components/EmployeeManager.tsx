import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Employee } from '../types';
import { EMPLOYEE_LIST } from '../data/employees';
import { Users, UserPlus, Trash2, Power, Search, AlertCircle, CheckCircle2 } from 'lucide-react';

export function EmployeeManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add new employee state
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
      setLoading(false);
    }, (error) => {
      console.warn("Offline mode or error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
    if (!window.confirm("คุณต้องการลบรายชื่อพนักงานคนนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch (error) {
      console.error("Error deleting employee:", error);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">กำลังโหลดข้อมูลพนักงาน...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">จัดการรายชื่อพนักงาน</h1>
          <p className="text-sm text-slate-500">เพิ่ม ลบ หรือระงับการเช็คอินของพนักงาน</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <form onSubmit={handleAddEmployee} className="flex gap-3 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อ - นามสกุล พนักงานใหม่..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            disabled={isAdding}
          />
          <button
            type="submit"
            disabled={!newName.trim() || isAdding}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors flex items-center shadow-sm"
          >
            {isAdding ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><UserPlus className="w-5 h-5 mr-2" /> เพิ่มรายชื่อ</>}
          </button>
        </form>

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
                <th className="py-3 px-4 text-center">สถานะ</th>
                <th className="py-3 px-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp, index) => (
                <tr key={emp.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${!emp.isActive ? 'opacity-60' : ''}`}>
                  <td className="py-3 px-4 text-center text-slate-500 font-medium">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{emp.name}</div>
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
                    <button
                      onClick={() => deleteEmployee(emp.id)}
                      className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors inline-flex"
                      title="ลบพนักงาน"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="mb-4">ไม่พบรายชื่อพนักงาน</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
