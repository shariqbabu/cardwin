import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  ArrowUpCircle,
  Clock,
  History,
  Users,
  User,
  Bell,
  Shield,
  Dice5,
  Spade,
  Palette,
  X,
  ChevronRight,
  Trophy, Dice6,
  LogOut, Gamepad2, Swords, Diamond,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { logOut } from '../../firebase/auth';
import { useAppStore } from '../../store/useStore';
import { formatCurrency } from '../../utils/helpers';
import { calculateTotalBalance } from '../../utils/helpers';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', color: 'text-blue-400' },
  { path: '/wallet', icon: Wallet, label: 'Wallet', color: 'text-gold-400' },
  { path: '/add-money', icon: PlusCircle, label: 'Add Money', color: 'text-green-400' },
  { path: '/withdrawal', icon: ArrowUpCircle, label: 'Withdraw', color: 'text-orange-400' },
  { path: '/withdrawal-history', icon: Clock, label: 'Withdrawal History', color: 'text-purple-400' },
  { path: '/transactions', icon: History, label: 'Transactions', color: 'text-cyan-400' },
  { path: '/referral', icon: Users, label: 'Referral', color: 'text-pink-400' },
  { path: '/profile', icon: User, label: 'Profile', color: 'text-indigo-400' },
  { path: '/notifications', icon: Bell, label: 'Notifications', color: 'text-yellow-400' },
];

const gameItems = [
  { path: '/games/color-prediction', icon: Palette, label: 'Color Prediction', color: 'text-red-400' },
  { path: '/matchmaking', icon: Spade, label: 'Card Battle', color: 'text-blue-400' },
  { path: '/games/dice', icon: Dice5, label: 'Dice Game', color: 'text-green-400' },
  { path: '/games/poker', icon: Swords, label: 'Poker', color: 'text-green-400' },
  { path: '/games/DragonTiger', icon: Gamepad2, label: 'Dragon Tiger', color: 'text-green-400' },
  { path: '/games/andar-bahar', icon: Diamond, label: 'Andar Bahar', color: 'text-green-400' },
  { path: '/games/ludo', icon: Dice6, label: 'Ludo', color: 'text-green-400' },
  { path: '/games/ninecard', icon: Dice6, label: 'Ludo', color: 'text-green-400' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user, wallet, isAdmin } = useAuth();
  const { sidebarOpen, setSidebarOpen, unreadCount } = useAppStore();

  const handleLogout = async () => {
    try {
      await logOut();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ item }: { item: typeof navItems[0] }) => (
    <Link
      to={item.path}
      onClick={() => setSidebarOpen(false)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
        isActive(item.path)
          ? 'bg-gold-500/20 border border-gold-500/30'
          : 'hover:bg-white/5'
      }`}
    >
      <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-yellow-400' : item.color} flex-shrink-0`} />
      <span className={`text-sm font-medium ${isActive(item.path) ? 'text-yellow-400' : 'text-gray-300'}`}>
        {item.label}
      </span>
      {item.label === 'Notifications' && unreadCount > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {unreadCount}
        </span>
      )}
      {isActive(item.path) && <ChevronRight className="w-4 h-4 text-yellow-400 ml-auto" />}
    </Link>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0f0a1a] border-r border-white/10">
      {/* Logo */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              RoyalBet
            </span>
            <p className="text-xs text-gray-500">Casino</p>
          </div>
        </Link>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-gray-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User info */}
      {user && (
        <div className="p-4 border-b border-white/10">
          <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
            {wallet && (
              <div className="bg-black/30 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-400">Total Balance</p>
                <p className="text-lg font-bold text-yellow-400">{formatCurrency(
  calculateTotalBalance(wallet)
)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <p className="text-xs text-gray-600 uppercase tracking-wider px-4 mb-2">Main</p>
        {navItems.map(item => (
          <NavItem key={item.path} item={item} />
        ))}

        <p className="text-xs text-gray-600 uppercase tracking-wider px-4 mb-2 mt-4">Games</p>
        {gameItems.map(item => (
          <NavItem key={item.path} item={item} />
        ))}

        {isAdmin && (
          <>
            <p className="text-xs text-gray-600 uppercase tracking-wider px-4 mb-2 mt-4">Admin</p>
            <Link
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive('/admin')
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'hover:bg-white/5'
              }`}
            >
              <Shield className={`w-5 h-5 ${isActive('/admin') ? 'text-red-400' : 'text-red-500'}`} />
              <span className={`text-sm font-medium ${isActive('/admin') ? 'text-red-400' : 'text-gray-300'}`}>
                Admin Panel
              </span>
            </Link>
          </>
        )}
      </div>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 h-screen sticky top-0 flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-72 z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
