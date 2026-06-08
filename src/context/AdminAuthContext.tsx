// src/context/AdminAuthContext.tsx
// ─────────────────────────────────────────────────────────
// Admin ka alag context — user context se bilkul alag.
// Sirf admin panel mein use hoga.
// ─────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { onAdminAuthChange, AdminProfile } from '../firebase/adminAuth';

interface AdminAuthContextType {
  admin: AdminProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  loading: true,
  isAuthenticated: false,
});

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAdminAuthChange((profile) => {
      setAdmin(profile);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        isAuthenticated: !!admin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => useContext(AdminAuthContext);
