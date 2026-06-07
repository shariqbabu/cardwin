// src/pages/games/DragonTiger.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeLatestDragonTiger,
  createDragonTigerRound,
  placeDragonTigerBet,
  dealDragonTiger,
  forceDealDragonTiger,
  type DragonTigerGame,
  type DTBet,
} from '../../firebase/dragonTiger';
import type { DTCard } from '../../firebase/dragonTiger';
import CardDisplay from '../../components/games/CardDisplay';
import GameTimer from '../../components/games/GameTimer';
import { formatCurrency, calculateUsableBalance } from '../../utils/helpers';
import {
  Users, History, Loader2, AlertCircle,
  CheckCircle, Coins, RefreshCw, Flame,
} from 'lucide-react';

const BET_CHIPS       = [10, 50, 100, 500, 1000];
const NEXT_ROUND_DELAY = 8_000;

interface HistoryEntry {
  winner:      'dragon' | 'tiger' | 'tie';
  roundNumber: number;
}

const DragonTigerPage: React.FC = () => {
  const { user, wallet } = useAuth();

  const [gameId,      setGameId]      = useState<string | null>(null);
  const [game,        setGame]        = useState<DragonTigerGame | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [betAmount,   setBetAmount]   = useState(50);
  const [placing,     setPlacing]     = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [history,     setHistory]     = useState<HistoryEntry[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState<number | null>(null);

  // Refs
  const currentGameId   = useRef<string | null>(null);
  const resultHandled   = useRef<string | null>(null);
  const nextRoundTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Clear countdown timers ──────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (nextRoundTimer.current) { clearTimeout(nextRoundTimer.current);   nextRoundTimer.current = null; }
    if (countdownRef.current)   { clearInterval(countdownRef.current);    countdownRef.current   = null; }
  }, []);

  // ── Timer date parser ───────────────────────────────────────────────────────
  const getTimerDate = (val: any): Date => {
    if (!val)         return new Date(Date.now() + 20_000);
    if (val?.toDate)  return val.toDate();
    if (val?.seconds) return new Date(val.seconds * 1000);
    return new Date(val);
  };

  // ── Start next round ────────────────────────────────────────────────────────
  const startNextRound = useCallback(async () => {
    clearTimers();
    resultHandled.current = null;
    setNextRoundIn(null);
    setGame(null);
    try {
      await createDragonTigerRound();
    } catch {
      showToast('Failed to start next round', 'error');
    }
  }, [clearTimers, showToast]);

  // ── Schedule next-round countdown ──────────────────────────────────────────
  const scheduleNextRound = useCallback((roundKey: string) => {
    if (resultHandled.current === roundKey) return;
    resultHandled.current = roundKey;
    clearTimers();

    let secs = Math.ceil(NEXT_ROUND_DELAY / 1000);
    setNextRoundIn(secs);

    countdownRef.current = setInterval(() => {
      secs -= 1;
      setNextRoundIn(secs > 0 ? secs : null);
      if (secs <= 0) { clearInterval(countdownRef.current!); countdownRef.current = null; }
    }, 1000);

    nextRoundTimer.current = setTimeout(startNextRound, NEXT_ROUND_DELAY);
  }, [clearTimers, startNextRound]);

  // ── Subscribe to Firestore: latest game ────────────────────────────────────
  useEffect(() => {
    setLoading(true);

    const unsub = subscribeLatestDragonTiger(async (id, data) => {
      if (id !== currentGameId.current) {
        currentGameId.current = id;
        setGameId(id);
        clearTimers();
        setNextRoundIn(null);
      }

      setGame(data);
      setLoading(false);

      if (data.status === 'result' && data.winner) {
        setHistory((prev) => {
          if (prev.find((h) => h.roundNumber === data.roundNumber)) return prev;
          return [{ winner: data.winner!, roundNumber: data.roundNumber }, ...prev.slice(0, 19)];
        });
        scheduleNextRound(String(data.roundNumber));
      }
    });

    const initTimer = setTimeout(async () => {
      if (!currentGameId.current) {
        try { await createDragonTigerRound(); } catch { /* ignore */ }
      }
    }, 2000);

    return () => {
      unsub();
      clearTimers();
      clearTimeout(initTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer expire → deal karo ────────────────────────────────────────────────
  const handleTimerExpire = useCallback(async () => {
    if (!gameId) return;
    try {
      await dealDragonTiger(gameId);
    } catch (e: any) {
      if (e.message !== 'already-dealing' && e.message !== 'already-done') {
        showToast(e.message || 'Deal failed', 'error');
      }
    }
  }, [gameId, showToast]);

  // ── Stuck game watchdog ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!game || !gameId) return;
    if (game.status !== 'dealing') return;

    const checkStuck = setTimeout(async () => {
      try {
        await forceDealDragonTiger(gameId);
        showToast('Recovered stuck game', 'success');
      } catch {
        // ignore
      }
    }, 10_000);

    return () => clearTimeout(checkStuck);
  }, [game?.status, gameId, showToast]);

  // ── Safety net: ensure deal fires even if timer missed ──────────────────────
  useEffect(() => {
    if (!game || !gameId) return;
    if (game.status !== 'betting' || !game.bettingEndsAt) return;

    const endsAt = getTimerDate(game.bettingEndsAt).getTime();
    const remaining = endsAt - Date.now();

    if (remaining <= 0) {
      handleTimerExpire();
      return;
    }

    const safetyNet = setTimeout(() => {
      handleTimerExpire();
    }, remaining + 2000);

    return () => clearTimeout(safetyNet);
  }, [game?.status, game?.bettingEndsAt, gameId, handleTimerExpire]);

  // ── Place bet ───────────────────────────────────────────────────────────────
  const handleBet = async (side: 'dragon' | 'tiger' | 'tie') => {
    if (!user || !gameId)           { showToast('Please login', 'error');         return; }
    if (!wallet)                    { showToast('Wallet not loaded', 'error');     return; }
    if (game?.status !== 'betting') { showToast('Betting is closed', 'error');    return; }
    if (myBet)                      { showToast('Already placed a bet', 'error'); return; }
    if (calculateUsableBalance(wallet) < betAmount) {
      showToast('Insufficient balance', 'error'); return;
    }

    setPlacing(true);
    try {
      await placeDragonTigerBet(gameId, user.uid, user.name || 'Player', betAmount, side);
      const sideLabel = side === 'dragon' ? 'DRAGON 🐉' : side === 'tiger' ? 'TIGER 🐅' : 'TIE 🤝';
      showToast(`✅ ₹${betAmount} on ${sideLabel}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Bet failed', 'error');
    } finally {
      setPlacing(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const myBet         = game?.bets?.find((b) => b.uid === user?.uid);
  const usableBalance = wallet ? calculateUsableBalance(wallet) : 0;

  const dragonTotal   = game?.bets?.filter((b) => b.side === 'dragon').reduce((s, b) => s + b.amount, 0) ?? 0;
  const tigerTotal    = game?.bets?.filter((b) => b.side === 'tiger').reduce((s, b) => s + b.amount, 0) ?? 0;
  const tieTotal      = game?.bets?.filter((b) => b.side === 'tie').reduce((s, b) => s + b.amount, 0) ?? 0;

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading Dragon Tiger...</p>
        </div>
      </div>
    );
  }

  // ── Winner card highlight helper ────────────────────────────────────────────
  const getSideGlow = (side: 'dragon' | 'tiger') => {
    if (game?.status !== 'result') return '';
    if (game.winner === side) return 'ring-4 ring-yellow-400/60 shadow-lg shadow-yellow-400/20';
    if (game.winner === 'tie') return 'ring-2 ring-amber-400/30';
    return 'opacity-50';
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl border text-sm font-medium
          max-w-[90vw] whitespace-nowrap
          ${toast.type === 'success'
            ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-300'
            : 'bg-red-900/95 border-red-500/50 text-red-300'}`}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span className="truncate">{toast.msg}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 py-3 md:px-4 md:py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg md:text-xl font-black text-white">🐉 Dragon Tiger</h1>
            <p className="text-gray-500 text-xs hidden sm:block">Real-time card battle game</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5">
              <p className="text-gray-500 text-xs">Balance</p>
              <p className="text-yellow-400 font-bold text-sm">{formatCurrency(usableBalance)}</p>
            </div>
            {game && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5">
                <p className="text-gray-500 text-xs">Round</p>
                <p className="text-white font-bold text-sm">#{String(game.roundNumber).slice(-4)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-col lg:flex-row gap-3">

          {/* ── GAME BOARD ── */}
          <div className="flex-1 space-y-3">

            {/* Status bar */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0
                  ${game?.status === 'betting'  ? 'bg-emerald-400 animate-pulse' :
                    game?.status === 'dealing'  ? 'bg-amber-400 animate-pulse'   : 'bg-blue-400'}`} />
                <span className="font-semibold text-xs md:text-sm">
                  {game?.status === 'betting' && <span className="text-emerald-400">🎲 Betting Open</span>}
                  {game?.status === 'dealing' && <span className="text-amber-400">🃏 Revealing Cards...</span>}
                  {game?.status === 'result'  && (
                    <span className={
                      game.winner === 'dragon' ? 'text-orange-400' :
                      game.winner === 'tiger'  ? 'text-rose-400'   : 'text-amber-400'
                    }>
                      🏆 {game.winner?.toUpperCase()} {game.winner === 'tie' ? '— It\'s a Tie!' : 'Wins!'}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {game?.status === 'betting' && game?.bettingEndsAt && (
                  <GameTimer
                    endsAt={getTimerDate(game.bettingEndsAt)}
                    onExpire={handleTimerExpire}
                  />
                )}
                {game?.status === 'result' && nextRoundIn !== null && (
                  <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5">
                    <RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-xs text-gray-400">
                      Next <span className="text-yellow-400 font-bold">{nextRoundIn}s</span>
                    </span>
                  </div>
                )}
                {game?.status === 'dealing' && (
                  <div className="flex items-center gap-1 text-amber-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">Revealing</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900
              border border-gray-700/30 rounded-2xl p-3 md:p-5 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03]"
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />

              {/* VS Banner */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-3">
                  <span className="text-orange-500 font-black text-sm tracking-wider">DRAGON</span>
                  <span className="bg-gray-800 border border-gray-600 rounded-full px-3 py-1
                    text-yellow-400 font-black text-xs">VS</span>
                  <span className="text-rose-500 font-black text-sm tracking-wider">TIGER</span>
                </div>
              </div>

              {/* Cards area */}
              <div className="grid grid-cols-3 gap-2 md:gap-4 items-center">

                {/* DRAGON Card */}
                <div className={`text-center rounded-xl p-3 md:p-4 border-2 transition-all duration-500
                  relative overflow-hidden min-h-[120px] md:min-h-[150px]
                  ${game?.winner === 'dragon'
                    ? 'border-yellow-400 bg-orange-900/20 shadow-lg shadow-yellow-400/10'
                    : game?.status === 'result' && game?.winner !== 'dragon'
                    ? 'border-orange-900/20 bg-black/20 opacity-60'
                    : 'border-orange-800/30 bg-orange-950/10'} ${getSideGlow('dragon')}`}>

                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="font-black text-sm md:text-base text-orange-400">DRAGON</span>
                  </div>

                  {myBet?.side === 'dragon' && (
                    <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30
                      rounded-full px-2 py-0.5 mb-2 inline-block">
                      Your Bet ₹{myBet.amount}
                    </span>
                  )}

                  <div className="flex justify-center min-h-[60px] items-center">
                    {game?.dragonCard ? (
                      <CardDisplay card={game.dragonCard} size="lg" animate />
                    ) : game?.status === 'dealing' ? (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl bg-orange-500/10
                        border border-orange-500/20 animate-pulse flex items-center justify-center">
                        <span className="text-orange-500/30 text-2xl">🐉</span>
                      </div>
                    ) : (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 border-dashed
                        border-orange-800/30 flex items-center justify-center bg-black/10">
                        <span className="text-orange-800/30 text-2xl">?</span>
                      </div>
                    )}
                  </div>

                  {dragonTotal > 0 && (
                    <p className="text-xs text-orange-400 font-bold mt-1">₹{dragonTotal}</p>
                  )}
                </div>

                {/* CENTER: Tiger Card / VS */}
                <div className="text-center rounded-xl p-3 md:p-4 border-2 transition-all duration-500
                  relative overflow-hidden min-h-[120px] md:min-h-[150px]
                  ${game?.winner === 'tie'
                    ? 'border-yellow-400 bg-amber-900/20 shadow-lg shadow-yellow-400/10'
                    : 'border-gray-700/30 bg-black/10'}">

                  {/* Tie betting area — always visible during betting */}
                  {game?.status === 'betting' && !myBet && (
                    <div className="mb-2">
                      <span className="text-amber-400 font-black text-xs tracking-wider">TIE</span>
                      <p className="text-amber-500/50 text-[10px]">8× Payout</p>
                      {tieTotal > 0 && (
                        <p className="text-xs text-amber-400 font-bold mt-0.5">₹{tieTotal}</p>
                      )}
                    </div>
                  )}

                  {myBet?.side === 'tie' && (
                    <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30
                      rounded-full px-2 py-0.5 mb-2 inline-block">
                      Your Tie Bet ₹{myBet.amount}
                    </span>
                  )}

                  {/* Tiger card display */}
                  <div className="flex justify-center min-h-[60px] items-center">
                    {game?.tigerCard ? (
                      <CardDisplay card={game.tigerCard} size="lg" animate />
                    ) : game?.status === 'dealing' ? (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl bg-rose-500/10
                        border border-rose-500/20 animate-pulse flex items-center justify-center">
                        <span className="text-rose-500/30 text-2xl">🐅</span>
                      </div>
                    ) : (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 border-dashed
                        border-gray-700/30 flex items-center justify-center bg-black/10">
                        <span className="text-gray-700/30 text-2xl">?</span>
                      </div>
                    )}
                  </div>

                  {/* Tie result */}
                  {game?.status === 'result' && game?.winner === 'tie' && (
                    <div className="mt-2">
                      <span className="text-yellow-400 font-black text-sm">🤝 TIE!</span>
                      <p className="text-amber-400 text-xs">8× Payout</p>
                      {tieTotal > 0 && (
                        <p className="text-xs text-amber-400 font-bold">₹{tieTotal}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* TIGER Card */}
                <div className={`text-center rounded-xl p-3 md:p-4 border-2 transition-all duration-500
                  relative overflow-hidden min-h-[120px] md:min-h-[150px]
                  ${game?.winner === 'tiger'
                    ? 'border-yellow-400 bg-rose-900/20 shadow-lg shadow-yellow-400/10'
                    : game?.status === 'result' && game?.winner !== 'tiger'
                    ? 'border-rose-900/20 bg-black/20 opacity-60'
                    : 'border-rose-800/30 bg-rose-950/10'} ${getSideGlow('tiger')}`}>

                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500 flex-shrink-0" />
                    <span className="font-black text-sm md:text-base text-rose-400">TIGER</span>
                  </div>

                  {myBet?.side === 'tiger' && (
                    <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30
                      rounded-full px-2 py-0.5 mb-2 inline-block">
                      Your Bet ₹{myBet.amount}
                    </span>
                  )}

                  <div className="flex justify-center min-h-[60px] items-center">
                    {game?.tigerCard ? (
                      <CardDisplay card={game.tigerCard} size="lg" animate />
                    ) : game?.status === 'dealing' ? (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl bg-rose-500/10
                        border border-rose-500/20 animate-pulse flex items-center justify-center">
                        <span className="text-rose-500/30 text-2xl">🐅</span>
                      </div>
                    ) : (
                      <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 border-dashed
                        border-rose-800/30 flex items-center justify-center bg-black/10">
                        <span className="text-rose-800/30 text-2xl">?</span>
                      </div>
                    )}
                  </div>

                  {tigerTotal > 0 && (
                    <p className="text-xs text-rose-400 font-bold mt-1">₹{tigerTotal}</p>
                  )}
                </div>
              </div>

              {/* Pot */}
              {(game?.pot ?? 0) > 0 && (
                <div className="mt-3 text-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Pot • </span>
                  <span className="text-yellow-400 font-black text-base">{formatCurrency(game?.pot ?? 0)}</span>
                </div>
              )}
            </div>

            {/* Result banner */}
            {game?.status === 'result' && myBet && (
              <div className={`rounded-xl p-4 border-2 text-center
                ${myBet.side === game.winner
                  ? 'bg-emerald-900/40 border-emerald-500/50'
                  : game.winner === 'tie' && myBet.side !== 'tie'
                  ? 'bg-amber-900/40 border-amber-500/50'
                  : 'bg-red-900/40 border-red-500/50'}`}>
                {myBet.side === game.winner ? (
                  <>
                    <p className="text-2xl mb-1">🎉</p>
                    <p className="text-emerald-400 font-black text-lg">You Won!</p>
                    <p className="text-emerald-300 font-bold">
                      +{formatCurrency(
                        game.winner === 'tie'
                          ? myBet.amount * 8
                          : Math.floor(myBet.amount * 1.95)
                      )}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">Added to winning balance</p>
                  </>
                ) : game.winner === 'tie' && myBet.side !== 'tie' ? (
                  <>
                    <p className="text-2xl mb-1">🤝</p>
                    <p className="text-amber-400 font-black text-lg">It's a Tie!</p>
                    <p className="text-amber-300">
                      +{formatCurrency(Math.floor(myBet.amount * 0.5))} (half return)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl mb-1">😔</p>
                    <p className="text-red-400 font-black text-lg">Better Luck Next Time</p>
                    <p className="text-red-300">-{formatCurrency(myBet.amount)}</p>
                  </>
                )}
              </div>
            )}

            {/* Bet panel */}
            {game?.status === 'betting' && (
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                    <Coins className="w-4 h-4 text-yellow-400" />
                    Place Your Bet
                  </h3>
                  {myBet && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-3 py-1">
                      ✓ Bet Placed
                    </span>
                  )}
                </div>

                {myBet ? (
                  <div className="text-center py-3">
                    <p className="text-gray-400 text-xs mb-2">Betting on:</p>
                    <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-black text-base
                      ${myBet.side === 'dragon'
                        ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                        : myBet.side === 'tiger'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-400'}`}>
                      <div className={`w-3 h-3 rounded-full ${
                        myBet.side === 'dragon' ? 'bg-orange-500' :
                        myBet.side === 'tiger'  ? 'bg-rose-500'  : 'bg-amber-500'
                      }`} />
                      {myBet.side.toUpperCase()} — {formatCurrency(myBet.amount)}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">
                      Win: {formatCurrency(
                        myBet.side === 'tie'
                          ? myBet.amount * 8
                          : Math.floor(myBet.amount * 1.95)
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Chip selector */}
                    <div className="mb-3">
                      <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Select Amount</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {BET_CHIPS.map((chip) => (
                          <button key={chip} onClick={() => setBetAmount(chip)}
                            className={`flex-1 min-w-[50px] py-2 rounded-lg text-xs font-bold transition-all border
                              ${betAmount === chip
                                ? 'bg-yellow-500 border-yellow-400 text-gray-900 scale-105 shadow-md shadow-yellow-500/30'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                            ₹{chip >= 1000 ? `${chip / 1000}K` : chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bet buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Dragon */}
                      <button onClick={() => handleBet('dragon')} disabled={placing || !user}
                        className="bg-gradient-to-b from-orange-600 to-orange-800 border border-orange-500/50
                          text-white font-black py-4 md:py-5 rounded-xl hover:from-orange-500 hover:to-orange-700
                          disabled:opacity-40 transition-all active:scale-95 hover:shadow-lg hover:shadow-orange-500/30">
                        {placing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                          <div>
                            <div className="text-lg mb-0.5">🐉</div>
                            <div className="text-xs md:text-sm mb-0.5">DRAGON</div>
                            <div className="text-orange-200 text-[10px]">
                              ₹{betAmount} → ₹{Math.floor(betAmount * 1.95)}
                            </div>
                          </div>
                        )}
                      </button>

                      {/* Tie */}
                      <button onClick={() => handleBet('tie')} disabled={placing || !user}
                        className="bg-gradient-to-b from-amber-600 to-amber-800 border border-amber-500/50
                          text-white font-black py-4 md:py-5 rounded-xl hover:from-amber-500 hover:to-amber-700
                          disabled:opacity-40 transition-all active:scale-95 hover:shadow-lg hover:shadow-amber-500/30">
                        {placing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                          <div>
                            <div className="text-lg mb-0.5">🤝</div>
                            <div className="text-xs md:text-sm mb-0.5">TIE</div>
                            <div className="text-amber-200 text-[10px]">
                              ₹{betAmount} → ₹{betAmount * 8}
                            </div>
                          </div>
                        )}
                      </button>

                      {/* Tiger */}
                      <button onClick={() => handleBet('tiger')} disabled={placing || !user}
                        className="bg-gradient-to-b from-rose-600 to-rose-800 border border-rose-500/50
                          text-white font-black py-4 md:py-5 rounded-xl hover:from-rose-500 hover:to-rose-700
                          disabled:opacity-40 transition-all active:scale-95 hover:shadow-lg hover:shadow-rose-500/30">
                        {placing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                          <div>
                            <div className="text-lg mb-0.5">🐅</div>
                            <div className="text-xs md:text-sm mb-0.5">TIGER</div>
                            <div className="text-rose-200 text-[10px]">
                              ₹{betAmount} → ₹{Math.floor(betAmount * 1.95)}
                            </div>
                          </div>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── SIDEBAR ── */}
          <div className="lg:w-60 xl:w-64 flex flex-col gap-3">

            {/* Live bets */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-3">
              <h3 className="font-bold text-white flex items-center gap-2 mb-3 text-sm">
                <Users className="w-4 h-4 text-emerald-400" />
                Live Bets
                <span className="ml-auto text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">
                  {game?.bets?.length ?? 0}
                </span>
              </h3>

              {/* Side totals */}
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <div className="bg-orange-900/20 border border-orange-800/30 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-orange-400 font-bold">DRAGON</p>
                  <p className="text-xs font-black text-white">₹{dragonTotal}</p>
                </div>
                <div className="bg-amber-900/20 border border-amber-800/30 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-amber-400 font-bold">TIE</p>
                  <p className="text-xs font-black text-white">₹{tieTotal}</p>
                </div>
                <div className="bg-rose-900/20 border border-rose-800/30 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-rose-400 font-bold">TIGER</p>
                  <p className="text-xs font-black text-white">₹{tigerTotal}</p>
                </div>
              </div>

              {/* Bet list */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {!(game?.bets?.length) ? (
                  <div className="text-center py-3 text-gray-600 text-xs">No bets yet</div>
                ) : (
                  game!.bets.map((bet: DTBet, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2.5 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                          ${bet.side === 'dragon' ? 'bg-orange-500' :
                            bet.side === 'tiger'  ? 'bg-rose-500'  : 'bg-amber-500'}`} />
                        <span className="text-gray-300 truncate max-w-[60px]">{bet.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold text-[10px]
                          ${bet.side === 'dragon' ? 'text-orange-400' :
                            bet.side === 'tiger'  ? 'text-rose-400'  : 'text-amber-400'}`}>
                          {bet.side === 'dragon' ? 'D' : bet.side === 'tiger' ? 'T' : 'TIE'}
                        </span>
                        <span className="text-yellow-400 font-bold">₹{bet.amount}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* History */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-3">
              <h3 className="font-bold text-white flex items-center gap-2 mb-3 text-sm">
                <History className="w-4 h-4 text-yellow-400" />
                History
              </h3>
              {!history.length ? (
                <div className="text-center py-3 text-gray-600 text-xs">No rounds yet</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h, i) => (
                    <span key={i} className={`text-xs font-black w-7 h-7 flex items-center
                      justify-center rounded-full border
                      ${h.winner === 'dragon'
                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/25'
                        : h.winner === 'tiger'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}`}>
                      {h.winner === 'dragon' ? 'D' : h.winner === 'tiger' ? 'T' : '='}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Payout info */}
            <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-3">
              <h3 className="font-bold text-white text-sm mb-2">Payouts</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-orange-400 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500" /> Dragon
                  </span>
                  <span className="text-emerald-400 font-black">1.95×</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-rose-400 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-rose-500" /> Tiger
                  </span>
                  <span className="text-emerald-400 font-black">1.95×</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-amber-400 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" /> Tie
                  </span>
                  <span className="text-emerald-400 font-black">8×</span>
                </div>
                <div className="border-t border-gray-800 pt-2 text-gray-600 text-xs">
                  Tie: Dragon/Tiger bets get 50% back
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default DragonTigerPage;
