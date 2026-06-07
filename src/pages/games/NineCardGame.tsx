// ============================================================
// NineCardGame.tsx — Complete Rewrite with All Fixes
// ============================================================

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  subscribeTable,
  seeCards,
  callBet,
  raiseBet,
  packHand,
  showHands,
  leaveTable,
  resetTable,
  autoStartGame,
  autoCallBet,
  getCardById,
  type NineCardTable,
  type NineCardPlayer,
  type Card,
} from "../../firebase/NineCard";

// ─── Constants ───────────────────────────────────
const AUTO_CALL_SECONDS = 15;
const RED_SUITS = new Set(["♥", "♦"]);

// ─── Card Visual ─────────────────────────────────
interface CardFaceProps {
  card: Card;
  animate?: boolean;
  size?: "sm" | "md" | "lg";
}
function CardFace({ card, animate = false, size = "md" }: CardFaceProps) {
  const isRed = RED_SUITS.has(card.suit);
  const sizeClass =
    size === "sm" ? "w-10 h-14 text-base"
    : size === "lg" ? "w-20 h-28 text-2xl"
    : "w-14 h-20 text-lg";

  return (
    <div
      className={`
        ${sizeClass} relative rounded-xl flex flex-col items-center justify-center
        bg-white shadow-xl border-2 border-gray-100
        ${animate ? "animate-[dealCard_0.35s_ease-out_both]" : ""}
        select-none shrink-0
      `}
      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
    >
      <span className={`font-black leading-none ${isRed ? "text-red-600" : "text-gray-900"}`}>
        {card.rank}
      </span>
      <span className={`text-sm ${isRed ? "text-red-500" : "text-gray-800"}`}>
        {card.suit}
      </span>
    </div>
  );
}

function CardBack({ size = "md", animate = false }: { size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const sizeClass =
    size === "sm" ? "w-10 h-14"
    : size === "lg" ? "w-20 h-28"
    : "w-14 h-20";

  return (
    <div
      className={`${sizeClass} rounded-xl shrink-0 overflow-hidden relative ${animate ? "animate-[dealCard_0.35s_ease-out_both]" : ""}`}
      style={{
        background: "linear-gradient(135deg, #1a472a 0%, #0d3320 50%, #1a472a 100%)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)",
        border: "2px solid #2d6a4f",
      }}
    >
      <div className="absolute inset-1 rounded-lg" style={{
        background: `repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.04) 4px,rgba(255,255,255,0.04) 8px)`,
        border: "1px solid rgba(255,255,255,0.08)",
      }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-emerald-600/40 text-lg font-bold select-none">9C</span>
      </div>
    </div>
  );
}

// ─── Turn Timer Ring ──────────────────────────────
interface TurnTimerProps {
  turnStartedAt: any; // Firestore Timestamp
  totalSeconds: number;
  size?: number;
}
function TurnTimer({ turnStartedAt, totalSeconds, size = 48 }: TurnTimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    if (!turnStartedAt) return;

    // Calculate elapsed since turn started
    const startMs = turnStartedAt?.toMillis?.() || Date.now();

    const tick = () => {
      const elapsed = (Date.now() - startMs) / 1000;
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(Math.ceil(left));
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [turnStartedAt, totalSeconds]);

  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = remaining / totalSeconds;
  const dashOffset = circumference * (1 - progress);

  const color =
    remaining > 10 ? "#10b981" : remaining > 5 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size} height={size}
        className="-rotate-90 absolute"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.5s" }}
        />
      </svg>
      <span className="text-white font-black text-sm z-10">{remaining}</span>
    </div>
  );
}

