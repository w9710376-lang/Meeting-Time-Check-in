/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CheckIn } from './components/CheckIn';

const Layout = React.lazy(() =>
  import('./components/Layout').then((m) => ({ default: m.Layout }))
);
const Login = React.lazy(() =>
  import('./components/Login').then((m) => ({ default: m.Login }))
);

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
  );
}

function AppContent() {
  const { profile, loading } = useAuth();
  
  const isScanMode = new URLSearchParams(window.location.search).get('mode') === 'scan';

  // Render CheckIn immediately in scan mode without blocking on auth or heavy admin bundles
  if (isScanMode) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
        <CheckIn />
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      {!profile ? <Login /> : <Layout />}
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
