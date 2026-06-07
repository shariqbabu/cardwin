import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowUpCircle, AlertTriangle, Loader2, CheckCircle, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { withdrawFunds } from '../firebase/wallet';
import { formatCurrency } from '../utils/helpers';
import toast from 'react-hot-toast';

const schema = z.object({
  amount: z.number().min(100, 'Minimum withdrawal is ₹100').max(10000, 'Maximum ₹10,000 per request'),
  upiId: z.string().min(5, 'Enter valid UPI ID').regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID format'),
});

type FormData = z.infer<typeof schema>;

const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

export const Withdrawal: React.FC = () => {
  const { firebaseUser, wallet } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const amount = watch('amount');

  const onSubmit = async (data: FormData) => {
    if (!firebaseUser) return;

    if ((wallet?.winningBalance || 0) < data.amount) {
      toast.error('Insufficient winning balance');
      return;
    }

    setLoading(true);
    try {
      await withdrawFunds(firebaseUser.uid, data.amount, data.upiId);
      setSubmitted(true);
      toast.success('Withdrawal request submitted!');
    } catch (err: any) {
      toast.error(err.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-gray-400 mb-6">
            Your withdrawal of {formatCurrency(amount)} is being processed. You'll receive funds within 24 hours.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold px-6 py-3 rounded-xl"
          >
            New Withdrawal
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Balance Info */}
        <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/10 border border-orange-500/20 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-orange-400" />
              <span className="text-gray-300">Winning Balance (Withdrawable)</span>
            </div>
            <span className="text-2xl font-bold text-orange-400">
              {formatCurrency(wallet?.winningBalance || 0)}
            </span>
          </div>
        </div>

        {/* Amount */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-lg font-bold text-white mb-4">Select Amount</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {quickAmounts.map(amt => (
              <motion.button
                key={amt}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => setValue('amount', amt)}
                className={`py-2 rounded-xl text-sm font-semibold transition-all border ${
                  amount === amt
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                }`}
              >
                ₹{amt}
              </motion.button>
            ))}
          </div>
          <input
            {...register('amount', { valueAsNumber: true })}
            type="number"
            placeholder="Enter amount"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-all"
          />
          {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
        </div>

        {/* UPI ID */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-lg font-bold text-white mb-4">UPI ID</h3>
          <input
            {...register('upiId')}
            type="text"
            placeholder="yourname@upi"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-all"
          />
          {errors.upiId && <p className="text-red-400 text-xs mt-1">{errors.upiId.message}</p>}
        </div>

        {/* Warning */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-300 mb-1">Important Notes</p>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• Only winning balance can be withdrawn</li>
                <li>• Minimum withdrawal: ₹100</li>
                <li>• Processing time: up to 24 hours</li>
                <li>• Ensure UPI ID is correct before submitting</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Deposit balance cannot be directly withdrawn. Play games to convert it to winning balance.
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit(onSubmit)}
          disabled={loading || !wallet?.winningBalance}
          className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-black font-bold py-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
        >
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          Request Withdrawal
        </motion.button>
      </motion.div>
    </div>
  );
};
