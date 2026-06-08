// src/admin/AdminApp.tsx
// ─────────────────────────────────────────────────────────
// Admin panel ka main entry point.
// 1. Agar loading hai → spinner
// 2. Agar logged in nahi → AdminLogin dikhao
// 3. Agar logged in hai → AdminDashboard dikhao
//
// App.tsx mein sirf yeh import karo aur /admin route pe render karo.
// AdminAuthProvider bhi yahan wrap hai.
// ─────────────────────────────────────────────────────────

import React from 'react';
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { Loader2, Shield } from 'lucide-react';

// Inner component — context ke andar render hota hai
const AdminAppInner: React.FC = () => {
  const { admin, loading } = useAdminAuth();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0614] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 bg-red-500/15 border border-red-500/25 rounded-2xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-red-400" />
        </div>
        <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
        <p className="text-xs text-gray-500">Checking admin access...</p>
      </div>
    );
  }

  // Not logged in → login page
  if (!admin) {
    return <AdminLogin />;
  }

  // Logged in → dashboard
  return <AdminDashboard />;
};

// Outer wrapper with provider
export const AdminApp: React.FC = () => {
  return (
    <AdminAuthProvider>
      <AdminAppInner />
    </AdminAuthProvider>
  );
};
