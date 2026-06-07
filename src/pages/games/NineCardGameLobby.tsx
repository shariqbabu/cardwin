// ============================================================
// NineCardGameLobby.tsx — Live Lobby for 9 Card Table
// ============================================================

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {  useAuth } from "../../context/AuthContext";
import {
  subscribeLobby,
  joinTable,
  adminCreateTable,
  adminToggleTable,
  adminToggleLock,
  adminDeleteTable,
  type NineCardTable,
} from "../../firebase/NineCard";

// ─── helpers ───────────────────────────────────
function statusColor(status: NineCardTable["status"]): string {
  switch (status) {
    case "waiting":   return "text-emerald-400";
    case "booting":   return "text-yellow-400";
    case "playing":   return "text-blue-400";
    case "finished":  return "text-purple-400";
    case "showdown":  return "text-orange-400";
    case "disabled":  return "text-red-500";
    default:          return "text-gray-400";
  }
}

function statusLabel(status: NineCardTable["status"]): string {
  switch (status) {
    case "waiting":   return "Open";
    case "booting":   return "Starting…";
    case "playing":   return "In Play";
    case "finished":  return "Finished";
    case "showdown":  return "Showdown";
    case "disabled":  return "Disabled";
    default:          return status;
  }
}

function playerCount(table: NineCardTable): number {
  return Object.keys(table.players).length;
}

