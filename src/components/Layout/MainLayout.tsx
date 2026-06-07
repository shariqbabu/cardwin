import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../store/useStore';
import { subscribeNotifications } from '../../firebase/games';

export const MainLayout: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { setNotifications } = useAppStore();
  const location = useLocation();

const hideHeader =
  /^\/games\/poker\/[^/]+$/.test(location.pathname) ||


  useEffect(() => {
    if (!firebaseUser) return;

    const unsub = subscribeNotifications(firebaseUser.uid, (notifications) => {
      setNotifications(notifications as any);
    });

    return () => unsub();
  }, [firebaseUser, setNotifications]);

  return (
    <div className="flex h-screen bg-[#0a0612] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!hideHeader && <Header />}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
