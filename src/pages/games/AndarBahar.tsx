// src/pages/games/AndarBahar.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeLatestAndarBahar,
  createAndarBaharRound,
  placeAndarBaharBet,
  dealAndarBahar,
} from '../../firebase/andarBahar';
import type { AndarBaharGame, ABBet } from '../../types';
import CardDisplay from '../../components/games/CardDisplay';
import GameTimer from '../../components/games/GameTimer';
import { formatCurrency, calculateUsableBalance } from '../../utils/helpers';
import {
  Users, History, Loader2, AlertCircle,
  CheckCircle, Coins, RefreshCw,
} from 'lucide-react';

const BET_CHIPS      = [10, 50, 100, 500, 1000];
const NEXT_ROUND_DELAY = 8_000; // 8 seconds after result

interface HistoryEntry {
  winner:      'andar' | 'bahar';
  roundNumber: number;
}

const AndarBaharPage: React.FC = () => {
  const { user, wallet } = useAuth();

  const [gameId,      setGameId]      = useState<string | null>(null);
  const [game,        setGame]        = useState<AndarBaharGame | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [betAmount,   setBetAmount]   = useState(50);
  const [placing,     setPlacing]     = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [history,     setHistory]     = useState<HistoryEntry[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState<number | null>(null);

  // Refs — no state, just coordination flags
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

  // ── Start next round ────────────────────────────────────────────────────────
  const startNextRound = useCallback(async () => {
    clearTimers();
    resultHandled.current = null;
    setNextRoundIn(null);
    setGame(null);
    try {
      await createAndarBaharRound();
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

    const unsub = subscribeLatestAndarBahar(async (id, data) => {
      // New game aaya
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

    // Agar 2s mein koi game nahi mila toh naya banao
    const initTimer = setTimeout(async () => {
      if (!currentGameId.current) {
        try { await createAndarBaharRound(); } catch { /* ignore */ }
      }
    }, 2000);

    return () => {
      unsub();
      clearTimers();
      clearTimeout(initTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer expire → deal karo ────────────────────────────────────────────────
  // isDealing check NAHI hai — transaction handle karega
  // Multiple clients call kar sakte hain — sirf ek claim karega
  const handleTimerExpire = useCallback(async () => {
    if (!gameId) return;
    try {
      await dealAndarBahar(gameId);
    } catch (e: any) {
      if (e.message !== 'already-dealing' && e.message !== 'already-done') {
        showToast(e.message || 'Deal failed', 'error');
      }
    }
  }, [gameId, showToast]);

  // ── Place bet ───────────────────────────────────────────────────────────────
  const handleBet = async (side: 'andar' | 'bahar') => {
    if (!user || !gameId)           { showToast('Please login', 'error');         return; }
    if (!wallet)                    { showToast('Wallet not loaded', 'error');     return; }
    if (game?.status !== 'betting') { showToast('Betting is closed', 'error');    return; }
    if (myBet)                      { showToast('Already placed a bet', 'error'); return; }
    if (calculateUsableBalance(wallet) < betAmount) {
      showToast('Insufficient balance', 'error'); return;
    }

    setPlacing(true);
    try {
      await placeAndarBaharBet(gameId, user.uid, user.name || 'Player', betAmount, side);
      showToast(`✅ ₹${betAmount} on ${side === 'andar' ? 'ANDAR 🔵' : 'BAHAR 🔴'}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Bet failed', 'error');
    } finally {
      setPlacing(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const myBet         = game?.bets?.find((b) => b.uid === user?.uid);
  const usableBalance = wallet ? calculateUsableBalance(wallet) : 0;
  const andarTotal    = game?.bets?.filter((b) => b.side === 'andar').reduce((s, b) => s + b.amount, 0) ?? 0;
  const baharTotal    = game?.bets?.filter((b) => b.side === 'bahar').reduce((s, b) => s + b.amount, 0) ?? 0;

  const getTimerDate = (val: any): Date => {
    if (!val)          return new Date(Date.now() + 20_000);
    if (val?.toDate)   return val.toDate();
    if (val?.seconds)  return new Date(val.seconds * 1000);
    return new Date(val);
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading Andar Bahar...</p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-lg md:text-xl font-black text-white">🃏 Andar Bahar</h1>
            <p className="text-gray-500 text-xs hidden sm:block">Real-time multiplayer card game</p>
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
                  {game?.status === 'dealing' && <span className="text-amber-400">🃏 Dealing Cards...</span>}
                  {game?.status === 'result'  && (
                    <span className={game.winner === 'andar' ? 'text-blue-400' : 'text-rose-400'}>
                      🏆 {game.winner?.toUpperCase()} Wins!
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
                    <span className="text-xs">Dealing</span>
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950
              border border-emerald-800/30 rounded-2xl p-3 md:p-5 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />

              {/* Joker */}
              <div className="text-center mb-4 relative">
                <p className="text-emerald-400/50 text-xs uppercase tracking-widest mb-2 font-semibold">✦ Joker Card ✦</p>
                <div className="flex justify-center">
                  {game?.jokerCard ? (
                    <div className="relative">
                      <div className="absolute -inset-2 bg-yellow-400/20 rounded-2xl blur-xl animate-pulse" />
                      <CardDisplay card={game.jokerCard} size="lg" animate />
                    </div>
                  ) : (
                    <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 border-dashed
                      border-emerald-600/30 flex items-center justify-center bg-emerald-900/10">
                      <span className="text-emerald-600/30 text-2xl font-black">?</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Andar | Bahar cards */}
              <div className="grid grid-cols-2 gap-2 md:gap-3">

                {/* ANDAR */}
                <div className={`rounded-xl p-2.5 md:p-3 border-2 transition-all duration-500
                  relative overflow-hidden min-h-[90px] md:min-h-[110px]
                  ${game?.winner === 'andar'
                    ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20'
                    : myBet?.side === 'andar'
                    ? 'border-blue-500/60 bg-blue-900/15'
                    : 'border-blue-900/30 bg-black/15'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="font-black text-sm md:text-base text-blue-400">ANDAR</span>
                    </div>
                    {andarTotal > 0 && (
                      <span className="text-xs text-blue-400 font-bold">₹{andarTotal}</span>
                    )}
                  </div>
                  {myBet?.side === 'andar' && (
                    <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30
                      rounded-full px-2 py-0.5 mb-2 inline-block">
                      Your Bet ₹{myBet.amount}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1 min-h-[36px]">
                    {game?.andarCards?.map((card, i) => (
                      <CardDisplay key={i} card={card} size="xs" animate delay={i * 100} />
                    ))}
                    {game?.status === 'dealing' && (
                      <div className="w-8 rounded bg-blue-500/10 border border-blue-500/20 animate-pulse"
                        style={{ height: '44px' }} />
                    )}
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">{game?.andarCards?.length || 0} cards</p>
                </div>

                {/* BAHAR */}
                <div className={`rounded-xl p-2.5 md:p-3 border-2 transition-all duration-500
                  relative overflow-hidden min-h-[90px] md:min-h-[110px]
                  ${game?.winner === 'bahar'
                    ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20'
                    : myBet?.side === 'bahar'
                    ? 'border-rose-500/60 bg-rose-900/15'
                    : 'border-rose-900/30 bg-black/15'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                      <span className="font-black text-sm md:text-base text-rose-400">BAHAR</span>
                    </div>
                    {baharTotal > 0 && (
                      <span className="text-xs text-rose-400 font-bold">₹{baharTotal}</span>
                    )}
                  </div>
                  {myBet?.side === 'bahar' && (
                    <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30
                      rounded-full px-2 py-0.5 mb-2 inline-block">
                      Your Bet ₹{myBet.amount}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1 min-h-[36px]">
                    {game?.baharCards?.map((card, i) => (
                      <CardDisplay key={i} card={card} size="xs" animate delay={i * 100} />
                    ))}
                    {game?.status === 'dealing' && (
                      <div className="w-8 rounded bg-rose-500/10 border border-rose-500/20 animate-pulse"
                        style={{ height: '44px' }} />
                    )}
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">{game?.baharCards?.length || 0} cards</p>
                </div>
              </div>

              {/* Pot */}
              {(game?.pot ?? 0) > 0 && (
                <div className="mt-3 text-center">
                  <span className="text-xs text-emerald-500/50 uppercase tracking-wider">Pot • </span>
                  <span className="text-yellow-400 font-black text-base">{formatCurrency(game?.pot ?? 0)}</span>
                </div>
              )}
            </div>

            {/* Result banner */}
            {game?.status === 'result' && myBet && (
              <div className={`rounded-xl p-4 border-2 text-center
                ${myBet.side === game.winner
                  ? 'bg-emerald-900/40 border-emerald-500/50'
                  : 'bg-red-900/40 border-red-500/50'}`}>
                {myBet.side === game.winner ? (
                  <>
                    <p className="text-2xl mb-1">🎉</p>
                    <p className="text-emerald-400 font-black text-lg">You Won!</p>
                    <p className="text-emerald-300 font-bold">+{formatCurrency(Math.floor(myBet.amount * 1.9))}</p>
                    <p className="text-gray-500 text-xs mt-1">Added to winning balance</p>
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
                      ${myBet.side === 'andar'
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                        : 'bg-rose-500/10 border-rose-500/40 text-rose-400'}`}>
                      <div className={`w-3 h-3 rounded-full ${myBet.side === 'andar' ? 'bg-blue-500' : 'bg-rose-500'}`} />
                      {myBet.side.toUpperCase()} — {formatCurrency(myBet.amount)}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">
                      Win: {formatCurrency(Math.floor(myBet.amount * 1.9))}
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
                    <div className="grid grid-cols-2 gap-2.5">
                      <button onClick={() => handleBet('andar')} disabled={placing || !user}
                        className="bg-gradient-to-b from-blue-600 to-blue-800 border border-blue-500/50
                          text-white font-black py-4 md:py-5 rounded-xl hover:from-blue-500 hover:to-blue-700
                          disabled:opacity-40 transition-all active:scale-95 hover:shadow-lg hover:shadow-blue-500/30">
                        {placing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                          <div>
                            <div className="w-3.5 h-3.5 rounded-full bg-blue-300 mx-auto mb-1.5" />
                            <div className="text-sm md:text-base mb-0.5">ANDAR</div>
                            <div className="text-blue-200 text-xs">
                              ₹{betAmount} → ₹{Math.floor(betAmount * 1.9)}
                            </div>
                          </div>
                        )}
                      </button>

                      <button onClick={() => handleBet('bahar')} disabled={placing || !user}
                        className="bg-gradient-to-b from-rose-600 to-rose-800 border border-rose-500/50
                          text-white font-black py-4 md:py-5 rounded-xl hover:from-rose-500 hover:to-rose-700
                          disabled:opacity-40 transition-all active:scale-95 hover:shadow-lg hover:shadow-rose-500/30">
                        {placing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                          <div>
                            <div className="w-3.5 h-3.5 rounded-full bg-rose-300 mx-auto mb-1.5" />
                            <div className="text-sm md:text-base mb-0.5">BAHAR</div>
                            <div className="text-rose-200 text-xs">
                              ₹{betAmount} → ₹{Math.floor(betAmount * 1.9)}
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
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-2 text-center">
                  <p className="text-xs text-blue-400 font-bold">ANDAR</p>
                  <p className="text-sm font-black text-white">₹{andarTotal}</p>
                </div>
                <div className="bg-rose-900/20 border border-rose-800/30 rounded-lg p-2 text-center">
                  <p className="text-xs text-rose-400 font-bold">BAHAR</p>
                  <p className="text-sm font-black text-white">₹{baharTotal}</p>
                </div>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {!(game?.bets?.length) ? (
                  <div className="text-center py-3 text-gray-600 text-xs">No bets yet</div>
                ) : (
                  game!.bets.map((bet: ABBet, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2.5 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                          ${bet.side === 'andar' ? 'bg-blue-500' : 'bg-rose-500'}`} />
                        <span className="text-gray-300 truncate max-w-[65px]">{bet.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold ${bet.side === 'andar' ? 'text-blue-400' : 'text-rose-400'}`}>
                          {bet.side === 'andar' ? 'A' : 'B'}
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
                      ${h.winner === 'andar'
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/25'}`}>
                      {h.winner === 'andar' ? 'A' : 'B'}
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
                  <span className="text-blue-400 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" /> Andar
                  </span>
                  <span className="text-emerald-400 font-black">1.9×</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-rose-400 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-rose-500" /> Bahar
                  </span>
                  <span className="text-emerald-400 font-black">1.9×</span>
                </div>
                <div className="border-t border-gray-800 pt-2 text-gray-600 text-xs">
                  First card always to Bahar
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AndarBaharPage;
