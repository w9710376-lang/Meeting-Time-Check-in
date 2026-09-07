import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Role } from '../types';

interface AuthContextType {
  profile: User | null;
  loading: boolean;
  loginAs: (name: string, role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const storedProfileStr = localStorage.getItem('timesync_profile');
      if (storedProfileStr) {
        try {
          const cachedProfile = JSON.parse(storedProfileStr) as User;
          setProfileState(cachedProfile);
          
          // Attempt to refresh in background
          getDoc(doc(db, 'users', cachedProfile.id)).then(docSnap => {
            if (docSnap.exists()) {
              const freshData = docSnap.data() as User;
              setProfileState(freshData);
              localStorage.setItem('timesync_profile', JSON.stringify(freshData));
            }
          }).catch(e => console.warn('Offline mode: Could not refresh profile in background.', e.message));

        } catch (e: any) {
          console.warn('Offline mode: Could not load profile.', e.message);
          localStorage.removeItem('timesync_profile');
          createDefaultProfile();
        }
      } else {
        createDefaultProfile();
      }
      setLoading(false);
    };

    const createDefaultProfile = () => {
      const defaultUser: User = {
        id: 'demo-admin',
        email: 'admin@timesync.local',
        name: 'Admin User',
        role: 'manager',
        earlyPoints: 0,
        createdAt: Date.now()
      };
      setProfileState(defaultUser);
      localStorage.setItem('timesync_profile', JSON.stringify(defaultUser));
      setDoc(doc(db, 'users', defaultUser.id), defaultUser, { merge: true })
        .catch(e => console.warn('Offline mode: Could not sync default profile.', e.message));
    };

    loadProfile();
  }, []);

  const loginAs = async (name: string, role: Role) => {
    setLoading(true);
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let userData: User = {
      id,
      email: `${id}@example.com`,
      name,
      role,
      earlyPoints: 0,
      createdAt: Date.now()
    };

    try {
      const userRef = doc(db, 'users', id);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, userData);
      } else {
        userData = userSnap.data() as User;
        if (userData.role !== role) {
          userData.role = role;
          await setDoc(userRef, userData, { merge: true });
        }
      }
      setProfileState(userData);
      localStorage.setItem('timesync_profile', JSON.stringify(userData));
    } catch (e: any) {
      console.warn('Offline mode fallback during login:', e.message);
      // Fallback if offline: just log them in locally
      setProfileState(userData);
      localStorage.setItem('timesync_profile', JSON.stringify(userData));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setProfileState(null);
    localStorage.removeItem('timesync_profile');
  };

  return (
    <AuthContext.Provider value={{ profile, loading, loginAs, logout }}>
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
