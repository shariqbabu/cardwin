import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Withdrawal } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge } from '../components/ui/Badge';
import { ArrowUpCircle, Loader2 } from 'lucide-react';

export const WithdrawalHistory: React.FC = () => {
  const { firebaseUser } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;

    const q = query(
      collection(db, 'withdrawals'),
      where('uid', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Withdrawal)));
      setLoading(false);
    });

    return () => unsub();
  }, [firebaseUser]);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-6">
          <ArrowUpCircle className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-bold text-white">Withdrawal History</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ArrowUpCircle className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg">No withdrawals yet</p>
            <p className="text-gray-600 text-sm mt-1">Your withdrawal history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w, i) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <ArrowUpCircle className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Withdrawal Request</p>
                      <p className="text-xs text-gray-400">UPI: {w.upiId}</p>
                      <p className="text-xs text-gray-500">{formatDate(w.createdAt)}</p>
                      {w.adminNote && (
                        <p className="text-xs text-yellow-400 mt-1">Note: {w.adminNote}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-orange-400">-{formatCurrency(w.amount)}</p>
                    <Badge status={w.status} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};