// ─── Player Seat ─────────────────────────────────
interface SeatProps {
  player: NineCardPlayer | null;
  isMe: boolean;
  isCurrentTurn: boolean;
  showCards: boolean;
  position: "bottom" | "top" | "left" | "right";
  turnStartedAt?: any;
}
function Seat({ player, isMe, isCurrentTurn, showCards, position, turnStartedAt }: SeatProps) {
  const isVertical = position === "bottom" || position === "top";

  if (!player) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-700/60 flex items-center justify-center text-gray-600 text-lg">+</div>
        <p className="text-xs text-gray-600">Waiting…</p>
      </div>
    );
  }

  const statusColor = {
    waiting: "bg-gray-600",
    blind: "bg-yellow-600",
    seen: "bg-blue-600",
    packed: "bg-red-700",
    show: "bg-purple-600",
  }[player.status] || "bg-gray-600";

  const statusLabel = {
    waiting: "Waiting",
    blind: "BLIND",
    seen: "SEEN",
    packed: "PACKED",
    show: "SHOW",
  }[player.status] || player.status.toUpperCase();

  // ✅ Show cards when: player has seen, or showdown (finished), or show status
  const shouldShowCards =
    showCards ||
    player.status === "show" ||
    (isMe && player.seenCards);

  return (
    <div className={`flex ${isVertical ? "flex-col" : "flex-row"} items-center gap-2`}>
      <div className="flex gap-1.5">
        {player.cardIds.length > 0 ? (
          player.cardIds.map((id, i) =>
            shouldShowCards ? (
              <CardFace key={id} card={getCardById(id)} size="md" animate />
            ) : (
              <CardBack key={i} size="md" animate />
            )
          )
        ) : (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="w-14 h-20 rounded-xl border-2 border-dashed border-gray-700/40" />
          ))
        )}
      </div>

      <div className={`flex flex-col items-center gap-1 ${!isVertical ? "ml-2" : ""}`}>
        {/* Avatar with optional timer ring */}
        <div className="relative">
          {isCurrentTurn && turnStartedAt ? (
            <TurnTimer
              turnStartedAt={turnStartedAt}
              totalSeconds={AUTO_CALL_SECONDS}
              size={48}
            />
          ) : (
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
              ${isMe ? "bg-emerald-700 ring-2 ring-emerald-400" : "bg-gray-700 ring-2 ring-gray-600"}
              ${isCurrentTurn ? "ring-2 ring-yellow-400" : ""}
            `}>
              {player.photoURL ? (
                <img src={player.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                player.displayName.charAt(0).toUpperCase()
              )}
            </div>
          )}
          {isCurrentTurn && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-400 rounded-full animate-pulse z-20" />
          )}
        </div>

        <p className="text-xs font-semibold text-white leading-none max-w-[72px] truncate">
          {isMe ? "You" : player.displayName}
        </p>

        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${statusColor}`}>
          {statusLabel}
        </span>

        {player.currentBet > 0 && (
          <p className="text-[10px] text-yellow-400 font-medium">₹{player.currentBet}</p>
        )}
      </div>
    </div>
  );
}

// ─── Pot Display ─────────────────────────────────
function PotDisplay({ pot, callAmount }: { pot: number; callAmount: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="bg-black/40 backdrop-blur rounded-xl px-5 py-2.5 text-center border border-yellow-700/40">
        <p className="text-[10px] text-yellow-600 uppercase tracking-widest font-medium">Pot</p>
        <p className="text-yellow-300 font-black text-xl leading-none">₹{pot}</p>
      </div>
      {callAmount > 0 && (
        <p className="text-[10px] text-gray-500">Call: ₹{callAmount}</p>
      )}
    </div>
  );
}

