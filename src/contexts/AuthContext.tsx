import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Role, UserAccount, DEFAULT_DEPARTMENTS, Department, DeletedDepartmentBackup } from '../types';

export const DEFAULT_ACCOUNTS: UserAccount[] = [
  {
    id: 'super-admin',
    username: 'admin',
    name: 'Super Admin (ผู้ดูแลระบบกลาง)',
    pin: '1234',
    role: 'manager',
    appRole: 'super_admin',
    departmentScope: 'ALL',
    canEditTime: true,
    canManageEmployees: true,
    canViewReports: true,
    canManageRoles: true,
    isActive: true,
    createdAt: 1700000000000,
  },
  ...DEFAULT_DEPARTMENTS.map((dept, idx) => ({
    id: `mgr-${dept.toLowerCase()}`,
    username: `dept_${dept.toLowerCase()}`,
    name: `แผนก ${dept}`,
    pin: `${idx + 1}${idx + 1}${idx + 1}${idx + 1}`,
    role: 'manager' as Role,
    appRole: 'dept_manager' as const,
    departmentScope: dept,
    canEditTime: true,
    canManageEmployees: true,
    canViewReports: true,
    canManageRoles: false,
    isActive: true,
    createdAt: 1700000000000 + (idx + 1) * 1000,
  })),
  {
    id: 'qr-kiosk',
    username: 'kiosk',
    name: 'หน้าจอแสดง QR Code (Kiosk)',
    pin: '0000',
    role: 'employee',
    appRole: 'qr_kiosk',
    departmentScope: 'ALL',
    canEditTime: false,
    canManageEmployees: false,
    canViewReports: false,
    canManageRoles: false,
    isActive: true,
    createdAt: 1700000010000,
  },
];

