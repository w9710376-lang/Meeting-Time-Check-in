/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { CheckIn } from './components/CheckIn';

function AppContent() {
  const { loading } = useAuth();
  
  const isScanMode = new URLSearchParams(window.location.search).get('mode') === 'scan';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isScanMode) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
        <CheckIn />
      </div>
    );
  }

  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