// ─── Raise Modal ──────────────────────────────────
interface RaiseModalProps {
  isBlind: boolean;
  currentCallAmount: number;
  bootAmount: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  loading: boolean;
}
function RaiseModal({
  isBlind,
  currentCallAmount,
  bootAmount,
  onConfirm,
  onCancel,
  loading,
}: RaiseModalProps) {
  // Blind can raise at 1x, seen must raise at 2x minimum
  const minRaise = isBlind ? currentCallAmount : currentCallAmount * 2;
  const [amount, setAmount] = useState(minRaise);

  const presets = [
    minRaise,
    minRaise * 2,
    minRaise * 3,
    minRaise * 5,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-6">
      <div className="w-full max-w-sm bg-[#0c1810] border border-emerald-800/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">Raise Bet</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>

        <p className="text-xs text-gray-400">
          {isBlind ? "Blind raise — minimum" : "Seen raise — minimum 2x"} ₹{minRaise}
        </p>

        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`py-2 rounded-lg text-xs font-bold transition border ${
                amount === p
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-[#162218] border-emerald-900/40 text-gray-400 hover:border-emerald-700"
              }`}
            >
              ₹{p}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Custom Amount</label>
          <input
            type="number"
            min={minRaise}
            step={bootAmount}
            value={amount}
            onChange={(e) => setAmount(Math.max(minRaise, Number(e.target.value)))}
            className="w-full bg-[#162218] border border-emerald-900/60 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            disabled={loading || amount < minRaise}
            className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm transition disabled:opacity-50"
          >
            {loading ? "Raising…" : `Raise ₹${amount}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action Bar ───────────────────────────────────
interface ActionBarProps {
  player: NineCardPlayer;
  callAmount: number;
  bootAmount: number;
  onCall: () => void;
  onPack: () => void;
  onSee: () => void;
  onShow: () => void;
  onRaise: () => void;
  canShow: boolean;
  loading: boolean;
  // Timer
  turnStartedAt: any;
}
function ActionBar({
  player,
  callAmount,
  bootAmount,
  onCall,
  onPack,
  onSee,
  onShow,
  onRaise,
  canShow,
  loading,
  turnStartedAt,
}: ActionBarProps) {
  const isBlind = !player.seenCards;
  const [timerLeft, setTimerLeft] = useState(AUTO_CALL_SECONDS);

  // Countdown for action bar
  useEffect(() => {
    if (!turnStartedAt) return;
    const startMs = turnStartedAt?.toMillis?.() || Date.now();
    const tick = () => {
      const elapsed = (Date.now() - startMs) / 1000;
      setTimerLeft(Math.max(0, AUTO_CALL_SECONDS - elapsed));
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [turnStartedAt]);

  const isUrgent = timerLeft <= 5;

  return (
    <div className="space-y-3">
      {/* Timer bar */}
      {turnStartedAt && (
        <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${
              isUrgent ? "bg-red-500" : timerLeft <= 10 ? "bg-yellow-500" : "bg-emerald-500"
            }`}
            style={{
              width: `${(timerLeft / AUTO_CALL_SECONDS) * 100}%`,
              transition: "width 0.2s linear",
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {isBlind && (
          <button
            onClick={onSee}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm transition disabled:opacity-40 border border-blue-600"
          >
            See Cards
          </button>
        )}

        <button
          onClick={onCall}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition disabled:opacity-40 border border-emerald-600"
        >
          Call ₹{callAmount}
        </button>

        {/* ✅ NEW: Raise button */}
        <button
          onClick={onRaise}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white font-bold text-sm transition disabled:opacity-40 border border-orange-600"
        >
          Raise
        </button>

        {canShow && !isBlind && (
          <button
            onClick={onShow}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm transition disabled:opacity-40 border border-purple-600"
          >
            Show
          </button>
        )}

        <button
          onClick={onPack}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-red-800 hover:bg-red-700 text-white font-bold text-sm transition disabled:opacity-40 border border-red-700"
        >
          Pack
        </button>
      </div>
    </div>
  );
}

// ─── Winner Overlay ───────────────────────────────
interface WinnerOverlayProps {
  table: NineCardTable;
  myUid: string;
  onPlayAgain: () => void;
  onLeave: () => void;
  isAdmin: boolean;
}
function WinnerOverlay({ table, myUid, onPlayAgain, onLeave, isAdmin }: WinnerOverlayProps) {
  const iWon = table.winnerId === myUid;
  const isDraw = table.isDraw;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#0c1810] border border-emerald-800/50 rounded-2xl overflow-hidden shadow-2xl">
        <div className={`py-6 text-center ${
          isDraw ? "bg-gradient-to-b from-gray-700 to-gray-800"
          : iWon ? "bg-gradient-to-b from-yellow-600/80 to-yellow-800/60"
          : "bg-gradient-to-b from-red-800/60 to-red-900/40"
        }`}>
          <div className="text-5xl mb-2">{isDraw ? "🤝" : iWon ? "🏆" : "💔"}</div>
          <h2 className="text-2xl font-black text-white">
            {isDraw ? "It's a Draw!" : iWon ? "You Won!" : "You Lost"}
          </h2>
          {!isDraw && table.winnerId && (
            <p className="text-sm text-gray-300 mt-1">
              {iWon
                ? `+₹${table.pot}`
                : `${table.players[table.winnerId]?.displayName} wins ₹${table.pot}`}
            </p>
          )}
          {isDraw && (
            <p className="text-sm text-gray-300 mt-1">₹{Math.floor(table.pot / 2)} each</p>
          )}
        </div>

        <div className="p-5 space-y-4">
          {table.winnerReason && (
            <p className="text-center text-xs text-gray-400 italic">"{table.winnerReason}"</p>
          )}

          {/* ✅ FIX: Show ALL players' cards in result */}
          {table.status === "finished" && (
            <div className="space-y-3">
              {table.playerOrder.map((uid) => {
                const p = table.players[uid];
                if (!p) return null;
                const handVal = p.cardIds.length > 0
                  ? (() => {
                      try {
                        const { value, isTie, englishRank } = require("../../firebase/NineCard").computeHandValue(p.cardIds);
                        if (isTie) return `English (rank ${englishRank})`;
                        return `Value: ${value}`;
                      } catch { return ""; }
                    })()
                  : "";

                return (
                  <div key={uid} className="bg-black/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-xs font-bold ${uid === myUid ? "text-emerald-400" : "text-gray-300"}`}>
                        {uid === myUid ? "You" : p.displayName}
                        {table.winnerId === uid && <span className="ml-1 text-yellow-400">👑</span>}
                      </p>
                      <span className="text-[10px] text-gray-500">{handVal}</span>
                    </div>
                    <div className="flex gap-1.5 justify-center">
                      {p.cardIds.length > 0
                        ? p.cardIds.map((id) => (
                            <CardFace key={id} card={getCardById(id)} size="sm" />
                          ))
                        : <p className="text-xs text-gray-600">No cards</p>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onLeave}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition"
            >
              Leave Table
            </button>
            {isAdmin && (
              <button
                onClick={onPlayAgain}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition"
              >
                Play Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────
export default function NineCardGame() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  // ── All hooks at top ──
  const [table, setTable] = useState<NineCardTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const hasLeft = useRef(false);
  const autoStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCallRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myUid = user?.uid || "";

  // Subscribe to table
  useEffect(() => {
    if (!tableId) return;
    const unsub = subscribeTable(tableId, (t) => {
      setTable(t);
      setLoading(false);
    });
    return unsub;
  }, [tableId]);

  // Leave on unmount
  useEffect(() => {
    return () => {
      if (!hasLeft.current && tableId && myUid) {
        hasLeft.current = true;
        leaveTable(tableId, myUid).catch(() => {});
      }
    };
  }, [tableId, myUid]);

  // ── Auto-start countdown ──
  useEffect(() => {
    if (!table || !tableId) return;
    const playerCount = Object.keys(table.players).length;

    if (table.status === "waiting" && playerCount >= table.minPlayers) {
      setCountdown(15);
      let seconds = 15;

      const interval = setInterval(() => {
        seconds -= 1;
        setCountdown(seconds);
        if (seconds <= 0) clearInterval(interval);
      }, 1000);

      autoStartRef.current = setTimeout(async () => {
        try { await autoStartGame(tableId); }
        catch (e: any) { setError(e.message); }
      }, 15000);

      return () => {
        clearInterval(interval);
        if (autoStartRef.current) {
          clearTimeout(autoStartRef.current);
          autoStartRef.current = null;
        }
        setCountdown(null);
      };
    } else {
      setCountdown(null);
      if (autoStartRef.current) {
        clearTimeout(autoStartRef.current);
        autoStartRef.current = null;
      }
    }
  }, [table?.status, table?.playerOrder?.join(","), tableId]);

  // ✅ NEW: Auto-call timer — when it's my turn, call automatically after 15s
  useEffect(() => {
    if (!table || !tableId || !myUid) return;
    if (table.status !== "playing") return;
    if (table.currentTurn !== myUid) return;

    const myPlayer = table.players[myUid];
    if (!myPlayer || myPlayer.status === "packed") return;

    const turnStartedAt = myPlayer.turnStartedAt;
    if (!turnStartedAt) return;

    // Calculate how much time is left
    const startMs = turnStartedAt?.toMillis?.() || Date.now();
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = AUTO_CALL_SECONDS - elapsed;

    if (remaining <= 0) {
      // Already expired — auto-call now
      autoCallBet(tableId, myUid).catch(() => {});
      return;
    }

    // Set timer for remaining time
    autoCallRef.current = setTimeout(async () => {
      try { await autoCallBet(tableId, myUid); }
      catch (e: any) { setError(e.message); }
    }, remaining * 1000);

    return () => {
      if (autoCallRef.current) {
        clearTimeout(autoCallRef.current);
        autoCallRef.current = null;
      }
    };
  }, [
    table?.currentTurn,
    table?.status,
    // ✅ Depend on turnStartedAt to reset timer when turn changes
    table?.players[myUid]?.turnStartedAt,
    tableId,
    myUid,
  ]);

  const myPlayer = useMemo(
    () => (table && myUid ? table.players[myUid] || null : null),
    [table, myUid]
  );

  const opponents = useMemo(() => {
    if (!table) return [];
    return table.playerOrder
      .filter((uid) => uid !== myUid)
      .map((uid) => table.players[uid])
      .filter(Boolean) as NineCardPlayer[];
  }, [table, myUid]);

  const isMyTurn = table?.currentTurn === myUid;
  const isShowdown = table?.status === "finished";
  const isWaiting = table?.status === "waiting" || table?.status === "booting";

  const canShow = useMemo(
    () => isMyTurn && !isWaiting && (myPlayer?.seenCards || false),
    [isMyTurn, isWaiting, myPlayer]
  );

  // ─── Action helpers ────────────────────────────
  async function act(fn: () => Promise<void>) {
    if (!tableId) return;
    setActionLoading(true);
    setError("");
    try { await fn(); }
    catch (e: any) { setError(e.message || "Action failed"); }
    finally { setActionLoading(false); }
  }

  async function handleLeave() {
    if (!tableId) return;
    hasLeft.current = true;
    try { await leaveTable(tableId, myUid); } catch {}
    navigate("/games/ninecard");
  }

  async function handlePlayAgain() {
    if (!tableId) return;
    await act(() => resetTable(tableId));
  }

  async function handleRaiseConfirm(amount: number) {
    if (!tableId) return;
    setShowRaiseModal(false);
    await act(() => raiseBet(tableId, myUid, amount));
  }

  // ── Early returns after all hooks ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#060d09] flex items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading table…</p>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#060d09] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-3">Table not found</p>
          <button onClick={() => navigate("/games/ninecard")} className="text-emerald-400 text-sm hover:underline">
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-[#060d09] text-white"
      style={{ fontFamily: "'Georgia', serif", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, height: "100dvh", overflow: "hidden" }}
    >
      <style>{`
        @keyframes dealCard {
          from { opacity: 0; transform: translateY(-20px) scale(0.85) rotate(-4deg); }
          to   { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }
      `}</style>

      {/* TOP BAR */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-black/50 border-b border-emerald-900/40">
        <div className="flex items-center gap-2">
          <button onClick={handleLeave} className="text-gray-400 hover:text-white text-lg leading-none px-1">←</button>
          <div>
            <p className="text-xs font-bold text-white leading-none">{table.name}</p>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">
              Round {table.round || 1} · Boot ₹{table.bootAmount}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          table.status === "playing" ? "bg-blue-800/70 text-blue-300"
          : table.status === "waiting" ? "bg-emerald-900/70 text-emerald-400"
          : "bg-gray-700/70 text-gray-300"
        }`}>
          {table.status.toUpperCase()}
        </span>
      </div>

      {/* ERROR */}
      {error && (
        <div className="shrink-0 mx-3 mt-1.5 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <p className="text-red-400 text-xs">{error}</p>
          <button onClick={() => setError("")} className="text-red-600 ml-2">×</button>
        </div>
      )}

      {/* POKER TABLE */}
      <div className="flex-1 relative flex flex-col items-center justify-between px-4 py-3 min-h-0">
        {/* Green felt */}
        <div
          className="absolute inset-x-3 inset-y-2 rounded-[2.5rem] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, #1e5c35 0%, #0f3a20 65%, #081a0e 100%)",
            border: "5px solid #2d6a4f",
            boxShadow: "0 0 0 2px #1a3d26, inset 0 2px 40px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.8)",
          }}
        />

        {/* OPPONENT (Top) */}
        <div className="w-full flex justify-center z-10 pt-1">
          {opponents.length > 0 ? (
            opponents.map((opp) => (
              <Seat
                key={opp.uid}
                player={opp}
                isMe={false}
                isCurrentTurn={table.currentTurn === opp.uid}
                showCards={isShowdown || opp.status === "show"}
                position="top"
                turnStartedAt={
                  table.currentTurn === opp.uid ? opp.turnStartedAt : null
                }
              />
            ))
          ) : (
            <Seat player={null} isMe={false} isCurrentTurn={false} showCards={false} position="top" />
          )}
        </div>

        {/* CENTER */}
        <div className="z-10 flex flex-col items-center gap-2">
          <PotDisplay pot={table.pot} callAmount={table.currentCallAmount} />

          {table.status === "playing" && table.currentTurn && (
            <p className="text-[10px] text-yellow-400 animate-pulse font-medium">
              {table.currentTurn === myUid
                ? "⚡ Your Turn"
                : `${table.players[table.currentTurn]?.displayName}'s turn`}
            </p>
          )}

          {/* ✅ Last raise display */}
          {table.lastRaiseBy && table.status === "playing" && (
            <p className="text-[10px] text-orange-400 font-medium">
              {table.players[table.lastRaiseBy]?.displayName} raised ₹{table.lastRaiseAmount}
            </p>
          )}

          {/* Countdown ring */}
          {isWaiting && countdown !== null && (
            <div className="flex flex-col items-center gap-1.5 mt-1">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="27" fill="none"
                    stroke="#f59e0b" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 27}`}
                    strokeDashoffset={`${2 * Math.PI * 27 * (1 - countdown / 15)}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-yellow-300 font-black text-xl">
                  {countdown}
                </span>
              </div>
              <p className="text-yellow-400 text-[11px] font-bold">Game shuru ho rahi hai…</p>
            </div>
          )}
        </div>

        {/* MY SEAT (Bottom) */}
        <div className="z-10 flex flex-col items-center pb-1">
          {myPlayer ? (
            <Seat
              player={myPlayer}
              isMe
              isCurrentTurn={isMyTurn}
              showCards={myPlayer.seenCards || isShowdown || myPlayer.status === "show"}
              position="bottom"
              turnStartedAt={isMyTurn ? myPlayer.turnStartedAt : null}
            />
          ) : (
            <p className="text-gray-500 text-sm">Spectating</p>
          )}
        </div>
      </div>

      {/* ACTION ZONE */}
      <div
        className="shrink-0 bg-black/60 backdrop-blur border-t border-emerald-900/30 px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        {/* WAITING */}
        {isWaiting && (
          <div className="text-center space-y-2 py-1">
            <p className="text-gray-400 text-xs">
              {Object.keys(table.players).length}/{table.maxPlayers} players joined
            </p>
            {countdown !== null ? (
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-14 h-14">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="#1a3d26" strokeWidth="4" />
                    <circle
                      cx="28" cy="28" r="24" fill="none"
                      stroke="#f59e0b" strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={`${2 * Math.PI * 24 * (1 - countdown / 15)}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-yellow-400 font-black text-lg">
                    {countdown}
                  </span>
                </div>
                <p className="text-yellow-400 text-xs font-bold">Game shuru ho rahi hai…</p>
                <p className="text-gray-600 text-[10px]">Boot ₹{table.bootAmount} automatically katega</p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1">
                <div className="w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Doosre player ka intezaar…</p>
              </div>
            )}
          </div>
        )}

        {/* MY TURN */}
        {table.status === "playing" && isMyTurn && myPlayer && (
          <div className="space-y-2">
            <p className="text-center text-[10px] text-yellow-500 uppercase tracking-widest">Your Turn</p>
            <ActionBar
              player={myPlayer}
              callAmount={table.currentCallAmount}
              bootAmount={table.bootAmount}
              onCall={() => act(() => callBet(tableId!, myUid))}
              onPack={() => act(() => packHand(tableId!, myUid))}
              onSee={() => act(() => seeCards(tableId!, myUid))}
              onShow={() => act(() => showHands(tableId!, myUid))}
              onRaise={() => setShowRaiseModal(true)}
              canShow={canShow}
              loading={actionLoading}
              turnStartedAt={myPlayer.turnStartedAt}
            />
          </div>
        )}

        {/* OPPONENT TURN */}
        {table.status === "playing" && !isMyTurn && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">
              Waiting for {table.currentTurn
                ? table.players[table.currentTurn]?.displayName || "opponent"
                : "opponent"}…
            </p>
          </div>
        )}

        {/* SPECTATOR */}
        {!myPlayer && table.status !== "waiting" && (
          <div className="text-center py-1">
            <button onClick={handleLeave} className="text-emerald-400 text-sm hover:underline">← Lobby</button>
          </div>
        )}
      </div>

      {/* Winner Overlay */}
      {isShowdown && (
        <WinnerOverlay
          table={table}
          myUid={myUid}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeave}
          isAdmin={isAdmin}
        />
      )}

      {/* Raise Modal */}
      {showRaiseModal && myPlayer && table && (
        <RaiseModal
          isBlind={!myPlayer.seenCards}
          currentCallAmount={table.currentCallAmount}
          bootAmount={table.bootAmount}
          onConfirm={handleRaiseConfirm}
          onCancel={() => setShowRaiseModal(false)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
