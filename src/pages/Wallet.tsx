import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet as WalletIcon,
  Trophy,
  TrendingUp,
  Star,
  Users,
  PlusCircle,
  ArrowUpCircle,
  Info,
  ChevronRight,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import {
  formatCurrency,
  calculateTotalBalance,
  calculateUsableBalance,
} from '../utils/helpers';

// Animation helpers — no "variants" prop (avoids older Babel/parser issues)
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

export const Wallet: React.FC = () => {
  const { wallet } = useAuth();

  const usableBalance = wallet ? calculateUsableBalance(wallet) : 0;

  const balanceItems = [
    {
      label: 'Winning Balance',
      value: wallet?.winningBalance || 0,
      icon: Trophy,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      desc: 'Earned from game wins. Fully usable & withdrawable.',
      usable: true,
    },
    {
      label: 'Deposit Balance',
      value: wallet?.depositBalance || 0,
      icon: TrendingUp,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      desc: 'Money you deposited. Used FIRST during gameplay.',
      usable: true,
    },
    {
      label: 'Bonus Balance',
      value: wallet?.bonusBalance || 0,
      icon: Star,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      desc: 'Signup/admin bonus. Only 10% usable per bet.',
      usable: true,
      note: '10% per bet',
    },
    {
      label: 'Referral Balance',
      value: wallet?.referralBalance || 0,
      icon: Users,
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/20',
      desc: 'Earned from referrals. Fully usable in games.',
      usable: true,
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* TOTAL BALANCE */}
      <motion.div
        {...fadeUp(0)}
        className="relative overflow-hidden bg-gradient-to-br from-yellow-500/20 via-orange-500/10 to-purple-500/10 border border-yellow-500/30 rounded-2xl p-6"
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <WalletIcon className="w-5 h-5 text-yellow-400" />
            <span className="text-gray-300">Total Balance</span>
          </div>

          <p className="text-5xl font-bold text-white mb-1">
            {formatCurrency(calculateTotalBalance(wallet))}
          </p>

          <p className="text-sm text-gray-400">
            Useable in game:{' '}
            <span className="text-green-400 font-semibold">
              {formatCurrency(usableBalance)}
            </span>
          </p>
        </div>
      </motion.div>

      {/* ACTION BUTTONS */}
      <motion.div
        {...fadeUp(0.1)}
        className="grid grid-cols-2 gap-4"
      >
        <Link to="/add-money">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3 hover:bg-green-500/20 transition-all"
          >
            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
              <PlusCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Add Money</p>
              <p className="text-xs text-gray-400">Deposit funds</p>
            </div>
            <ChevronRight className="w-4 h-4 text-green-400 ml-auto" />
          </motion.div>
        </Link>

        <Link to="/withdrawal">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3 hover:bg-orange-500/20 transition-all"
          >
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Withdraw</p>
              <p className="text-xs text-gray-400">To your UPI</p>
            </div>
            <ChevronRight className="w-4 h-4 text-orange-400 ml-auto" />
          </motion.div>
        </Link>
      </motion.div>

      {/* BALANCE BREAKDOWN */}
      <motion.div {...fadeUp(0.2)}>
        <h3 className="text-lg font-bold text-white mb-3">Balance Breakdown</h3>

        <div className="space-y-3">
          {balanceItems.map(({ label, value, icon: Icon, color, bg, border, desc, usable, note }, index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.25 + index * 0.08 }}
              whileHover={{ x: 2 }}
              className={`${bg} border ${border} rounded-xl p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{label}</p>
                      {note && (
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                          {note}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`text-lg font-bold ${color}`}>
                    {formatCurrency(value)}
                  </p>
                  <p className={`text-xs ${usable ? 'text-green-400' : 'text-red-400'}`}>
                    {usable ? '✓ Usable' : '✗ Not for games'}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* INFO BOX */}
      <motion.div
        {...fadeUp(0.4)}
        className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-300 mb-1">Balance Rules</p>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• Deposit balance is used FIRST in games</li>
              <li>• Winning balance is used after deposit balance finishes</li>
              <li>• Winning balance is fully withdrawable</li>
              <li>• Only 10% of bonus balance usable per bet</li>
              <li>• Minimum withdrawal: ₹100 (winning balance only)</li>
            </ul>
          </div>
        </div>
      </motion.div>

    </div>
  );
};
