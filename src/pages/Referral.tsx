import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Referral as ReferralType } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Users, Copy, Share2, Gift, Trophy, Loader2, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export const Referral: React.FC = () => {
  const { user, wallet } = useAuth();
  const [referrals, setReferrals] = useState<ReferralType[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink = `${window.location.origin}/signup?ref=${user?.referralCode}`;

  useEffect(() => {
    if (!user?.uid) return;
    const fetchReferrals = async () => {
      try {
        const q = query(
          collection(db, 'referrals'),
          where('referrerId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReferralType)));
      } catch (_e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchReferrals();
  }, [user?.uid]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Join RoyalBet Casino',
        text: `Use my referral code ${user?.referralCode} and get ₹50 bonus!`,
        url: referralLink,
      });
    } else {
      copy(referralLink, 'Referral link');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500/20 to-purple-500/10 border border-pink-500/20 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">🎁</div>
          <h2 className="text-2xl font-bold text-white mb-1">Refer & Earn</h2>
          <p className="text-gray-400">Earn ₹50 for every friend you invite!</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Your Referrals', value: referrals.length },
              { label: 'Earned', value: formatCurrency(wallet?.referralBalance || 0) },
              { label: 'Per Referral', value: '₹50' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Code */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-white">Your Referral Code</h3>
          </div>
          <div className="flex items-center gap-3 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-xl p-4 mb-3">
            <span className="text-2xl font-mono font-bold text-yellow-400 flex-1 tracking-wider">
              {user?.referralCode || 'Loading...'}
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => copy(user?.referralCode || '', 'Referral code')}
              className="p-2 bg-pink-500/20 rounded-lg hover:bg-pink-500/30 transition-colors"
            >
              <Copy className="w-5 h-5 text-pink-400" />
            </motion.button>
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
            <LinkIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-400 flex-1 truncate">{referralLink}</span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => copy(referralLink, 'Referral link')}
              className="p-1 hover:text-white text-gray-400"
            >
              <Copy className="w-4 h-4" />
            </motion.button>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={share}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white font-bold py-3 rounded-xl"
          >
            <Share2 className="w-5 h-5" />
            Share with Friends
          </motion.button>
        </div>

        {/* How it works */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            How it works
          </h3>
          <div className="space-y-3">
            {[
              { step: 1, text: 'Share your referral code or link', icon: '📤' },
              { step: 2, text: 'Friend signs up using your code', icon: '👤' },
              { step: 3, text: 'Both of you get ₹50 bonus!', icon: '🎁' },
            ].map(({ step, text, icon }) => (
              <div key={step} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {icon}
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-yellow-500 text-black rounded-full flex items-center justify-center text-xs font-bold">
                    {step}
                  </span>
                  <p className="text-sm text-gray-300">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Referral List */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-white">Referred Friends ({referrals.length})</h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
            </div>
          ) : referrals.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No referrals yet. Share your code!</p>
          ) : (
            <div className="space-y-3">
              {referrals.map((ref, i) => (
                <motion.div
                  key={ref.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-pink-500/20 rounded-full flex items-center justify-center text-sm font-bold text-pink-400">
                      {ref.referredName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{ref.referredName}</p>
                      <p className="text-xs text-gray-500">{formatDate(ref.createdAt)}</p>
                    </div>
                  </div>
                  <span className="text-green-400 font-semibold text-sm">
                    +{formatCurrency(ref.bonusAmount)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
