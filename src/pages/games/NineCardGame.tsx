// ============================================================
// NineCardGame.tsx — FINAL FIXED COMPACT UI
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  AUTO_CALL_SECONDS,
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

// ─────────────────────────────────────────────
// CARD UI
// ─────────────────────────────────────────────

const RED_SUITS = new Set(["♥", "♦"]);

interface CardFaceProps {
  card: Card;
  animate?: boolean;
  size?: "xs" | "sm" | "md";
}

function CardFace({ card, animate = false, size = "sm" }: CardFaceProps) {
  const isRed = RED_SUITS.has(card.suit);

  const sizeClass =
    size === "xs"
      ? "w-8 h-12 text-xs"
      : size === "md"
      ? "w-12 h-17 text-base"
      : "w-10 h-14 text-sm";

  return (
    <div
      className={`
        ${sizeClass} relative rounded-lg flex flex-col items-center justify-center
        bg-white border border-gray-100
        ${animate ? "animate-[dealCard_0.3s_ease-out_both]" : ""}
        select-none shrink-0
      `}
      style={{
        boxShadow: "0 3px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
      }}
    >
      <span className={`font-black leading-none ${isRed ? "text-red-600" : "text-gray-900"}`}>
        {card.rank}
      </span>
      <span className={`text-[10px] leading-none mt-0.5 ${isRed ? "text-red-500" : "text-gray-800"}`}>
        {card.suit}
      </span>
    </div>
  );
}