// ─── Admin Create Form ───────────────────────────
interface CreateFormProps {
  onClose: () => void;
  adminUid: string;
}
function CreateTableModal({ onClose, adminUid }: CreateFormProps) {
  const [name, setName] = useState("");
  const [boot, setBoot] = useState(10);
  const [maxP, setMaxP] = useState<2 | 3 | 4>(2);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setErr("Table name required"); return; }
    setLoading(true);
    try {
      await adminCreateTable(adminUid, name.trim(), boot, maxP);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-[#0e1a14] border border-emerald-800/60 rounded-2xl p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-emerald-300 mb-5 tracking-wide">
          Create New Table
        </h2>

        {err && (
          <p className="text-red-400 text-sm mb-3 bg-red-900/20 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Table Name</label>
            <input
              className="w-full bg-[#162218] border border-emerald-900/60 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VIP Table 1"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Boot Amount (₹)</label>
            <input
              type="number"
              min={1}
              className="w-full bg-[#162218] border border-emerald-900/60 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition"
              value={boot}
              onChange={e => setBoot(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Max Players</label>
            <div className="flex gap-2">
              {([2, 3, 4] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setMaxP(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    maxP === n
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-[#162218] border-emerald-900/40 text-gray-400 hover:border-emerald-700"
                  }`}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-sm disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Card ─────────────────────────────────
interface TableCardProps {
  table: NineCardTable;
  currentUid: string;
  isAdmin: boolean;
  onJoin: (id: string) => void;
  onToggle: (id: string, disabled: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onDelete: (id: string) => void;
}
function TableCard({
  table,
  currentUid,
  isAdmin,
  onJoin,
  onToggle,
  onLock,
  onDelete,
}: TableCardProps) {
  const count = playerCount(table);
  const isFull = count >= table.maxPlayers;
  const isInGame = table.status === "playing" || table.status === "booting";
  const isDisabled = table.status === "disabled";
  const alreadyIn = !!table.players[currentUid];
  const canJoin = !isDisabled && !isFull && !isInGame && !table.locked;

  return (
    <div
      className={`
        relative flex flex-col bg-[#0c1810] border rounded-2xl overflow-hidden transition-all duration-200
        ${isDisabled ? "border-red-900/40 opacity-60" : "border-emerald-900/50 hover:border-emerald-700/80 hover:shadow-lg hover:shadow-emerald-900/20"}
      `}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${isDisabled ? "bg-red-800" : "bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-600"}`} />

      <div className="p-4 flex flex-col gap-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base truncate">{table.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">9 Card Table</p>
          </div>
          {/* Lock badge */}
          {table.locked && (
            <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/50 rounded-full px-2 py-0.5 shrink-0">
              🔒 Locked
            </span>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#111f16] rounded-xl p-2.5 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Boot</p>
            <p className="text-emerald-400 font-bold text-sm">₹{table.bootAmount}</p>
          </div>
          <div className="bg-[#111f16] rounded-xl p-2.5 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Players</p>
            <p className="text-white font-bold text-sm">
              {count}<span className="text-gray-600">/{table.maxPlayers}</span>
            </p>
          </div>
          <div className="bg-[#111f16] rounded-xl p-2.5 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Status</p>
            <p className={`font-bold text-sm ${statusColor(table.status)}`}>
              {statusLabel(table.status)}
            </p>
          </div>
        </div>

        {/* Player Slots */}
        <div className="flex gap-1.5">
          {Array.from({ length: table.maxPlayers }).map((_, i) => {
            const uid = table.playerOrder[i];
            const player = uid ? table.players[uid] : null;
            return (
              <div
                key={i}
                className={`flex-1 h-8 rounded-lg flex items-center justify-center text-xs ${
                  player
                    ? "bg-emerald-900/40 border border-emerald-700/50 text-emerald-300"
                    : "bg-[#0e1a14] border border-dashed border-gray-700/50 text-gray-600"
                }`}
              >
                {player ? (
                  <span className="truncate px-1 text-[10px]">
                    {player.displayName.split(" ")[0]}
                  </span>
                ) : (
                  <span>Empty</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {alreadyIn ? (
            <button
              onClick={() => onJoin(table.id)}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition"
            >
              Rejoin →
            </button>
          ) : (
            <button
              onClick={() => onJoin(table.id)}
              disabled={!canJoin}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition ${
                canJoin
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-gray-800 text-gray-600 cursor-not-allowed"
              }`}
            >
              {isFull ? "Full" : isInGame ? "In Game" : table.locked ? "Locked" : isDisabled ? "Disabled" : "Join Table"}
            </button>
          )}
        </div>

        {/* Admin Controls */}
        {isAdmin && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-800/60">
            <button
              onClick={() => onToggle(table.id, !isDisabled)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                isDisabled
                  ? "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                  : "bg-red-900/30 text-red-400 hover:bg-red-900/50"
              }`}
            >
              {isDisabled ? "Enable" : "Disable"}
            </button>
            <button
              onClick={() => onLock(table.id, !table.locked)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition"
            >
              {table.locked ? "Unlock" : "Lock"}
            </button>
            <button
              onClick={() => onDelete(table.id)}
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-red-900/30 text-red-500 hover:bg-red-900/50 transition"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Lobby ──────────────────────────────────
export default function NineCardGameLobby() {
  const navigate = useNavigate();
  const { user, userProfile } =  useAuth();
  const [tables, setTables] = useState<NineCardTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "playing">("all");

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    const unsub = subscribeLobby((all) => {
      setTables(all);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleJoin = useCallback(async (tableId: string) => {
    if (!user) return;
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    // Already in table → navigate directly
    if (table.players[user.uid]) {
      navigate(`/nine-card/${tableId}`);
      return;
    }

    setJoiningId(tableId);
    setError("");
    try {
      await joinTable(tableId, user.uid, user.displayName || "Player", user.photoURL || undefined);
      navigate(`/nine-card/${tableId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoiningId(null);
    }
  }, [user, tables, navigate]);

  const handleToggle = useCallback(async (tableId: string, disable: boolean) => {
    try { await adminToggleTable(tableId, disable); }
    catch (e: any) { setError(e.message); }
  }, []);

  const handleLock = useCallback(async (tableId: string, locked: boolean) => {
    try { await adminToggleLock(tableId, locked); }
    catch (e: any) { setError(e.message); }
  }, []);

  const handleDelete = useCallback(async (tableId: string) => {
    if (!window.confirm("Delete this table?")) return;
    try { await adminDeleteTable(tableId); }
    catch (e: any) { setError(e.message); }
  }, []);

  const filtered = tables.filter(t => {
    if (filter === "open") return t.status === "waiting";
    if (filter === "playing") return t.status === "playing" || t.status === "booting";
    return true;
  });

  const openCount = tables.filter(t => t.status === "waiting").length;
  const liveCount = tables.filter(t => t.status === "playing").length;

  return (
    <div className="min-h-screen bg-[#070d09] text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#070d09]/95 backdrop-blur border-b border-emerald-900/30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center text-lg">
              🃏
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">9 Card Table</h1>
              <p className="text-[10px] text-gray-500 leading-none mt-0.5">
                {openCount} open · {liveCount} live
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <span className="text-sm">+</span> New Table
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => setError("")} className="text-red-600 hover:text-red-400 text-lg leading-none ml-3">×</button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-5">
          {(["all", "open", "playing"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition border ${
                filter === f
                  ? "bg-emerald-700 border-emerald-600 text-white"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              {f === "all" ? `All (${tables.length})` : f === "open" ? `Open (${openCount})` : `Live (${liveCount})`}
            </button>
          ))}
        </div>

        {/* Tables Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3">
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading tables…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <div className="text-4xl opacity-30">🃏</div>
            <p className="text-gray-500 text-sm">
              {filter === "all" ? "No tables yet." : `No ${filter} tables.`}
            </p>
            {isAdmin && filter === "all" && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-emerald-400 text-sm hover:text-emerald-300 underline"
              >
                Create the first table
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(table => (
              <TableCard
                key={table.id}
                table={table}
                currentUid={user?.uid || ""}
                isAdmin={isAdmin}
                onJoin={joiningId ? () => {} : handleJoin}
                onToggle={handleToggle}
                onLock={handleLock}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Game Rules */}
        <div className="mt-8 bg-[#0a1410] border border-emerald-900/30 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-emerald-400 mb-3">How to Play — 9 Card Table</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-400 leading-relaxed">
            <div className="space-y-2">
              <p><span className="text-white font-medium">🃏 Cards:</span> 2 cards dealt face down</p>
              <p><span className="text-white font-medium">👁️ Blind:</span> Play without seeing your cards</p>
              <p><span className="text-white font-medium">💰 Call:</span> Match opponent's bet to continue</p>
              <p><span className="text-white font-medium">🏳️ Pack:</span> Fold — opponent wins the pot</p>
            </div>
            <div className="space-y-2">
              <p><span className="text-white font-medium">Number + Number:</span> Sum's last digit</p>
              <p><span className="text-white font-medium">Number + A/K/Q/J:</span> Only number counts</p>
              <p><span className="text-white font-medium">English + English:</span> Draw / compare rank</p>
              <p><span className="text-white font-medium">Show:</span> Compare hands after matching bet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && user && (
        <CreateTableModal
          adminUid={user.uid}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
