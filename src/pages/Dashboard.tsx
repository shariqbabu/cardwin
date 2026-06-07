import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, Trophy, Star, Dice5, Spade, Palette,
  PlusCircle, ArrowUpCircle, Users, Bell, ChevronRight,
  Zap, Crown, Gamepad2, Swords, Diamond,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, calculateTotalBalance, } from '../utils/helpers';
import { useAppStore } from '../store/useStore';

const gameCards = [
  {
    path: '/games/color-prediction',
    title: 'Color Prediction',
    desc: 'Predict Red, Green, or Violet',
    icon: Palette,
    gradient: 'from-red-500 via-green-500 to-violet-500',
    bg: 'from-red-900/30 to-violet-900/30',
    border: 'border-red-500/20',
    emoji: '🎨',
  },
  {
    path: '/matchmaking',
    title: 'Card Battle',
    desc: '2-Player card comparison game',
    icon: Spade,
    gradient: 'from-blue-500 to-indigo-500',
    bg: 'from-blue-900/30 to-indigo-900/30',
    border: 'border-blue-500/20',
    emoji: '🃏',
  },
  {
    path: '/games/dice',
    title: 'Dice Game',
    desc: 'Roll 3D dice - Odd or Even',
    icon: Dice5,
    gradient: 'from-green-500 to-emerald-500',
    bg: 'from-green-900/30 to-emerald-900/30',
    border: 'border-green-500/20',
    emoji: '🎲',
  },
  {
  path: '/games/poker',
  title: 'Classic Texas Hold’em Poker',
  desc: 'Play Classic Poker',
  icon: Crown,
  gradient: 'from-blue-500 via-indigo-500 to-purple-500',
  bg: 'from-blue-900/30 to-purple-900/30',
  border: 'border-blue-500/20',
  emoji: '♠️',
},

{
  path: '/games/DragonTiger',
  title: 'Dragon Tiger',
  desc: 'Dragon vs Tiger Card Battle',
  icon: Swords,
  gradient: 'from-orange-500 via-red-500 to-yellow-500',
  bg: 'from-orange-900/30 to-red-900/30',
  border: 'border-orange-500/20',
  emoji: '🐉',
},

{
  path: '/games/andar-bahar',
  title: 'Andar Bahar',
  desc: 'Traditional Indian Card Game',
  icon: Diamond,
  gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  bg: 'from-emerald-900/30 to-cyan-900/30',
  border: 'border-emerald-500/20',
  emoji: '🃏',
},
];

const quickActions = [
  { path: '/add-money', label: 'Add Money', icon: PlusCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  { path: '/withdrawal', label: 'Withdraw', icon: ArrowUpCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { path: '/referral', label: 'Referral', icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { path: '/notifications', label: 'Alerts', icon: Bell, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
];

export const Dashboard: React.FC = () => {
  const { user, wallet } = useAuth();
  const { unreadCount } = useAppStore();

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-4xl mx-auto">
      {/* Welcome */}
      <motion.div variants={item} className="relative overflow-hidden bg-gradient-to-r from-yellow-500/20 via-orange-500/10 to-transparent border border-yellow-500/20 rounded-2xl p-6">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400 text-sm font-medium">Welcome back</span>
          </div>
          <h2 className="text-2xl font-bold text-white">{user?.name || 'Player'}!</h2>
          <p className="text-gray-400 mt-1 text-sm">Ready to play? Your balance is waiting.</p>
        </div>
      </motion.div>

      {/* Wallet Overview */}
      <motion.div variants={item} className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-400" />
            <span className="text-gray-300 font-medium">Wallet Balance</span>
          </div>
          <Link to="/wallet" className="text-yellow-400 text-sm hover:text-yellow-300 flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-4xl font-bold text-white mb-4">
          {formatCurrency(calculateTotalBalance(wallet))}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Winning', value: wallet?.winningBalance || 0, icon: Trophy, color: 'text-yellow-400' },
            { label: 'Deposit', value: wallet?.depositBalance || 0, icon: TrendingUp, color: 'text-blue-400' },
            { label: 'Bonus', value: wallet?.bonusBalance || 0, icon: Star, color: 'text-purple-400' },
            { label: 'Referral', value: wallet?.referralBalance || 0, icon: Users, color: 'text-pink-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item}>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map(({ path, label, icon: Icon, color, bg }) => (
            <Link key={path} to={path}>
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4 text-center hover:bg-white/10 transition-all relative"
              >
                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <span className="text-xs text-gray-300 font-medium">{label}</span>
                {label === 'Alerts' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Games */}
      <motion.div variants={item}>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          Play Games
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {gameCards.map(({ path, title, desc, icon: Icon, bg, border, emoji }) => (
            <Link key={path} to={path}>
              <motion.div
                whileHover={{ scale: 1.02, y: -3 }}
                whileTap={{ scale: 0.98 }}
                className={`relative overflow-hidden bg-gradient-to-br ${bg} border ${border} rounded-2xl p-5 h-full hover:border-opacity-50 transition-all duration-300`}
              >
                <div className="absolute -right-4 -bottom-4 text-7xl opacity-20">{emoji}</div>
                <div className="relative">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1">{title}</h4>
                  <p className="text-sm text-gray-400">{desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-yellow-400 text-sm font-medium">
                    Play Now <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Referral Banner */}
      <motion.div variants={item}>
        <Link to="/referral">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-gradient-to-r from-pink-900/30 to-purple-900/30 border border-pink-500/20 rounded-2xl p-5 flex items-center justify-between hover:border-pink-500/40 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center text-2xl">
                🎁
              </div>
              <div>
                <h4 className="font-bold text-white">Refer & Earn ₹50!</h4>
                <p className="text-sm text-gray-400">Invite friends and earn bonus for each signup</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-pink-400 flex-shrink-0" />
          </motion.div>
        </Link>
      </motion.div>
    </motion.div>
  );
};