interface AuthContextType {
  profile: User | null;
  accounts: UserAccount[];
  departments: Department[];
  deletedDepartments: DeletedDepartmentBackup[];
  loading: boolean;
  loginWithAccount: (accountId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  loginAs: (name: string, role: Role) => Promise<void>;
  addDepartment: (deptName: string, pin?: string) => Promise<{ success: boolean; dept?: string; error?: string }>;
  removeDepartment: (deptName: string) => Promise<{ success: boolean; error?: string }>;
  restoreDepartment: (deptName: string) => Promise<{ success: boolean; dept?: string; error?: string }>;
  clearDeletedDepartmentHistory: (deptName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function sanitizeAccountName(name: string): string {
  if (name === 'Super Admin (ทุกแผนก)') {
    return 'Super Admin (ผู้ดูแลระบบกลาง)';
  }
  if (name.startsWith('หัวหน้าแผนก ')) {
    return name.replace('หัวหน้าแผนก ', 'แผนก ');
  }
  return name;
}

function accountToUser(acc: UserAccount): User {
  return {
    id: acc.id,
    email: `${acc.username}@timesync.local`,
    name: sanitizeAccountName(acc.name),
    role: acc.role,
    appRole: acc.appRole,
    departmentScope: acc.departmentScope,
    canEditTime: acc.canEditTime,
    canManageEmployees: acc.canManageEmployees,
    canViewReports: acc.canViewReports,
    canManageRoles: acc.canManageRoles,
    earlyPoints: 0,
    createdAt: acc.createdAt,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<UserAccount[]>(DEFAULT_ACCOUNTS);
  const [departments, setDepartments] = useState<Department[]>(() => {
    try {
      const cached = localStorage.getItem('timesync_departments_cache_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_DEPARTMENTS;
  });
  const [deletedDepartments, setDeletedDepartments] = useState<DeletedDepartmentBackup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isScanMode = searchParams.get('mode') === 'scan';
    const urlDept = searchParams.get('dept');

    // 1. Restore session from localStorage if exists
    const storedSession = localStorage.getItem('timesync_auth_session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession) as User;
        parsed.name = sanitizeAccountName(parsed.name || '');
        setProfileState(parsed);
      } catch (e) {
        localStorage.removeItem('timesync_auth_session');
      }
    }
    setLoading(false);

    // In mobile QR scan mode when department is already locked in URL,
    // skip heavy admin account and department Firestore subscriptions to maximize mobile scan speed
    if (isScanMode && urlDept) {
      return;
    }

    // 2. Subscribe to departments list in Firestore (settings/departments)
    const unsubDepts = onSnapshot(
      doc(db, 'settings', 'departments'),
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.deletedList)) {
            setDeletedDepartments(data.deletedList);
          } else {
            setDeletedDepartments([]);
          }
          if (Array.isArray(data.list) && data.list.length > 0) {
            setDepartments(data.list);
            try {
              localStorage.setItem('timesync_departments_cache_v1', JSON.stringify(data.list));
            } catch {
              // ignore
            }
            return;
          }
        }
        // Seed default departments if not present
        try {
          await setDoc(
            doc(db, 'settings', 'departments'),
            { list: DEFAULT_DEPARTMENTS, deletedList: [], updatedAt: Date.now() },
            { merge: true }
          );
        } catch (err) {
          // Offline fallback
        }
      },
      (err) => {
        console.warn('Using default departments list:', err.message);
      }
    );

    if (isScanMode) {
      return () => {
        unsubDepts();
      };
    }

    // 3. Subscribe to accounts collection in Firestore
    const unsubAccounts = onSnapshot(
      collection(db, 'accounts'),
      async (snapshot) => {
        const rawLoaded: UserAccount[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as UserAccount;
          const cleanName = sanitizeAccountName(raw.name || '');
          const accObj: UserAccount = { ...raw, id: docSnap.id, name: cleanName };
          rawLoaded.push(accObj);

          // Automatically migrate old "หัวหน้าแผนก ..." names in Firestore to "แผนก ..."
          if (raw.name && raw.name !== cleanName) {
            setDoc(doc(db, 'accounts', docSnap.id), { name: cleanName }, { merge: true }).catch(
              () => {}
            );
          }
        });

        // Ensure there is only 1 Super Admin (ผู้ดูแลระบบกลาง) in the system
        const deduplicated: UserAccount[] = [];
        let primarySuperAdmin: UserAccount | null =
          rawLoaded.find((a) => a.id === 'super-admin' && a.appRole === 'super_admin') || null;

        for (const acc of rawLoaded) {
          // If a department manager account (mgr-*) was accidentally set to super_admin, restore it to dept_manager
          if (acc.id.startsWith('mgr-') && acc.appRole === 'super_admin') {
            const inferredDept = acc.id.replace(/^mgr-/, '').toUpperCase() || 'IE';
            const restoredAcc: UserAccount = {
              ...acc,
              name: acc.name.startsWith('แผนก ') ? acc.name : `แผนก ${inferredDept}`,
              role: 'manager',
              appRole: 'dept_manager',
              departmentScope: inferredDept,
              canManageRoles: false,
            };
            deduplicated.push(restoredAcc);
            setDoc(doc(db, 'accounts', acc.id), restoredAcc, { merge: true }).catch(() => {});
            continue;
          }

          if (acc.appRole === 'super_admin') {
            if (!primarySuperAdmin) {
              primarySuperAdmin = {
                ...acc,
                name: 'Super Admin (ผู้ดูแลระบบกลาง)',
                departmentScope: 'ALL',
              };
              deduplicated.push(primarySuperAdmin);
            } else if (acc.id === primarySuperAdmin.id) {
              const normalizedPrimary: UserAccount = {
                ...acc,
                name: 'Super Admin (ผู้ดูแลระบบกลาง)',
                departmentScope: 'ALL',
              };
              deduplicated.push(normalizedPrimary);
              if (acc.name !== 'Super Admin (ผู้ดูแลระบบกลาง)' || acc.departmentScope !== 'ALL') {
                setDoc(
                  doc(db, 'accounts', acc.id),
                  { name: 'Super Admin (ผู้ดูแลระบบกลาง)', departmentScope: 'ALL' },
                  { merge: true }
                ).catch(() => {});
              }
            } else {
              // Extra duplicate Super Admin account -> remove from Firestore so only 1 Super Admin exists
              deleteDoc(doc(db, 'accounts', acc.id)).catch(() => {});
            }
            continue;
          }

          deduplicated.push(acc);
        }

        if (deduplicated.length === 0 && !snapshot.metadata.hasPendingWrites) {
          // Seed default accounts
          try {
            await Promise.all(
              DEFAULT_ACCOUNTS.map((acc) => setDoc(doc(db, 'accounts', acc.id), acc))
            );
          } catch (err) {
            console.warn('Could not seed default accounts:', err);
          }
          setAccounts(DEFAULT_ACCOUNTS);
        } else if (deduplicated.length > 0) {
          deduplicated.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          setAccounts(deduplicated);

          // If current logged-in user matches one of the accounts, sync their latest permissions
          const currentSessionStr = localStorage.getItem('timesync_auth_session');
          if (currentSessionStr) {
            try {
              const currentSession = JSON.parse(currentSessionStr) as User;
              const matched =
                deduplicated.find((a) => a.id === currentSession.id) ||
                (currentSession.appRole === 'super_admin'
                  ? deduplicated.find((a) => a.appRole === 'super_admin')
                  : undefined);
              if (matched) {
                if (!matched.isActive) {
                  setProfileState(null);
                  localStorage.removeItem('timesync_auth_session');
                } else {
                  const updatedUser = accountToUser(matched);
                  setProfileState(updatedUser);
                  localStorage.setItem('timesync_auth_session', JSON.stringify(updatedUser));
                }
              }
            } catch (e) {
              // ignore
            }
          }
        }
      },
      (error) => {
        console.warn('Offline mode: using default accounts list.', error.message);
      }
    );

