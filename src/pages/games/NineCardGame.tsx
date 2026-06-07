// ============================================================
// NineCardGame.tsx — Final
// ============================================================

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  size?: "sm" | "md" | "lg";
}

function CardFace({ card, animate = false, size = "md" }: CardFaceProps) {
  const isRed = RED_SUITS.has(card.suit);

  const sizeClass =
    size === "sm"
      ? "w-10 h-14 text-base"
      : size === "lg"
      ? "w-20 h-28 text-2xl"
      : "w-14 h-20 text-lg";

  return (
    <div
      className={`
        ${sizeClass} relative rounded-xl flex flex-col items-center justify-center
        bg-white shadow-xl border-2 border-gray-100
        ${animate ? "animate-[dealCard_0.35s_ease-out_both]" : ""}
        select-none shrink-0
      `}
      style={{
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)",
      }}
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
    size === "sm"
      ? "w-10 h-14"
      : size === "lg"
      ? "w-20 h-28"
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
      <div
        className="absolute inset-1 rounded-lg"
        style={{
          background: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 4px,
            rgba(255,255,255,0.04) 4px,
            rgba(255,255,255,0.04) 8px
          )`,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-emerald-600/40 text-lg font-bold select-none">9C</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CENTER TIMER
// ─────────────────────────────────────────────

function CenterGlassTimer({
  remaining,
  total = 15,
  label,
  subLabel,
  color = "#f59e0b",
}: {
  remaining: number;
  total?: number;
  label: string;
  subLabel?: string;
  color?: string;
}) {
  const safe = Math.max(0, remaining);
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safe / total);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-[92px] h-[92px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.16) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.14), 0 12px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)",
          backdropFilter: "blur(14px)",
        }}
      >
        <svg className="absolute inset-0 w-[92px] h-[92px] -rotate-90" viewBox="0 0 92 92">
          <circle
            cx="46"
            cy="46"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
          />
          <circle
            cx="46"
            cy="46"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-black leading-none"
            style={{
              fontSize: 30,
              color: "#ffe082",
              textShadow: "0 2px 10px rgba(245,158,11,0.35)",
            }}
          >
            {safe}
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/55 mt-1">
            Timer
          </span>
        </div>
      </div>

      <div className="text-center max-w-[220px]">
        <p className="text-[13px] font-extrabold text-yellow-300 tracking-wide">
          {label}
        </p>
        {subLabel && (
          <p className="text-[10px] text-white/55 mt-0.5">{subLabel}</p>
        )}
      </div>
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
  position: "bottom" | "top" | "left" | "right";
}

function Seat({ player, isMe, isCurrentTurn, showCards, position }: SeatProps) {
  const isVertical = position === "bottom" || position === "top";

  if (!player) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-700/60 flex items-center justify-center text-gray-600 text-lg">
          +
        </div>
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

  const shouldShowCards = showCards || player.status === "show" || (isMe && player.seenCards);

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
        <div
          className={`
            relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
            ${isMe ? "bg-emerald-700 ring-2 ring-emerald-400" : "bg-gray-700 ring-2 ring-gray-600"}
            ${isCurrentTurn ? "ring-2 ring-yellow-400" : ""}
          `}
        >
          {player.photoURL ? (
            <img src={player.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            player.displayName.charAt(0).toUpperCase()
          )}
          {isCurrentTurn && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
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

// ─────────────────────────────────────────────
// POT
// ─────────────────────────────────────────────

function PotDisplay({ pot, callAmount }: { pot: number; callAmount: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="px-6 py-3 rounded-2xl text-center border"
        style={{
          background: "linear-gradient(180deg, rgba(8,26,14,0.78), rgba(4,12,8,0.9))",
          borderColor: "rgba(245,158,11,0.22)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 30px rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
        }}
      >
        <p className="text-[10px] text-yellow-600 uppercase tracking-[0.24em] font-medium">Pot</p>
        <p className="text-yellow-300 font-black text-[34px] leading-none">₹{pot}</p>
      </div>
      {callAmount > 0 && <p className="text-[11px] text-white/55">Call: ₹{callAmount}</p>}
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

  const presets = [minRaise, minRaise * 2, minRaise * 3, minRaise * 5].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#07110c]/90 backdrop-blur-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-black text-base tracking-wide">Raise Bet</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-white text-xl">×</button>
        </div>

        <p className="text-xs text-white/60 mb-3">
          {isBlind ? "Blind raise minimum" : "Seen raise minimum"} ₹{minRaise}
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`py-2 rounded-xl text-xs font-bold border transition ${
                amount === p
                  ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                  : "bg-white/[0.04] border-white/10 text-white/70 hover:border-white/20"
              }`}
            >
              ₹{p}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-xs text-white/50 mb-1">Custom Amount</label>
          <input
            type="number"
            min={minRaise}
            step={bootAmount}
            value={amount}
            onChange={(e) => setAmount(Math.max(minRaise, Number(e.target.value)))}
            className="w-full rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-3 text-white outline-none focus:border-emerald-400/40"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl border border-white/10 text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            disabled={loading || amount < minRaise}
            className="flex-1 py-3 rounded-2xl bg-amber-500/80 hover:bg-amber-400 text-black font-black disabled:opacity-50"
          >
            {loading ? "Raising…" : `Raise ₹${amount}`}
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
    "relative overflow-hidden px-4 py-3 rounded-2xl font-extrabold text-sm tracking-wide transition-all duration-200 " +
    "border backdrop-blur-xl disabled:opacity-40 disabled:cursor-not-allowed " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_rgba(0,0,0,0.35)] active:scale-[0.98]";

  return (
    <div className="rounded-[28px] p-3 border border-white/10 bg-white/[0.05] backdrop-blur-2xl shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
      <div className="flex flex-wrap justify-center gap-2.5">
        {isBlind && (
          <button
            onClick={onSee}
            disabled={loading}
            className={`${btn} text-white border-cyan-400/25 bg-[linear-gradient(180deg,rgba(34,211,238,0.35),rgba(8,47,73,0.75))]`}
          >
            See Cards
          </button>
        )}

        <button
          onClick={onCall}
          disabled={loading}
          className={`${btn} text-white border-emerald-300/25 bg-[linear-gradient(180deg,rgba(16,185,129,0.42),rgba(6,78,59,0.85))]`}
        >
          Call ₹{callAmount}
        </button>

        <button
          onClick={onRaise}
          disabled={loading}
          className={`${btn} text-white border-amber-300/25 bg-[linear-gradient(180deg,rgba(251,191,36,0.42),rgba(120,53,15,0.85))]`}
        >
          Raise
        </button>

        {canShow && !isBlind && (
          <button
            onClick={onShow}
            disabled={loading}
            className={`${btn} text-white border-fuchsia-300/25 bg-[linear-gradient(180deg,rgba(192,132,252,0.42),rgba(88,28,135,0.85))]`}
          >
            Show
          </button>
        )}

        <button
          onClick={onPack}
          disabled={loading}
          className={`${btn} text-white border-rose-300/25 bg-[linear-gradient(180deg,rgba(251,113,133,0.42),rgba(127,29,29,0.9))]`}
        >
          Pack
        </button>
      </div>
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
          className={`py-6 text-center ${
            isDraw
              ? "bg-gradient-to-b from-gray-700 to-gray-800"
              : iWon
              ? "bg-gradient-to-b from-yellow-600/80 to-yellow-800/60"
              : "bg-gradient-to-b from-red-800/60 to-red-900/40"
          }`}
        >
          <div className="text-5xl mb-2">{isDraw ? "🤝" : iWon ? "🏆" : "💔"}</div>
          <h2 className="text-2xl font-black text-white">
            {isDraw ? "It's a Draw!" : iWon ? "You Won!" : "You Lost"}
          </h2>
          {!isDraw && table.winnerId && (
            <p className="text-sm text-gray-300 mt-1">
              {iWon
                ? `+₹${table.pot}`
                : `${table.players[table.winnerId]?.displayName || "Player"} wins`}
            </p>
          )}
        </div>

        <div className="p-5 space-y-4">
          {table.winnerReason && (
            <p className="text-center text-xs text-gray-400">{table.winnerReason}</p>
          )}

          <div className="space-y-3">
            {table.playerOrder.map((uid) => {
              const p = table.players[uid];
              if (!p) return null;

              return (
                <div key={uid} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${uid === myUid ? "text-emerald-400" : "text-gray-300"}`}>
                      {uid === myUid ? "You" : p.displayName}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {p.cardIds?.map((id) => (
                      <CardFace key={id} card={getCardById(id)} size="sm" />
                    ))}
                  </div>
                  {table.winnerId === uid && <span className="text-yellow-400 text-xs">👑</span>}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onLeave}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition"
            >
              Leave
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

  // subscribe table
  useEffect(() => {
    if (!tableId) return;
    const unsub = subscribeTable(tableId, (t) => {
      setTable(t);
      setLoading(false);
    });
    return unsub;
  }, [tableId]);

  // if auto-removed from table (2nd timeout), send to lobby
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

      const iv = setInterval(() => {
        seconds -= 1;
        setCountdown(seconds);
        if (seconds <= 0) clearInterval(iv);
      }, 1000);

      autoStartRef.current = setTimeout(async () => {
        try {
          await autoStartGame(tableId);
        } catch (e: any) {
          setError(e.message || "Auto start failed");
        }
      }, 15000);

      return () => {
        clearInterval(iv);
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

  // playing center timer
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

  // auto timeout action only for my turn
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

  return (
    <div
      className="flex flex-col bg-[#060d09] text-white"
      style={{
        fontFamily: "'Georgia', serif",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100dvh",
        overflow: "hidden",
      }}
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
          <button
            onClick={handleLeave}
            className="text-gray-400 hover:text-white text-lg leading-none px-1"
          >
            ←
          </button>
          <div>
            <p className="text-xs font-bold text-white leading-none">{table.name}</p>
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
          <button onClick={() => setError("")} className="text-red-600 ml-2">
            ×
          </button>
        </div>
      )}

      {/* TABLE */}
      <div className="flex-1 relative flex flex-col items-center justify-between px-4 py-3 min-h-0">
        <div
          className="absolute inset-x-3 inset-y-2 rounded-[2.5rem] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, #1e5c35 0%, #0f3a20 65%, #081a0e 100%)",
            border: "5px solid #2d6a4f",
            boxShadow:
              "0 0 0 2px #1a3d26, inset 0 2px 40px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.8)",
          }}
        />

        {/* OPPONENTS */}
        <div className="w-full flex justify-center z-10 pt-1">
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
            />
          )}
        </div>

        {/* CENTER */}
        <div className="z-10 flex flex-col items-center gap-3">
          <PotDisplay pot={table.pot} callAmount={table.currentCallAmount} />

          {table.status === "playing" && table.currentTurn && (
            <>
              <p className="text-[11px] text-yellow-300 font-semibold tracking-wide">
                {table.currentTurn === myUid
                  ? "Your Turn"
                  : `${currentTurnPlayer?.displayName || "Opponent"}'s turn`}
              </p>

              {turnCountdown !== null && (
                <CenterGlassTimer
                  remaining={turnCountdown}
                  total={AUTO_CALL_SECONDS}
                  label={
                    table.currentTurn === myUid
                      ? "Action before timer ends"
                      : "Opponent is thinking..."
                  }
                  subLabel={
                    table.lastRaiseBy && table.lastRaiseBy !== table.currentTurn
                      ? "Raise pending • 1st timeout = pack • 2nd = leave"
                      : currentTurnPlayer?.timeoutCount
                      ? "Next timeout = direct leave"
                      : "1st timeout = auto call • 2nd = leave"
                  }
                  color={
                    turnCountdown <= 5 ? "#ef4444" :
                    turnCountdown <= 10 ? "#f59e0b" :
                    "#10b981"
                  }
                />
              )}
            </>
          )}

          {isWaiting && countdown !== null && (
            <CenterGlassTimer
              remaining={countdown}
              total={15}
              label="Game shuru ho rahi hai..."
              subLabel={`Boot ₹${table.bootAmount} automatically katega`}
              color="#f59e0b"
            />
          )}

          {table.lastRaiseBy && table.status === "playing" && (
            <p className="text-[11px] text-orange-300 font-semibold bg-orange-500/10 border border-orange-400/20 px-3 py-1 rounded-full backdrop-blur">
              {table.players[table.lastRaiseBy]?.displayName || "Player"} raised ₹{table.lastRaiseAmount}
            </p>
          )}
        </div>

        {/* MY SEAT */}
        <div className="z-10 flex flex-col items-center pb-1">
          {myPlayer ? (
            <Seat
              player={myPlayer}
              isMe
              isCurrentTurn={isMyTurn}
              showCards={myPlayer.seenCards || isShowdown || myPlayer.status === "show"}
              position="bottom"
            />
          ) : (
            <p className="text-gray-500 text-sm">Spectating</p>
          )}
        </div>
      </div>

      {/* ACTION ZONE */}
      <div
        className="shrink-0 border-t border-white/10 px-4 py-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.50), rgba(0,0,0,0.72))",
          backdropFilter: "blur(18px)",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {/* WAITING */}
        {isWaiting && (
          <div className="text-center py-2">
            <p className="text-gray-300 text-sm font-medium">
              {Object.keys(table.players || {}).length}/{table.maxPlayers} players joined
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {countdown !== null
                ? "Countdown table ke center me dikh raha hai"
                : "Doosre player ka intezaar..."}
            </p>
          </div>
        )}

        {/* MY TURN */}
        {table.status === "playing" && isMyTurn && myPlayer && (
          <div className="space-y-2">
            <p className="text-center text-[10px] text-yellow-500 uppercase tracking-widest">
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

        {/* OPPONENT TURN */}
        {table.status === "playing" && !isMyTurn && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">
              Waiting for{" "}
              {table.currentTurn
                ? table.players[table.currentTurn]?.displayName || "opponent"
                : "opponent"}
              …
            </p>
          </div>
        )}

        {/* spectator */}
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

      {/* Winner overlay */}
      {isShowdown && myPlayer && (
        <WinnerOverlay
          table={table}
          myUid={myUid}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeave}
          isAdmin={isAdmin}
        />
      )}

      {/* Raise modal */}
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
