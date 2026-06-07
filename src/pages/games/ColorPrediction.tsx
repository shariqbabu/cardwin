// src/pages/games/ColorPrediction.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { Timer, TrendingUp, History, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ColorPredictionRound,
  ColorChoice,
  ROUND_DURATION_MS,
  subscribeLatestRound,
  subscribeColorHistory,
  getOrCreateActiveRound,
  placeBet,
  closeBetting,
  settleRound,
} from '../../firebase/colorPrediction';
import { calculateUsableBalance, formatCurrency } from '../../utils/helpers';

const ROUND_DURATION_S = ROUND_DURATION_MS / 1000;
const BET_AMOUNTS = [10, 20, 50, 100, 200, 500];

const COLOR_CONFIG = {
  RED: {
    label: 'Red', emoji: '🔴',
    bg: 'bg-red-500', border: 'border-red-400',
    hover: 'hover:bg-red-500/30', text: 'text-red-400',
    glow: 'shadow-red-500/40', multiplier: 2,
  },
  GREEN: {
    label: 'Green', emoji: '🟢',
    bg: 'bg-green-500', border: 'border-green-400',
    hover: 'hover:bg-green-500/30', text: 'text-green-400',
    glow: 'shadow-green-500/40', multiplier: 2,
  },
  VIOLET: {
    label: 'Violet', emoji: '🟣',
    bg: 'bg-violet-500', border: 'border-violet-400',
    hover: 'hover:bg-violet-500/30', text: 'text-violet-400',
    glow: 'shadow-violet-500/40', multiplier: 3,
  },
} as const;