    return () => {
      unsubDepts();
      unsubAccounts();
    };
  }, []);

  const addDepartment = async (
    rawDeptName: string,
    pin: string = '1234'
  ): Promise<{ success: boolean; dept?: string; error?: string }> => {
    if (!profile || profile.appRole !== 'super_admin') {
      return {
        success: false,
        error: 'เฉพาะ Super Admin (ผู้ดูแลระบบกลาง) เท่านั้นที่สามารถเพิ่มแผนกได้',
      };
    }

    const cleaned = rawDeptName.trim().toUpperCase();
    if (!cleaned) {
      return { success: false, error: 'กรุณาระบุชื่อแผนก' };
    }
    if (cleaned === 'ALL') {
      return { success: false, error: 'ไม่สามารถใช้ชื่อ ALL เป็นชื่อแผนกได้' };
    }
    if (departments.some((d) => d.toUpperCase() === cleaned)) {
      return { success: false, error: `มีแผนก ${cleaned} อยู่ในระบบแล้ว` };
    }

    const updatedDepts = [...departments, cleaned];
    const updatedDeletedDepts = deletedDepartments.filter(
      (item) => item.deptName.toUpperCase() !== cleaned
    );
    setDepartments(updatedDepts);
    setDeletedDepartments(updatedDeletedDepts);

    try {
      await setDoc(
        doc(db, 'settings', 'departments'),
        { list: updatedDepts, deletedList: updatedDeletedDepts, updatedAt: Date.now() },
        { merge: true }
      );

      // Also create a corresponding department account if not exists
      const safeSlug = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const accId = `mgr-${safeSlug}`;
      const existingAcc = accounts.find(
        (a) => a.id === accId || a.departmentScope.toUpperCase() === cleaned
      );

      if (!existingAcc) {
        const newAcc: UserAccount = {
          id: accId,
          username: `dept_${safeSlug}`,
          name: `แผนก ${cleaned}`,
          pin: pin.trim() || '1234',
          role: 'manager',
          appRole: 'dept_manager',
          departmentScope: cleaned,
          canEditTime: true,
          canManageEmployees: true,
          canViewReports: true,
          canManageRoles: false,
          isActive: true,
          createdAt: Date.now(),
        };
        await setDoc(doc(db, 'accounts', accId), newAcc);
      }

      return { success: true, dept: cleaned };
    } catch (err) {
      console.error('Error adding department:', err);
      return { success: true, dept: cleaned };
    }
  };

  const removeDepartment = async (
    deptName: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!profile || profile.appRole !== 'super_admin') {
      return {
        success: false,
        error: 'เฉพาะ Super Admin (ผู้ดูแลระบบกลาง) เท่านั้นที่สามารถลบแผนกได้',
      };
    }

    if (departments.length <= 1) {
      return {
        success: false,
        error: 'ต้องเหลืออย่างน้อย 1 แผนกในระบบ',
      };
    }

    const originalIndex = departments.indexOf(deptName);
    const deptAccounts = accounts.filter(
      (a) =>
        a.appRole !== 'super_admin' &&
        a.departmentScope.toUpperCase() === deptName.toUpperCase()
    );

    const backupEntry: DeletedDepartmentBackup = {
      deptName,
      deletedAt: Date.now(),
      deletedBy: profile.name || 'Super Admin',
      originalIndex: originalIndex >= 0 ? originalIndex : departments.length,
      accounts: deptAccounts,
    };

    const updatedDepts = departments.filter((d) => d !== deptName);
    const updatedDeletedDepts = [
      backupEntry,
      ...deletedDepartments.filter(
        (item) => item.deptName.toUpperCase() !== deptName.toUpperCase()
      ),
    ].slice(0, 20);

    setDepartments(updatedDepts);
    setDeletedDepartments(updatedDeletedDepts);

    try {
      await setDoc(
        doc(db, 'settings', 'departments'),
        { list: updatedDepts, deletedList: updatedDeletedDepts, updatedAt: Date.now() },
        { merge: true }
      );

      // Remove corresponding department login accounts from active Login list (backed up in deletedList for Rollback)
      await Promise.all(
        deptAccounts.map((acc) => deleteDoc(doc(db, 'accounts', acc.id)).catch(() => {}))
      );

      return { success: true };
    } catch (err) {
      console.error('Error removing department:', err);
      return { success: false, error: 'เกิดข้อผิดพลาดในการลบแผนก' };
    }
  };

  const restoreDepartment = async (
    deptName: string
  ): Promise<{ success: boolean; dept?: string; error?: string }> => {
    if (!profile || profile.appRole !== 'super_admin') {
      return {
        success: false,
        error: 'เฉพาะ Super Admin (ผู้ดูแลระบบกลาง) เท่านั้นที่สามารถ Rollback กู้คืนแผนกได้',
      };
    }

    const cleaned = deptName.trim().toUpperCase();
    if (!cleaned) {
      return { success: false, error: 'ไม่พบชื่อแผนกที่ต้องการกู้คืน' };
    }

    const backupEntry = deletedDepartments.find(
      (item) => item.deptName.toUpperCase() === cleaned
    );
    const canonicalName = backupEntry?.deptName || cleaned;

    const updatedDepts = [...departments];
    if (!updatedDepts.some((d) => d.toUpperCase() === cleaned)) {
      const insertIdx =
        backupEntry?.originalIndex !== undefined
          ? Math.max(0, Math.min(backupEntry.originalIndex, updatedDepts.length))
          : updatedDepts.length;
      updatedDepts.splice(insertIdx, 0, canonicalName);
    }

    const updatedDeletedDepts = deletedDepartments.filter(
      (item) => item.deptName.toUpperCase() !== cleaned
    );

    setDepartments(updatedDepts);
    setDeletedDepartments(updatedDeletedDepts);

    try {
      await setDoc(
        doc(db, 'settings', 'departments'),
        { list: updatedDepts, deletedList: updatedDeletedDepts, updatedAt: Date.now() },
        { merge: true }
      );

      if (backupEntry && Array.isArray(backupEntry.accounts) && backupEntry.accounts.length > 0) {
        await Promise.all(
          backupEntry.accounts.map((acc) => setDoc(doc(db, 'accounts', acc.id), acc))
        );
      } else {
        const safeSlug = canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const accId = `mgr-${safeSlug}`;
        const existingAcc = accounts.find(
          (a) => a.id === accId || a.departmentScope.toUpperCase() === cleaned
        );
        if (!existingAcc) {
          const defaultRestoredAcc: UserAccount = {
            id: accId,
            username: `dept_${safeSlug}`,
            name: `แผนก ${canonicalName}`,
            pin: '1234',
            role: 'manager',
            appRole: 'dept_manager',
            departmentScope: canonicalName,
            canEditTime: true,
            canManageEmployees: true,
            canViewReports: true,
            canManageRoles: false,
            isActive: true,
            createdAt: Date.now(),
          };
          await setDoc(doc(db, 'accounts', accId), defaultRestoredAcc);
        }
      }

      return { success: true, dept: canonicalName };
    } catch (err) {
      console.error('Error restoring department:', err);
      return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนแผนก' };
    }
  };

  const clearDeletedDepartmentHistory = async (deptName: string): Promise<void> => {
    if (!profile || profile.appRole !== 'super_admin') return;
    const cleaned = deptName.trim().toUpperCase();
    const updatedDeletedDepts = deletedDepartments.filter(
      (item) => item.deptName.toUpperCase() !== cleaned
    );
    setDeletedDepartments(updatedDeletedDepts);
    try {
      await setDoc(
        doc(db, 'settings', 'departments'),
        { deletedList: updatedDeletedDepts, updatedAt: Date.now() },
        { merge: true }
      );
    } catch (err) {
      console.error('Error clearing deleted department history:', err);
    }
  };

  const loginWithAccount = async (
    accountId: string,
    pin: string
  ): Promise<{ success: boolean; error?: string }> => {
    const target = accounts.find((a) => a.id === accountId && a.isActive);
    if (!target) {
      return { success: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ หรือบัญชีถูกระงับ' };
    }

    if (target.pin !== pin.trim()) {
      return { success: false, error: 'รหัส PIN / รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง' };
    }

    const userObj = accountToUser(target);
    setProfileState(userObj);
    localStorage.setItem('timesync_auth_session', JSON.stringify(userObj));

    // If the user has a specific department scope, set it as default check-in department
    if (target.departmentScope && target.departmentScope !== 'ALL') {
      localStorage.setItem('selected_checkin_dept', target.departmentScope);
    }

    try {
      await setDoc(doc(db, 'users', userObj.id), userObj, { merge: true });
    } catch (e) {
      // Offline fallback is fine
    }

    return { success: true };
  };

  const loginAs = async (name: string, role: Role) => {
    setLoading(true);
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let userData: User = {
      id,
      email: `${id}@example.com`,
      name,
      role,
      appRole: role === 'manager' ? 'super_admin' : 'qr_kiosk',
      departmentScope: 'ALL',
      canEditTime: role === 'manager',
      canManageEmployees: role === 'manager',
      canViewReports: role === 'manager',
      canManageRoles: role === 'manager',
      earlyPoints: 0,
      createdAt: Date.now(),
    };

    try {
      const userRef = doc(db, 'users', id);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, userData);
      } else {
        userData = { ...userData, ...(userSnap.data() as User) };
      }
      setProfileState(userData);
      localStorage.setItem('timesync_auth_session', JSON.stringify(userData));
    } catch (e: any) {
      setProfileState(userData);
      localStorage.setItem('timesync_auth_session', JSON.stringify(userData));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setProfileState(null);
    localStorage.removeItem('timesync_auth_session');
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        accounts,
        departments,
        deletedDepartments,
        loading,
        loginWithAccount,
        loginAs,
        addDepartment,
        removeDepartment,
        restoreDepartment,
        clearDeletedDepartmentHistory,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
