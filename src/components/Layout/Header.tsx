import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Bell, Wallet, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../store/useStore';
import { formatCurrency } from '../../utils/helpers';
import { calculateTotalBalance } from '../../utils/helpers';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/wallet': 'Wallet',
  '/add-money': 'Add Money',
  '/withdrawal': 'Withdraw',
  '/withdrawal-history': 'Withdrawal History',
  '/transactions': 'Transaction History',
  '/referral': 'Referral',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
  '/games/color-prediction': 'Color Prediction',
  '/matchmaking': 'Card Battle',
  '/games/dice': 'Dice Game',
  '/admin': 'Admin Dashboard',
};

export const Header: React.FC = () => {
  const location = useLocation();
  const { user, wallet } = useAuth();
  const { setSidebarOpen, unreadCount } = useAppStore();

  const title = pageTitles[location.pathname] || 'RoyalBet Casino';

  return (
    <header className="sticky top-0 z-30 bg-[#0f0a1a]/90 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-white/10 text-gray-400 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Balance chip */}
          {wallet && (
            <Link to="/wallet">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl px-3 py-1.5 cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-bold text-yellow-400">
                  {formatCurrency(calculateTotalBalance(wallet))}
                </span>
              </motion.div>
            </Link>
          )}

          {/* Notifications */}
          <Link to="/notifications" className="relative p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          {/* User menu */}
          <Link to="/profile" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
          </Link>
        </div>
      </div>
    </header>
  );
};