export const ColorPrediction: React.FC = () => {
  const { firebaseUser, user, wallet } = useAuth();

  const [round, setRound]               = useState<ColorPredictionRound | null>(null);
  const [history, setHistory]           = useState<ColorPredictionRound[]>([]);
  const [timeLeft, setTimeLeft]         = useState(ROUND_DURATION_S);
  const [selectedColor, setSelectedColor] = useState<ColorChoice | null>(null);
  const [betAmount, setBetAmount]       = useState(10);
  const [betting, setBetting]           = useState(false);

  const roundRef        = useRef<ColorPredictionRound | null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTriggeredRef = useRef(false);

  // ── FIXED: Watchdog — agar RESULT ke baad 10s mein round nahi aaya toh force create ──
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const startWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(async () => {
      // Agar abhi bhi RESULT mein hai, force next round
      if (roundRef.current?.status === 'RESULT') {
        console.warn('[Watchdog] Stuck in RESULT — forcing new round');
        try {
          await getOrCreateActiveRound();
        } catch (e) {
          console.error('[Watchdog] Force create failed:', e);
        }
      }
    }, 10_000); // 10 seconds ka grace
  }, []);

  const usableBalance = wallet ? calculateUsableBalance(wallet) : 0;
  const hasBet = round?.bets?.some((b) => b.uid === firebaseUser?.uid) ?? false;

  // ── Subscribe to latest round ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeLatestRound((r) => {
      roundRef.current = r;
      setRound(r);

      if (!r) {
        getOrCreateActiveRound().catch(console.error);
        return;
      }

      if (r.status === 'RESULT') {
        hasTriggeredRef.current = false;
        startWatchdog(); // Watchdog shuru karo
      } else {
        clearWatchdog(); // Naya round aa gaya — watchdog cancel
      }
    });

    // ── FIXED: Initial load pe koi round nahi toh create karo ─────────────────
    const initTimer = setTimeout(async () => {
      if (!roundRef.current) {
        try { await getOrCreateActiveRound(); } catch { /* ignore */ }
      }
    }, 2000);

    return () => {
      unsub();
      clearWatchdog();
      clearTimeout(initTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!round || round.status !== 'BETTING') {
      setTimeLeft(0);
      return;
    }

    hasTriggeredRef.current = false;
    const endsAtMs = new Date(round.endsAt).getTime();

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);

        // Sirf ek client closeBetting karega
        let closed = false;
        try {
          closed = await closeBetting(round.id);
        } catch (e) {
          console.error('closeBetting error:', e);
        }

        if (closed) {
          setTimeout(async () => {
            try {
              await settleRound(round.id);
            } catch (e) {
              console.error('settleRound error:', e);
              // ── FIXED: Settle fail hua toh watchdog handle karega ──────────
            }
          }, 3_000);
        } else {
          // Doosre client ne close kiya — settle bhi check karo (safety net)
          setTimeout(async () => {
            const current = roundRef.current;
            if (current?.id === round.id && current?.status === 'CLOSED') {
              try { await settleRound(round.id); } catch { /* already settling */ }
            }
          }, 5_000);
        }
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.status]);

  // ── History ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeColorHistory(15, setHistory);
    return () => unsub();
  }, []);

  // ── Place Bet ──────────────────────────────────────────────────────────────
  const handleBet = useCallback(async () => {
    if (!firebaseUser || !round || !selectedColor) {
      toast.error('Pehle color select karo');
      return;
    }
    if (hasBet)                        { toast.error('Is round mein bet already lag chuki hai'); return; }
    if (betAmount > usableBalance)     { toast.error('Balance kam hai'); return; }
    if (round.status !== 'BETTING')    { toast.error('Betting band ho gayi'); return; }
    if (timeLeft < 5)                  { toast.error('Bahut der ho gayi!'); return; }

    setBetting(true);
    try {
      await placeBet(
        firebaseUser.uid,
        user?.name || 'Player',
        round.id,
        selectedColor,
        betAmount,
      );
      toast.success(`${COLOR_CONFIG[selectedColor].label} pe ₹${betAmount} bet laga diya! ✅`);
    } catch (err: any) {
      toast.error(err.message || 'Bet lagane mein dikkat aayi');
    } finally {
      setBetting(false);
    }
  }, [firebaseUser, round, selectedColor, hasBet, betAmount, usableBalance, timeLeft, user]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const timerPct = (timeLeft / ROUND_DURATION_S) * 100;
  const timerColor =
    timeLeft > 30 ? 'text-green-400' : timeLeft > 10 ? 'text-yellow-400' : 'text-red-400';
  const timerBarColor =
    timeLeft > 30 ? 'bg-green-500' : timeLeft > 10 ? 'bg-yellow-500' : 'bg-red-500';

  const myBet     = round?.bets?.find((b) => b.uid === firebaseUser?.uid);
  const isBetting = round?.status === 'BETTING';
  const isResult  = round?.status === 'RESULT';
  const isClosing = round?.status === 'CLOSED';

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold text-white">🎨 Color Prediction</h2>
        <p className="text-gray-400 text-sm">Color choose karo — bade multiply ke saath jeeto!</p>
      </motion.div>

      {/* Round header + Timer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/5 border border-white/10 rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Round #{round?.roundNumber ?? '…'}</p>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${
              isBetting
                ? 'bg-green-500/15 border-green-500/30 text-green-400'
                : isResult
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
            }`}>
              {isBetting ? '🟢 Betting Open' : isResult ? '🏁 Result' : '⏳ Closing…'}
            </span>
          </div>

          <div className="text-center">
            {isBetting ? (
              <div className={`text-4xl font-bold tabular-nums ${timerColor}`}>
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}
                :{String(timeLeft % 60).padStart(2, '0')}
              </div>
            ) : (
              // ── FIXED: Timer nahi dikhana jab betting open nahi ──────────
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isResult ? 'Next round...' : 'Settling...'}
              </div>
            )}
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mt-0.5">
              <Timer className="w-3 h-3" />
              <span>timer</span>
            </div>
          </div>
        </div>

        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: isBetting ? `${timerPct}%` : '0%' }}
            transition={{ duration: 0.8, ease: 'linear' }}
            className={`h-full rounded-full transition-colors ${timerBarColor}`}
          />
        </div>
      </motion.div>

      {/* Result card */}
      <AnimatePresence mode="wait">
        {isResult && round?.result && (
          <motion.div
            key={`result-${round.id}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-gradient-to-br from-yellow-500/15 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center"
          >
            <p className="text-gray-400 text-sm mb-3">Result</p>
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl mb-3 shadow-xl ${COLOR_CONFIG[round.result].bg} ${COLOR_CONFIG[round.result].glow}`}>
              {COLOR_CONFIG[round.result].emoji}
            </div>
            <p className={`text-2xl font-bold ${COLOR_CONFIG[round.result].text}`}>
              {COLOR_CONFIG[round.result].label} Wins!
            </p>

            {myBet && (
              <div className={`mt-3 px-4 py-2 rounded-xl inline-block text-sm font-semibold ${
                myBet.color === round.result
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {myBet.color === round.result
                  ? `🎉 Jeeto! +₹${myBet.amount * myBet.multiplier}`
                  : `😔 Haaro — ₹${myBet.amount}`}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">Agla round thodi der mein…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Betting panel */}
      {(isBetting || (isClosing && myBet)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4"
        >
          {!hasBet ? (
            <>
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Color choose karo</p>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.entries(COLOR_CONFIG) as [ColorChoice, typeof COLOR_CONFIG.RED][]).map(([color, cfg]) => (
                    <motion.button
                      key={color}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedColor(color)}
                      className={`relative py-4 rounded-xl border-2 font-bold text-white transition-all ${
                        selectedColor === color
                          ? `${cfg.bg} ${cfg.border} shadow-lg ${cfg.glow}`
                          : `bg-white/5 border-white/10 ${cfg.hover}`
                      }`}
                    >
                      <div className="text-3xl mb-1">{cfg.emoji}</div>
                      <div className="text-xs">{cfg.label}</div>
                      <div className={`text-xs font-bold ${cfg.text}`}>{cfg.multiplier}×</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Amount</p>
                <div className="grid grid-cols-3 gap-2">
                  {BET_AMOUNTS.map((amt) => (
                    <motion.button
                      key={amt}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setBetAmount(amt)}
                      disabled={amt > usableBalance}
                      className={`py-2 rounded-xl text-sm font-semibold border transition-all ${
                        betAmount === amt
                          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      } disabled:opacity-30`}
                    >
                      ₹{amt}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between text-xs text-gray-400">
                <span>Balance: {formatCurrency(usableBalance)}</span>
                {selectedColor && (
                  <span className="text-green-400">
                    Jeeto: {formatCurrency(betAmount * COLOR_CONFIG[selectedColor].multiplier)}
                  </span>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBet}
                disabled={!selectedColor || betting || timeLeft < 5 || !isBetting}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold py-3 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
              >
                {betting && <Loader2 className="w-4 h-4 animate-spin" />}
                {selectedColor
                  ? `${COLOR_CONFIG[selectedColor].emoji} ${COLOR_CONFIG[selectedColor].label} pe Bet Lagao`
                  : 'Color choose karo pehle'}
              </motion.button>
            </>
          ) : (
            myBet && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center space-y-1">
                <p className="text-green-400 font-semibold text-sm">✅ Bet lagi hui hai!</p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                  <div className={`w-3 h-3 rounded-full ${COLOR_CONFIG[myBet.color].bg}`} />
                  <span>{COLOR_CONFIG[myBet.color].label}</span>
                  <span>•</span>
                  <span>₹{myBet.amount}</span>
                  <span>•</span>
                  <span className={COLOR_CONFIG[myBet.color].text}>
                    Jeet: ₹{myBet.amount * myBet.multiplier}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Result ka wait karo…</p>
              </div>
            )
          )}
        </motion.div>
      )}

      {/* Active bets */}
      {round && (round.bets?.length ?? 0) > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
            <p className="text-sm font-medium text-white">
              Active Bets ({round.bets.length} player{round.bets.length !== 1 ? 's' : ''})
            </p>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {round.bets.map((bet, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-lg ${
                  bet.uid === firebaseUser?.uid ? 'bg-white/10' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${COLOR_CONFIG[bet.color]?.bg}`} />
                  <span className="text-gray-300 truncate max-w-[120px]">{bet.userName}</span>
                  {bet.uid === firebaseUser?.uid && (
                    <span className="text-yellow-400 font-semibold">(You)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{COLOR_CONFIG[bet.color]?.label}</span>
                  <span className="font-semibold text-white">₹{bet.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-white">Recent Results</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {history.slice(0, 12).map((h) =>
              h.result ? (
                <div
                  key={h.id}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow ${COLOR_CONFIG[h.result]?.bg}`}
                  title={`Round ${h.roundNumber}: ${h.result}`}
                >
                  {COLOR_CONFIG[h.result]?.label.charAt(0)}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
};
