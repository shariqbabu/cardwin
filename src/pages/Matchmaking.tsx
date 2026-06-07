import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Clock, X, Zap, Trophy, Loader2,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  joinMatchmakingQueue,
  cancelMatchmaking,
  findMatch,
  subscribeMatchmakingQueue,
} from '../firebase/games';
import { addFunds, deductFunds } from '../firebase/wallet';
import { calculateUsableBalance, formatCurrency } from '../utils/helpers';
import toast from 'react-hot-toast';

const ENTRY_FEES = [10, 20, 50, 100, 200, 500];

export const Matchmaking: React.FC = () => {
  const { firebaseUser, user, wallet } = useAuth();
  const navigate = useNavigate();

  const [selectedFee, setSelectedFee] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitTime, setWaitTime] = useState(0);
  const [onlinePlayers, setOnlinePlayers] = useState(0);

  const matchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessing = useRef(false);
  // FIX: selectedFee ref — polling callback mein stale closure se bachne ke liye
  const selectedFeeRef = useRef<number | null>(null);

  const usableBalance = wallet ? calculateUsableBalance(wallet) : 0;

  const clearTimers = () => {
    if (matchIntervalRef.current) clearInterval(matchIntervalRef.current);
    if (waitTimerRef.current) clearInterval(waitTimerRef.current);
  };

  // Subscribe to online players count
  useEffect(() => {
    const q = query(collection(db, 'users'), where('isOnline', '==', true));
    const unsub = onSnapshot(q, (snap) => setOnlinePlayers(snap.size));
    return () => unsub();
  }, []);

  // Subscribe to queue status
  useEffect(() => {
    if (!queueId) return;

    const unsub = subscribeMatchmakingQueue(queueId, (entry) => {
      if (!entry) return;

      if (entry.status === 'MATCHED' && (entry as any).roomId) {
        clearTimers();
        toast.success('🎮 Match found! Entering game room...');
        setTimeout(() => {
          navigate(`/game-room/${(entry as any).roomId}`);
        }, 1500);
      }
    });

    return () => unsub();
  }, [queueId, navigate]);

  // FIX: polling mein deductFunds call nahi — woh findGame mein ho chuka hai
  // findMatch sirf room create karta hai, dobara deduct nahi karna
  const startMatchPolling = useCallback((myQueueId: string, fee: number, uid: string) => {
    matchIntervalRef.current = setInterval(async () => {
      if (isProcessing.current) return;
      isProcessing.current = true;
      try {
        const roomId = await findMatch(uid, myQueueId, fee, 'CARD_GAME');
        if (roomId) {
          clearTimers();
        }
      } catch (_e) {
        // ignore — opponent already matched ya network issue
      } finally {
        isProcessing.current = false;
      }
    }, 3000);
  }, []);

  const findGame = async () => {
    if (!firebaseUser || !user || !selectedFee) return;

    if (usableBalance < selectedFee) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);
    try {
      // FIX: pehle queue join karo, phir deduct karo
      // Pehle wale code mein deduct hota tha, phir queue join fail hoti thi —
      // paise ja chuke hote the wapas nahi aate the
      const id = await joinMatchmakingQueue(
        firebaseUser.uid,
        user.name,
        user.photoURL || '',
        selectedFee,
        'CARD_GAME'
      );

      // Queue join successful — ab safe hai deduct karna
      await deductFunds(
        firebaseUser.uid,
        selectedFee,
        'ENTRY FEE',
        `Card Battle entry fee - ₹${selectedFee}`
      );

      selectedFeeRef.current = selectedFee;
      setQueueId(id);
      setSearching(true);
      setWaitTime(0);

      waitTimerRef.current = setInterval(() => {
        setWaitTime((p) => p + 1);
      }, 1000);

      startMatchPolling(id, selectedFee, firebaseUser.uid);
      toast.success('Looking for opponent...');
    } catch (err: any) {
      toast.error(err.message || 'Failed to join queue');
    } finally {
      setLoading(false);
    }
  };

  const cancelSearch = async () => {
    if (!queueId) return;
    clearTimers();

    try {
      await cancelMatchmaking(queueId);

      // FIX: dynamic import hata diya — addFunds seedha import karo upar se
      const fee = selectedFeeRef.current;
      if (fee && firebaseUser) {
        await addFunds(
          firebaseUser.uid,
          fee,
          'depositBalance', // FIX: winningBalance nahi — deposit wapas deposit mein hi aana chahiye
          'Card Battle - Matchmaking cancelled refund', 'REFUND'
        );
      }

      setQueueId(null);
      setSearching(false);
      setWaitTime(0);
      selectedFeeRef.current = null;
      toast.success('Matchmaking cancelled. Entry fee refunded.');
    } catch (_e) {
      toast.error('Failed to cancel');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, []);

  const formatWaitTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold text-white">🃏 Card Battle</h2>
        <p className="text-gray-400 text-sm">2-player card comparison game</p>
      </motion.div>

      {/* Online Players */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span className="text-sm text-gray-400">{onlinePlayers} players online</span>
      </div>

      <AnimatePresence mode="wait">
        {!searching ? (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            {/* Game Rules */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                How it Works
              </h3>
              <div className="space-y-2">
                {[
                  { step: '1', text: 'Select entry fee & find match', icon: '💰' },
                  { step: '2', text: 'Wait for another player', icon: '⏳' },
                  { step: '3', text: 'Both players get a random card', icon: '🃏' },
                  { step: '4', text: 'Higher card wins 1.8× entry fee!', icon: '🏆' },
                ].map(({ step, text, icon }) => (
                  <div key={step} className="flex items-center gap-3 text-sm">
                    <span className="text-2xl">{icon}</span>
                    <span className="text-gray-300">{text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500 border-t border-white/10 pt-3">
                Platform fee: 10% | Winner gets 1.8× entry fee
              </div>
            </div>

            {/* Entry Fee Selection */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <p className="text-sm font-medium text-gray-300 mb-3">Select Entry Fee</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {ENTRY_FEES.map((fee) => (
                  <motion.button
                    key={fee}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedFee(fee)}
                    disabled={fee > usableBalance}
                    className={`py-4 rounded-xl border-2 transition-all font-semibold ${
                      selectedFee === fee
                        ? 'bg-blue-500/30 border-blue-400 text-blue-300'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    } disabled:opacity-40`}
                  >
                    <div className="text-lg">₹{fee}</div>
                    <div className="text-xs text-gray-500">Win ₹{(fee * 1.8).toFixed(0)}</div>
                  </motion.button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                <span>Usable Balance: {formatCurrency(usableBalance)}</span>
                {selectedFee && (
                  <span>Potential win: ₹{(selectedFee * 1.8).toFixed(0)}</span>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={findGame}
                disabled={!selectedFee || loading}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-bold py-4 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Joining...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" /> Find Match
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="searching"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center space-y-6"
          >
            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-3xl p-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="w-24 h-24 mx-auto mb-6 relative"
              >
                <div className="w-24 h-24 rounded-full border-4 border-blue-500/30 border-t-blue-400 absolute inset-0 animate-spin" />
                <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 absolute inset-4 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">
                  🃏
                </div>
              </motion.div>

              <h3 className="text-xl font-bold text-white mb-2">Finding Opponent...</h3>
              <p className="text-gray-400 text-sm mb-4">Entry Fee: ₹{selectedFee}</p>

              <div className="flex items-center justify-center gap-2 text-yellow-400">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-lg">{formatWaitTime(waitTime)}</span>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
                <Users className="w-4 h-4" />
                <span>Searching among {onlinePlayers} online players</span>
              </div>

              <div className="flex justify-center gap-2 mt-5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                  />
                ))}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={cancelSearch}
              className="flex items-center justify-center gap-2 w-full py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-all font-medium"
            >
              <X className="w-4 h-4" />
              Cancel Matchmaking
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