function CardBack({ size = "sm", animate = false }: { size?: "xs" | "sm" | "md"; animate?: boolean }) {
  const sizeClass =
    size === "xs"
      ? "w-8 h-12"
      : size === "md"
      ? "w-12 h-17"
      : "w-10 h-14";

  return (
    <div
      className={`${sizeClass} rounded-lg shrink-0 overflow-hidden relative ${animate ? "animate-[dealCard_0.3s_ease-out_both]" : ""}`}
      style={{
        background: "linear-gradient(135deg, #1a472a 0%, #0d3320 50%, #1a472a 100%)",
        boxShadow: "0 3px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
        border: "1px solid #2d6a4f",
      }}
    >
      <div
        className="absolute inset-1 rounded-md"
        style={{
          background: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 4px,
            rgba(255,255,255,0.04) 4px,
            rgba(255,255,255,0.04) 8px
          )`,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-emerald-600/35 text-sm font-bold select-none">9C</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SMALL CENTER TIMER
// ─────────────────────────────────────────────

function SmallCenterTimer({
  remaining,
  total = 15,
  tone = "yellow",
}: {
  remaining: number;
  total?: number;
  tone?: "yellow" | "green" | "red";
}) {
  const safe = Math.max(0, remaining);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safe / total);

  const stroke =
    tone === "red" ? "#ef4444" : tone === "green" ? "#10b981" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.25s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">
          {safe}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AVATAR TIMER RING
// ─────────────────────────────────────────────

function AvatarTimer({
  player,
  isMe,
  active,
  remaining,
  total = AUTO_CALL_SECONDS,
}: {
  player: NineCardPlayer;
  isMe: boolean;
  active: boolean;
  remaining: number | null;
  total?: number;
}) {
  const safe = Math.max(0, remaining ?? total);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safe / total);

  const stroke =
    safe <= 5 ? "#ef4444" : safe <= 10 ? "#f59e0b" : "#10b981";

  return (
    <div className="relative w-12 h-12 shrink-0">
      {active && (
        <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.25s linear" }}
          />
        </svg>
      )}

      <div
        className={`
          absolute inset-[4px] rounded-full flex items-center justify-center text-sm font-bold
          ${isMe ? "bg-emerald-700 ring-1 ring-emerald-400/70" : "bg-gray-700 ring-1 ring-gray-500/70"}
        `}
      >
        {player.photoURL ? (
          <img src={player.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          player.displayName.charAt(0).toUpperCase()
        )}
      </div>

      {active && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-black/80 border border-white/10 text-[9px] font-bold text-white flex items-center justify-center">
          {safe}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SEAT
// ─────────────────────────────────────────────

interface SeatProps {
  player: NineCardPlayer | null;
  isMe: boolean;
  isCurrentTurn: boolean;
  showCards: boolean;
  position: "bottom" | "top";
  turnCountdown: number | null;
}

function Seat({
  player,
  isMe,
  isCurrentTurn,
  showCards,
  position,
  turnCountdown,
}: SeatProps) {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-full border border-dashed border-gray-700/60 flex items-center justify-center text-gray-600 text-lg">
          +
        </div>
        <p className="text-[10px] text-gray-600">Waiting</p>
      </div>
    );
  }

  const statusColor = {
    waiting: "bg-gray-600",
    blind: "bg-yellow-700",
    seen: "bg-blue-700",
    packed: "bg-red-700",
    show: "bg-purple-700",
  }[player.status] || "bg-gray-600";

  const statusLabel = {
    waiting: "WAIT",
    blind: "BLIND",
    seen: "SEEN",
    packed: "PACK",
    show: "SHOW",
  }[player.status] || player.status.toUpperCase();

  const shouldShowCards = showCards || player.status === "show" || (isMe && player.seenCards);

  return (
    <div className={`flex flex-col items-center ${position === "top" ? "gap-1.5" : "gap-1.5"}`}>
      {/* cards */}
      <div className="flex gap-1">
        {player.cardIds.length > 0 ? (
          player.cardIds.map((id, i) =>
            shouldShowCards ? (
              <CardFace key={id} card={getCardById(id)} size="sm" animate />
            ) : (
              <CardBack key={i} size="sm" animate />
            )
          )
        ) : (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="w-10 h-14 rounded-lg border border-dashed border-gray-700/40" />
          ))
        )}
      </div>

      {/* avatar */}
      <AvatarTimer
        player={player}
        isMe={isMe}
        active={isCurrentTurn}
        remaining={isCurrentTurn ? turnCountdown : null}
      />

      {/* meta */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-bold text-white leading-none max-w-[88px] truncate">
          {isMe ? "You" : player.displayName}
        </p>

        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white ${statusColor}`}>
          {statusLabel}
        </span>

        {player.currentBet > 0 && (
          <p className="text-[10px] text-yellow-300 font-semibold leading-none">₹{player.currentBet}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// POT
// ─────────────────────────────────────────────

function PotDisplay({ pot, callAmount }: { pot: number; callAmount: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="px-4 py-2 rounded-2xl text-center border"
        style={{
          background: "linear-gradient(180deg, rgba(8,26,14,0.82), rgba(4,12,8,0.92))",
          borderColor: "rgba(245,158,11,0.18)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 22px rgba(0,0,0,0.35)",
        }}
      >
        <p className="text-[9px] text-yellow-600 uppercase tracking-[0.2em] font-semibold">Pot</p>
        <p className="text-yellow-300 font-black text-3xl leading-none">₹{pot}</p>
      </div>
      {callAmount > 0 && <p className="text-[10px] text-white/55">Call: ₹{callAmount}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// RAISE MODAL
// ─────────────────────────────────────────────

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
  const minRaise = isBlind ? currentCallAmount : currentCallAmount * 2;
  const [amount, setAmount] = useState(minRaise);

  const presets = [minRaise, minRaise * 2, minRaise * 3].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-5">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#07110c]/95 p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-black text-sm tracking-wide">Raise Bet</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <p className="text-[11px] text-white/60 mb-3">
          {isBlind ? "Blind min raise" : "Seen min raise"} ₹{minRaise}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`py-2 rounded-xl text-xs font-bold border transition ${
                amount === p
                  ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                  : "bg-white/[0.04] border-white/10 text-white/70"
              }`}
            >
              ₹{p}
            </button>
          ))}
        </div>

        <input
          type="number"
          min={minRaise}
          step={bootAmount}
          value={amount}
          onChange={(e) => setAmount(Math.max(minRaise, Number(e.target.value)))}
          className="w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-400/40 mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            disabled={loading || amount < minRaise}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm disabled:opacity-50"
          >
            {loading ? "..." : `Raise ₹${amount}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ACTION BAR
// ─────────────────────────────────────────────

interface ActionBarProps {
  player: NineCardPlayer;
  callAmount: number;
  onCall: () => void;
  onPack: () => void;
  onSee: () => void;
  onShow: () => void;
  onRaise: () => void;
  canShow: boolean;
  loading: boolean;
}

function ActionBar({
  player,
  callAmount,
  onCall,
  onPack,
  onSee,
  onShow,
  onRaise,
  canShow,
  loading,
}: ActionBarProps) {
  const isBlind = !player.seenCards;

  const btn =
    "px-3 py-2 rounded-xl font-bold text-[11px] transition border disabled:opacity-40 disabled:cursor-not-allowed min-w-[84px]";

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {isBlind && (
        <button
          onClick={onSee}
          disabled={loading}
          className={`${btn} bg-cyan-900/70 hover:bg-cyan-800/70 text-cyan-100 border-cyan-700/60`}
        >
          See
        </button>
      )}

      <button
        onClick={onCall}
        disabled={loading}
        className={`${btn} bg-emerald-900/70 hover:bg-emerald-800/70 text-emerald-100 border-emerald-700/60`}
      >
        Call ₹{callAmount}
      </button>

      <button
        onClick={onRaise}
        disabled={loading}
        className={`${btn} bg-amber-900/70 hover:bg-amber-800/70 text-amber-100 border-amber-700/60`}
      >
        Raise
      </button>

      {canShow && !isBlind && (
        <button
          onClick={onShow}
          disabled={loading}
          className={`${btn} bg-purple-900/70 hover:bg-purple-800/70 text-purple-100 border-purple-700/60`}
        >
          Show
        </button>
      )}

      <button
        onClick={onPack}
        disabled={loading}
        className={`${btn} bg-red-900/70 hover:bg-red-800/70 text-red-100 border-red-700/60`}
      >
        Pack
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// WINNER OVERLAY
// ─────────────────────────────────────────────

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
        <div
          className={`py-5 text-center ${
            isDraw
              ? "bg-gradient-to-b from-gray-700 to-gray-800"
              : iWon
              ? "bg-gradient-to-b from-yellow-600/80 to-yellow-800/60"
              : "bg-gradient-to-b from-red-800/60 to-red-900/40"
          }`}
        >
          <div className="text-4xl mb-2">{isDraw ? "🤝" : iWon ? "🏆" : "💔"}</div>
          <h2 className="text-xl font-black text-white">
            {isDraw ? "It's a Draw!" : iWon ? "You Won!" : "You Lost"}
          </h2>
          {!isDraw && table.winnerId && (
            <p className="text-xs text-gray-300 mt-1">
              {iWon ? `+₹${table.pot}` : `${table.players[table.winnerId]?.displayName || "Player"} wins`}
            </p>
          )}
        </div>

        <div className="p-4 space-y-3">
          {table.winnerReason && (
            <p className="text-center text-xs text-gray-400">{table.winnerReason}</p>
          )}

          <div className="space-y-2">
            {table.playerOrder.map((uid) => {
              const p = table.players[uid];
              if (!p) return null;

              return (
                <div key={uid} className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-bold ${uid === myUid ? "text-emerald-400" : "text-gray-300"}`}>
                    {uid === myUid ? "You" : p.displayName}
                  </p>

                  <div className="flex gap-1">
                    {p.cardIds?.map((id) => (
                      <CardFace key={id} card={getCardById(id)} size="xs" />
                    ))}
                  </div>

                  {table.winnerId === uid && <span className="text-yellow-400 text-xs">👑</span>}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onLeave}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm"
            >
              Leave
            </button>
            {isAdmin && (
              <button
                onClick={onPlayAgain}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
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

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function NineCardGame() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const myUid = user?.uid || "";

  const [table, setTable] = useState<NineCardTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [turnCountdown, setTurnCountdown] = useState<number | null>(null);
  const [showRaiseModal, setShowRaiseModal] = useState(false);

  const hasLeft = useRef(false);
  const wasSeatedRef = useRef(false);
  const autoStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTurnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // subscribe
  useEffect(() => {
    if (!tableId) return;
    const unsub = subscribeTable(tableId, (t) => {
      setTable(t);
      setLoading(false);
    });
    return unsub;
  }, [tableId]);

  // auto remove navigate
  useEffect(() => {
    if (!table || !myUid) return;

    if (table.players?.[myUid]) {
      wasSeatedRef.current = true;
      return;
    }

    if (wasSeatedRef.current && !table.players?.[myUid]) {
      hasLeft.current = true;
      navigate("/games/ninecard");
    }
  }, [table, myUid, navigate]);

  // leave on unmount
  useEffect(() => {
    return () => {
      if (!hasLeft.current && tableId && myUid) {
        hasLeft.current = true;
        leaveTable(tableId, myUid).catch(() => {});
      }
    };
  }, [tableId, myUid]);

  // waiting countdown
  useEffect(() => {
    if (!table || !tableId) return;
    const playerCount = Object.keys(table.players || {}).length;

    if (table.status === "waiting" && playerCount >= table.minPlayers) {
      setCountdown(15);
      let seconds = 15;

      const interval = setInterval(() => {
        seconds -= 1;
        setCountdown(seconds);
        if (seconds <= 0) clearInterval(interval);
      }, 1000);

      autoStartRef.current = setTimeout(async () => {
        try {
          await autoStartGame(tableId);
        } catch (e: any) {
          setError(e.message || "Auto start failed");
        }
      }, 15000);

      return () => {
        clearInterval(interval);
        if (autoStartRef.current) {
          clearTimeout(autoStartRef.current);
          autoStartRef.current = null;
        }
        setCountdown(null);
      };
    }

    setCountdown(null);
    if (autoStartRef.current) {
      clearTimeout(autoStartRef.current);
      autoStartRef.current = null;
    }
  }, [table?.status, table?.playerOrder?.join(","), tableId]);

  // turn countdown
  const currentTurnStartedAt = useMemo(() => {
    if (!table?.currentTurn) return null;
    return table.players?.[table.currentTurn]?.turnStartedAt || null;
  }, [table]);

  useEffect(() => {
    if (!table || table.status !== "playing" || !table.currentTurn || !currentTurnStartedAt?.toMillis) {
      setTurnCountdown(null);
      return;
    }

    const update = () => {
      const elapsed = (Date.now() - currentTurnStartedAt.toMillis()) / 1000;
      const left = Math.max(0, Math.ceil(AUTO_CALL_SECONDS - elapsed));
      setTurnCountdown(left);
    };

    update();
    const iv = setInterval(update, 250);
    return () => clearInterval(iv);
  }, [table?.status, table?.currentTurn, currentTurnStartedAt]);

  // auto timeout action
  useEffect(() => {
    if (!table || !tableId || !myUid) return;
    if (table.status !== "playing") return;
    if (table.currentTurn !== myUid) return;

    const me = table.players?.[myUid];
    if (!me?.turnStartedAt?.toMillis) return;

    const elapsed = (Date.now() - me.turnStartedAt.toMillis()) / 1000;
    const remaining = AUTO_CALL_SECONDS - elapsed;

    if (remaining <= 0) {
      autoCallBet(tableId, myUid).catch(() => {});
      return;
    }

    autoTurnRef.current = setTimeout(() => {
      autoCallBet(tableId, myUid).catch(() => {});
    }, remaining * 1000);

    return () => {
      if (autoTurnRef.current) {
        clearTimeout(autoTurnRef.current);
        autoTurnRef.current = null;
      }
    };
  }, [table?.status, table?.currentTurn, table?.players?.[myUid]?.turnStartedAt, tableId, myUid]);

  const myPlayer: NineCardPlayer | null = useMemo(
    () => (table && myUid ? table.players[myUid] || null : null),
    [table, myUid]
  );

  const opponents: NineCardPlayer[] = useMemo(() => {
    if (!table) return [];
    return table.playerOrder
      .filter((uid) => uid !== myUid)
      .map((uid) => table.players[uid])
      .filter(Boolean) as NineCardPlayer[];
  }, [table, myUid]);

  const isMyTurn = table?.currentTurn === myUid;
  const isWaiting = table?.status === "waiting" || table?.status === "booting";
  const isShowdown = table?.status === "finished";
  const canShow = isMyTurn && !isWaiting && !!myPlayer?.seenCards;

  async function act(fn: () => Promise<void>) {
    if (!tableId) return;
    setActionLoading(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    if (!tableId) return;
    hasLeft.current = true;
    try {
      await leaveTable(tableId, myUid);
    } catch {}
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
          <button
            onClick={() => navigate("/games/ninecard")}
            className="text-emerald-400 text-sm hover:underline"
          >
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const currentTurnPlayer = table.currentTurn ? table.players?.[table.currentTurn] : null;
  const timerTone =
    (turnCountdown ?? 15) <= 5 ? "red" : (turnCountdown ?? 15) <= 10 ? "yellow" : "green";

  return (
    <div
      className="flex flex-col bg-[#060d09] text-white"
      style={{
        fontFamily: "'Georgia', serif",
        position: "fixed",
        inset: 0,
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes dealCard {
          from { opacity: 0; transform: translateY(-12px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* TOP BAR */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-black/50 border-b border-emerald-900/40">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleLeave}
            className="text-gray-400 hover:text-white text-lg leading-none px-1"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white leading-none truncate">{table.name}</p>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">
              Round {table.round || 1} · Boot ₹{table.bootAmount}
            </p>
          </div>
        </div>

        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            table.status === "playing"
              ? "bg-blue-800/70 text-blue-300"
              : table.status === "waiting"
              ? "bg-emerald-900/70 text-emerald-400"
              : "bg-gray-700/70 text-gray-300"
          }`}
        >
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

      {/* TABLE AREA */}
      <div className="flex-1 relative px-3 py-2 min-h-0">
        <div
          className="absolute inset-x-2 inset-y-2 rounded-[2.25rem] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, #1e5c35 0%, #0f3a20 65%, #081a0e 100%)",
            border: "4px solid #2d6a4f",
            boxShadow:
              "0 0 0 2px #1a3d26, inset 0 2px 28px rgba(0,0,0,0.58), 0 8px 22px rgba(0,0,0,0.68)",
          }}
        />

        <div className="relative z-10 h-full flex flex-col">
          {/* TOP SEAT */}
          <div className="min-h-[110px] flex items-start justify-center pt-3">
            {opponents.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-6">
                {opponents.map((opp) => (
                  <Seat
                    key={opp.uid}
                    player={opp}
                    isMe={false}
                    isCurrentTurn={table.currentTurn === opp.uid}
                    showCards={isShowdown || opp.status === "show"}
                    position="top"
                    turnCountdown={table.currentTurn === opp.uid ? turnCountdown : null}
                  />
                ))}
              </div>
            ) : (
              <Seat
                player={null}
                isMe={false}
                isCurrentTurn={false}
                showCards={false}
                position="top"
                turnCountdown={null}
              />
            )}
          </div>

          {/* CENTER */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <PotDisplay pot={table.pot} callAmount={table.currentCallAmount} />

            {table.status === "playing" && table.currentTurn && (
              <>
                <p className="text-[11px] text-yellow-300 font-semibold">
                  {table.currentTurn === myUid
                    ? "Your turn"
                    : `${currentTurnPlayer?.displayName || "Opponent"}'s turn`}
                </p>

                {turnCountdown !== null && (
                  <SmallCenterTimer
                    remaining={turnCountdown}
                    total={AUTO_CALL_SECONDS}
                    tone={timerTone as "yellow" | "green" | "red"}
                  />
                )}

                <p className="text-[10px] text-white/60 text-center">
                  {table.lastRaiseBy && table.lastRaiseBy !== table.currentTurn
                    ? "Raise pending • 1st timeout = pack • 2nd = leave"
                    : currentTurnPlayer?.timeoutCount
                    ? "Next timeout = leave table"
                    : "1st timeout = auto call • 2nd = leave"}
                </p>
              </>
            )}

            {isWaiting && countdown !== null && (
              <>
                <p className="text-[11px] text-yellow-300 font-semibold">Game shuru ho rahi hai...</p>
                <SmallCenterTimer remaining={countdown} total={15} tone="yellow" />
                <p className="text-[10px] text-white/55">Boot ₹{table.bootAmount} auto katega</p>
              </>
            )}

            {table.lastRaiseBy && table.status === "playing" && (
              <p className="text-[10px] text-orange-300 font-semibold bg-orange-500/10 border border-orange-400/20 px-2.5 py-1 rounded-full backdrop-blur">
                {table.players[table.lastRaiseBy]?.displayName || "Player"} raised ₹{table.lastRaiseAmount}
              </p>
            )}
          </div>

          {/* BOTTOM SEAT */}
          <div className="min-h-[128px] flex items-end justify-center pb-2">
            {myPlayer ? (
              <Seat
                player={myPlayer}
                isMe
                isCurrentTurn={isMyTurn}
                showCards={myPlayer.seenCards || isShowdown || myPlayer.status === "show"}
                position="bottom"
                turnCountdown={isMyTurn ? turnCountdown : null}
              />
            ) : (
              <p className="text-gray-500 text-sm">Spectating</p>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div
        className="shrink-0 bg-black/65 border-t border-white/10 px-3 py-2.5"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        {isWaiting && (
          <div className="text-center py-1">
            <p className="text-gray-300 text-xs font-medium">
              {Object.keys(table.players || {}).length}/{table.maxPlayers} players joined
            </p>
            <p className="text-gray-500 text-[10px] mt-1">
              {countdown !== null ? "Timer center me dikh raha hai" : "Doosre player ka intezaar..."}
            </p>
          </div>
        )}

        {table.status === "playing" && isMyTurn && myPlayer && (
          <div className="space-y-2">
            <p className="text-center text-[9px] text-yellow-500 uppercase tracking-[0.2em]">
              Your Turn
            </p>
            <ActionBar
              player={myPlayer}
              callAmount={table.currentCallAmount}
              onCall={() => act(() => callBet(tableId!, myUid))}
              onPack={() => act(() => packHand(tableId!, myUid))}
              onSee={() => act(() => seeCards(tableId!, myUid))}
              onShow={() => act(() => showHands(tableId!, myUid))}
              onRaise={() => setShowRaiseModal(true)}
              canShow={canShow}
              loading={actionLoading}
            />
          </div>
        )}

        {table.status === "playing" && !isMyTurn && (
          <div className="flex items-center justify-center gap-2 py-1.5">
            <div className="w-3.5 h-3.5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <p className="text-gray-400 text-xs">
              Waiting for{" "}
              {table.currentTurn
                ? table.players[table.currentTurn]?.displayName || "opponent"
                : "opponent"}
              …
            </p>
          </div>
        )}

        {!myPlayer && table.status !== "waiting" && (
          <div className="text-center py-1">
            <button
              onClick={() => navigate("/games/ninecard")}
              className="text-emerald-400 text-sm hover:underline"
            >
              ← Lobby
            </button>
          </div>
        )}
      </div>

      {/* WINNER */}
      {isShowdown && myPlayer && (
        <WinnerOverlay
          table={table}
          myUid={myUid}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeave}
          isAdmin={isAdmin}
        />
      )}

      {/* RAISE MODAL */}
      {showRaiseModal && myPlayer && (
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
