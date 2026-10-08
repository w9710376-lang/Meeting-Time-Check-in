import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Role, UserAccount, DEPARTMENTS } from '../types';

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
  ...DEPARTMENTS.map((dept, idx) => ({
    id: `mgr-${dept.toLowerCase()}`,
    username: `mgr_${dept.toLowerCase()}`,
    name: `หัวหน้าแผนก ${dept}`,
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
  loading: boolean;
  loginWithAccount: (accountId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  loginAs: (name: string, role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function accountToUser(acc: UserAccount): User {
  return {
    id: acc.id,
    email: `${acc.username}@timesync.local`,
    name: acc.name,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Restore session from localStorage if exists
    const storedSession = localStorage.getItem('timesync_auth_session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession) as User;
        setProfileState(parsed);
      } catch (e) {
        localStorage.removeItem('timesync_auth_session');
      }
    }
    setLoading(false);

    // 2. Subscribe to accounts collection in Firestore
    const unsubAccounts = onSnapshot(
      collection(db, 'accounts'),
      async (snapshot) => {
        const loaded: UserAccount[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push({ ...(docSnap.data() as UserAccount), id: docSnap.id });
        });

        if (loaded.length === 0 && !snapshot.metadata.hasPendingWrites) {
          // Seed default accounts
          try {
            await Promise.all(
              DEFAULT_ACCOUNTS.map((acc) => setDoc(doc(db, 'accounts', acc.id), acc))
            );
          } catch (err) {
            console.warn('Could not seed default accounts:', err);
          }
          setAccounts(DEFAULT_ACCOUNTS);
        } else if (loaded.length > 0) {
          loaded.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          setAccounts(loaded);

          // If current logged-in user matches one of the accounts, sync their latest permissions
          const currentSessionStr = localStorage.getItem('timesync_auth_session');
          if (currentSessionStr) {
            try {
              const currentSession = JSON.parse(currentSessionStr) as User;
              const matched = loaded.find((a) => a.id === currentSession.id);
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

    return () => unsubAccounts();
  }, []);

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
      createdAt: Date.now()
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
    <AuthContext.Provider value={{ profile, accounts, loading, loginWithAccount, loginAs, logout }}>
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
