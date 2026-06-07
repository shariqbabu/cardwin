// ============================================================
// NineCardGame.tsx — Real-Time 9 Card Table Game
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
  packHand,
  showHands,
  leaveTable,
  resetTable,
  autoStartGame,
  getCardById,
  type NineCardTable,
  type NineCardPlayer,
  type Card,
} from "../../firebase/NineCard";

// ─── Card Visual ─────────────────────────────────
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

interface CardBackProps {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}
function CardBack({ size = "md", animate = false }: CardBackProps) {
  const sizeClass =
    size === "sm"
      ? "w-10 h-14"
      : size === "lg"
      ? "w-20 h-28"
      : "w-14 h-20";

  return (
    <div
      className={`
        ${sizeClass} rounded-xl shrink-0 overflow-hidden relative
        ${animate ? "animate-[dealCard_0.35s_ease-out_both]" : ""}
      `}
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

// ─── Player Seat ─────────────────────────────────
interface SeatProps {
  player: NineCardPlayer | null;
  isMe: boolean;
  isCurrentTurn: boolean;
  myCards: Card[];
  showCards: boolean;
  position: "bottom" | "top" | "left" | "right";
  pot?: number;
}
function Seat({ player, isMe, isCurrentTurn, myCards, showCards, position }: SeatProps) {
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

  return (
    <div className={`flex ${isVertical ? "flex-col" : "flex-row"} items-center gap-2`}>
      <div className="flex gap-1.5">
        {player.cardIds.length > 0 ? (
          player.cardIds.map((id, i) => (
            showCards ? (
              <CardFace key={id} card={getCardById(id)} size="md" animate />
            ) : (
              <CardBack key={i} size="md" animate />
            )
          ))
        ) : (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="w-14 h-20 rounded-xl border-2 border-dashed border-gray-700/40" />
          ))
        )}
      </div>

      <div className={`flex flex-col items-center gap-1 ${!isVertical ? "ml-2" : ""}`}>
        <div className={`
          relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
          ${isMe ? "bg-emerald-700 ring-2 ring-emerald-400" : "bg-gray-700 ring-2 ring-gray-600"}
          ${isCurrentTurn ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent" : ""}
        `}>
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

// ─── Action Buttons ───────────────────────────────
interface ActionBarProps {
  player: NineCardPlayer;
  callAmount: number;
  onCall: () => void;
  onPack: () => void;
  onSee: () => void;
  onShow: () => void;
  canShow: boolean;
  loading: boolean;
}
function ActionBar({ player, callAmount, onCall, onPack, onSee, onShow, canShow, loading }: ActionBarProps) {
  const isBlind = !player.seenCards;

  return (
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
              {iWon ? `+₹${table.pot}` : `${table.players[table.winnerId]?.displayName} wins`}
            </p>
          )}
        </div>

        <div className="p-5 space-y-4">
          {table.winnerReason && (
            <p className="text-center text-xs text-gray-400">{table.winnerReason}</p>
          )}

          {table.status === "finished" && (
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
                      {p.cardIds.map((id) => (
                        <CardFace key={id} card={getCardById(id)} size="sm" />
                      ))}
                    </div>
                    {table.winnerId === uid && <span className="text-yellow-400 text-xs">👑</span>}
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

// ─── Main Game ────────────────────────────────────
export default function NineCardGame() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  // ✅ SAARE HOOKS YAHAN — kisi bhi return se PEHLE
  const [table, setTable] = useState<NineCardTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);   // ✅ hook upar
  const hasLeft = useRef(false);
  const autoStartRef = useRef<ReturnType<typeof setTimeout> | null>(null); // ✅ hook upar

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

  // ✅ Auto-start countdown effect — hooks ke saath upar, early returns se PEHLE
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
        try {
          await autoStartGame(tableId);
        } catch (e: any) {
          setError(e.message);
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
    } else {
      setCountdown(null);
      if (autoStartRef.current) {
        clearTimeout(autoStartRef.current);
        autoStartRef.current = null;
      }
    }
  // playerOrder key string pe depend karo, object reference pe nahi
  }, [table?.status, table?.playerOrder?.join(","), tableId]);

  const myPlayer: NineCardPlayer | null = useMemo(
    () => (table && myUid ? table.players[myUid] || null : null),
    [table, myUid]
  );

  const opponents: NineCardPlayer[] = useMemo(() => {
    if (!table) return [];
    return table.playerOrder
      .filter((uid) => uid !== myUid)
      .map((uid) => table.players[uid])
      .filter(Boolean);
  }, [table, myUid]);

  const isMyTurn = table?.currentTurn === myUid;
  const isShowdown = table?.status === "finished";
  const isWaiting = table?.status === "waiting" || table?.status === "booting";

  const myCards: Card[] = useMemo(
    () =>
      myPlayer?.seenCards && myPlayer.cardIds.length > 0
        ? myPlayer.cardIds.map(getCardById)
        : [],
    [myPlayer]
  );

  const canShow = isMyTurn && !isWaiting && (myPlayer?.seenCards || false);

  // ─── Action helpers ───────────────────────────
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
    try { await leaveTable(tableId, myUid); } catch {}
    navigate("/games/ninecard");
  }

  async function handlePlayAgain() {
    if (!tableId) return;
    act(() => resetTable(tableId));
  }

  // ✅ Early returns SIRF YAHAN — saare hooks ke BAAD
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

  // ─── Render ─────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-[#060d09] text-white"
      style={{
        fontFamily: "'Georgia', serif",
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
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
          <button onClick={handleLeave} className="text-gray-400 hover:text-white text-lg leading-none px-1">←</button>
          <div>
            <p className="text-xs font-bold text-white leading-none">{table.name}</p>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">Round {table.round || 1} · Boot ₹{table.bootAmount}</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          table.status === "playing" ? "bg-blue-800/70 text-blue-300" :
          table.status === "waiting" ? "bg-emerald-900/70 text-emerald-400" :
          "bg-gray-700/70 text-gray-300"
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
              <Seat key={opp.uid} player={opp} isMe={false}
                isCurrentTurn={table.currentTurn === opp.uid}
                myCards={[]} showCards={isShowdown} position="top" />
            ))
          ) : (
            <Seat player={null} isMe={false} isCurrentTurn={false} myCards={[]} showCards={false} position="top" />
          )}
        </div>

        {/* CENTER POT */}
        <div className="z-10 flex flex-col items-center gap-1">
          <PotDisplay pot={table.pot} callAmount={table.currentCallAmount} />
          {table.status === "playing" && table.currentTurn && (
            <p className="text-[10px] text-yellow-400 animate-pulse font-medium">
              {table.currentTurn === myUid ? "Your Turn" : `${table.players[table.currentTurn]?.displayName}'s turn`}
            </p>
          )}
        </div>

        {/* MY SEAT (Bottom) */}
        <div className="z-10 flex flex-col items-center pb-1">
          {myPlayer ? (
            <Seat player={myPlayer} isMe isCurrentTurn={isMyTurn}
              myCards={myCards} showCards={myPlayer.seenCards || isShowdown} position="bottom" />
          ) : (
            <p className="text-gray-500 text-sm">Spectating</p>
          )}
        </div>
      </div>

      {/* ACTION ZONE */}
      <div className="shrink-0 bg-black/60 backdrop-blur border-t border-emerald-900/30 px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>

        {/* WAITING — sirf status dikhao, koi button nahi */}
        {isWaiting && (
          <div className="text-center space-y-2 py-1">
            <p className="text-gray-400 text-xs">
              {Object.keys(table.players).length}/{table.maxPlayers} players joined
            </p>
            {countdown !== null ? (
              /* Enough players — countdown chal raha hai */
              <div className="flex flex-col items-center gap-2">
                {/* Big countdown ring */}
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
              /* Players ka wait */
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
              onCall={() => act(() => callBet(tableId!, myUid))}
              onPack={() => act(() => packHand(tableId!, myUid))}
              onSee={() => act(() => seeCards(tableId!, myUid))}
              onShow={() => act(() => showHands(tableId!, myUid))}
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
              Waiting for {table.currentTurn ? table.players[table.currentTurn]?.displayName || "opponent" : "opponent"}…
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
    </div>
  );
}
