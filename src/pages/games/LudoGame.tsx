import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeTable, rollDice, endMatch, leaveTable } from '../../firebase/ludo';
import { LudoTable } from '../../types';
import { MATCH_DURATION } from '../../utils/ludoHelpers';
import { Clock, LogOut, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const diceFaces: Record<number, string> = {
  1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
};

const LudoGame: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [table, setTable] = useState<LudoTable | null>(null);
  const [rolling, setRolling] = useState(false);
  const [animDice, setAnimDice] = useState(1);
  const [lastDice, setLastDice] = useState(0);   // sirf display ke liye
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);

  // ── Subscribe table ──────────────────────────────────
  useEffect(() => {
    if (!tableId) return;
    const unsub = subscribeTable(tableId, data => {
      setTable(data);
      if (data.matchEnded) endedRef.current = true;
    });
    return () => unsub();
  }, [tableId]);

  // ── Timer ────────────────────────────────────────────
  useEffect(() => {
    if (!table?.matchStarted || table.matchEnded) return;
    if (!table.timerStartedAt) return;

    const startMs = table.timerStartedAt.toMillis?.() || Date.now();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const remaining = Math.max(MATCH_DURATION - elapsed, 0);
      setTimeLeft(remaining);
      if (remaining === 0 && !endedRef.current && tableId) {
        endedRef.current = true;
        endMatch(tableId);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [table?.matchStarted, table?.timerStartedAt, table?.matchEnded]);

  const me = table?.players.find(p => p.uid === user?.uid);
  const opponent = table?.players.find(p => p.uid !== user?.uid);
  const isMyTurn = table?.gameState.activePlayer === user?.uid;
  const consecSixes = table?.gameState.consecutiveSixes ?? 0;

  // ── Roll handler ─────────────────────────────────────
  const handleRoll = async () => {
    if (!tableId || !user || !isMyTurn || rolling) return;
    setRolling(true);
    setLastDice(0);

    // Animation
    let count = 0;
    const anim = setInterval(() => {
      setAnimDice(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 12) clearInterval(anim);
    }, 70);

    try {
      await rollDice(tableId, user.uid);
      // lastDice show karne ke liye table update ka wait karo
      // table subscription se automatically update hoga
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimeout(() => {
        setRolling(false);
      }, 950);
    }
  };

  const handleLeave = async () => {
    if (!tableId || !user) return;
    await leaveTable(tableId, user.uid);
    navigate('/games/ludo');
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!table) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-md mx-auto px-4 py-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={handleLeave}
            className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 text-sm transition-colors">
            <LogOut className="w-4 h-4" /> Leave
          </button>

          {/* Timer */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-black text-lg
            ${timeLeft <= 30
              ? 'border-red-500 text-red-400 bg-red-500/10 animate-pulse'
              : 'border-gray-700 text-white bg-gray-900'}`}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>

          <div className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded-lg border border-gray-800">
            Table {table.tableNumber}
          </div>
        </div>

        {/* ── Pot ── */}
        <div className="text-center mb-5">
          <p className="text-xs text-gray-500 mb-0.5">Prize Pool</p>
          <p className="text-2xl font-black text-yellow-400">₹{Math.floor(table.pot * 1.9)}</p>
        </div>

        {/* ── Score Cards ── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[me, opponent].map((p, i) => p ? (
            <div key={p.uid}
              className={`bg-gray-900 border rounded-2xl p-4 transition-all
                ${table.gameState.activePlayer === p.uid
                  ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                  : 'border-gray-800'}`}>

              {/* Player name + color */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0
                  ${p.color === 'red' ? 'bg-red-500' : 'bg-green-500'}`} />
                <span className="text-sm font-bold truncate">
                  {p.uid === user?.uid ? 'You' : p.name}
                </span>
              </div>

              {/* Score */}
              <p className="text-4xl font-black text-yellow-400 leading-none mb-1">
                {p.score}
              </p>
              <p className="text-xs text-gray-500">points</p>

              {/* Turn badge */}
              {table.gameState.activePlayer === p.uid && table.matchStarted && !table.matchEnded && (
                <div className="mt-2 inline-flex items-center gap-1 bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                  Rolling...
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-center min-h-[100px]">
              <p className="text-gray-600 text-sm">Waiting...</p>
            </div>
          ))}
        </div>

        {/* ── Waiting Screen ── */}
        {!table.matchStarted && (
          <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mx-auto mb-4" />
            <p className="text-yellow-400 font-bold text-lg">Waiting for opponent...</p>
            <p className="text-gray-500 text-xs mt-2">Dusre player ka wait karo</p>
          </div>
        )}

        {/* ── Dice Area ── */}
        {table.matchStarted && !table.matchEnded && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">

            {/* Consecutive sixes warning */}
            {consecSixes > 0 && isMyTurn && (
              <div className={`mb-3 text-xs font-bold px-3 py-1.5 rounded-full inline-block
                ${consecSixes === 2
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                {consecSixes === 1 ? '⚠️ 1 Six — ek aur mila to turn jayega!' : '🚨 2 Sixes — agla six = turn switch + no points!'}
              </div>
            )}

            {/* Dice face */}
            <div className={`text-8xl mb-4 transition-all select-none
              ${rolling ? 'animate-bounce' : 'drop-shadow-lg'}`}>
              {rolling ? diceFaces[animDice] : '🎲'}
            </div>

            {/* Turn label */}
            <p className="text-sm text-gray-400 mb-4">
              {isMyTurn
                ? <span className="text-yellow-400 font-bold">✅ Aapki baari!</span>
                : <span className="text-gray-500">⏳ {opponent?.name ?? 'Opponent'} ki baari...</span>
              }
            </p>

            {/* Roll button */}
            <button
              onClick={handleRoll}
              disabled={!isMyTurn || rolling}
              className={`w-full py-4 rounded-xl font-black text-lg transition-all
                ${isMyTurn && !rolling
                  ? 'bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black shadow-lg shadow-yellow-500/30'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}>
              {rolling
                ? '🎲 Rolling...'
                : isMyTurn
                  ? '🎲 Roll Karo!'
                  : `⏳ ${opponent?.name ?? 'Opponent'} Roll kar raha hai...`}
            </button>

            {/* Score difference hint */}
            {me && opponent && (
              <p className="text-xs text-gray-600 mt-3">
                {me.score > opponent.score
                  ? `+${me.score - opponent.score} aage ho`
                  : me.score < opponent.score
                    ? `${opponent.score - me.score} peeche ho`
                    : 'Barabar ho — karo blast!'}
              </p>
            )}
          </div>
        )}

        {/* ── Winner Screen ── */}
        {table.matchEnded && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-yellow-500/50 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="text-6xl mb-4">
                {table.winnerId === user?.uid ? '🏆' : table.winnerId ? '😔' : '🤝'}
              </div>

              <h2 className={`text-3xl font-black mb-1
                ${table.winnerId === user?.uid
                  ? 'text-yellow-400'
                  : table.winnerId ? 'text-red-400' : 'text-gray-400'}`}>
                {table.winnerId === user?.uid
                  ? 'Jeet Gaye!'
                  : table.winnerId
                    ? `${table.winnerName} Jeeta!`
                    : 'Draw!'}
              </h2>

              {table.winnerId === user?.uid && (
                <p className="text-green-400 text-sm font-bold mb-4">
                  +₹{Math.floor(table.pot * 1.9)} added to wallet
                </p>
              )}

              {/* Final scores */}
              <div className="space-y-2 mb-6 mt-4">
                {table.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map(p => (
                    <div key={p.uid}
                      className={`flex justify-between rounded-xl px-4 py-3
                        ${p.uid === table.winnerId
                          ? 'bg-yellow-500/10 border border-yellow-500/30'
                          : 'bg-gray-800'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${p.color === 'red' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <span className="text-gray-300 text-sm">
                          {p.uid === user?.uid ? 'You' : p.name}
                        </span>
                        {p.uid === table.winnerId && <span className="text-xs">👑</span>}
                      </div>
                      <span className="text-yellow-400 font-black">{p.score} pts</span>
                    </div>
                  ))}
              </div>

              <button
                onClick={() => navigate('/games/ludo')}
                className="w-full bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-black py-3 rounded-xl transition-all">
                Lobby Mein Jao
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default LudoGame;
