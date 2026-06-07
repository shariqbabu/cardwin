import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { subscribeTransactions } from '../firebase/wallet';
import { Transaction } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge } from '../components/ui/Badge';
import {
  History, TrendingUp, TrendingDown, Trophy, Star, Users, Gift,
  Loader2, Wallet,
} from 'lucide-react';

const getTransactionIcon = (type: string) => {
  switch (type) {
    case 'DEPOSIT': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'WITHDRAWAL': return { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' };
    case 'GAME_WIN': return { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    case 'GAME_LOSS': return { icon: TrendingDown, color: 'text-orange-400', bg: 'bg-orange-500/10' };
    case 'BONUS': return { icon: Gift, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    case 'REFERRAL': return { icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10' };
    case 'DEDUCTION_DEPOSIT': return { icon: TrendingDown, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 'DEDUCTION_WIN': return { icon: TrendingDown, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 'REFUND': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'CASH_OUT': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'RETURN_WIN': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'RETURN_DEPOSIT': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    default: return { icon: Wallet, color: 'text-gray-400', bg: 'bg-gray-500/10' };
  }
};

export const TransactionHistory: React.FC = () => {
  const { firebaseUser } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsub = subscribeTransactions(firebaseUser.uid, (txs) => {
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsub();
  }, [firebaseUser]);

  const totalIn = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4">
          <History className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400">Total In</span>
            </div>
            <p className="text-xl font-bold text-green-400">+{formatCurrency(totalIn)}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="text-xs text-gray-400">Total Out</span>
            </div>
            <p className="text-xl font-bold text-red-400">-{formatCurrency(totalOut)}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <History className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx, i) => {
              const { icon: Icon, color, bg } = getTransactionIcon(tx.type);
              const isPositive = tx.amount > 0;

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white capitalize">
                          {tx.type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-gray-400">{tx.description}</p>
                        <p className="text-xs text-gray-500">{formatDate(tx.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                      </p>
                      <Badge status={tx.status} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};
