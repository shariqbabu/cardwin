// src/pages/games/PokerLobby.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  subscribePokerTables, PokerTable, SpectatorEntry,
} from '../../firebase/poker';
import { pokerJoin } from '../../utils/gameApi';
import { formatCurrency, calculateUsableBalance } from '../../utils/helpers';
import {
  Users, ChevronRight, Loader2, X, Lock,
  Clock, Spade, Shield, AlertCircle, Eye,
} from 'lucide-react';

type JoinStatus = 'rejoin' | 'spectating' | 'watch' | 'join';

const getJoinStatus = (table: PokerTable, uid?: string): JoinStatus => {
  if (!uid) return 'join';
  if (table.players.some(p => p.uid === uid)) return 'rejoin';
  if ((table.spectatorQueue || []).some((s: SpectatorEntry) => s.uid === uid))
    return 'spectating';
  if (table.players.length >= 6 || table.status === 'playing') return 'watch';
  return 'join';
};

const PokerLobbyPage: React.FC = () => {
  const { user, wallet } = useAuth();
  const navigate = useNavigate();

  const [tables, setTables]               = useState<PokerTable[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showJoin, setShowJoin]           = useState(false);
  const [selectedTable, setSelectedTable] = useState<PokerTable | null>(null);
  const [joining, setJoining]             = useState(false);
  const [buyIn, setBuyIn]                 = useState(0);
  const [error, setError]                 = useState('');

  const usable = wallet ? calculateUsableBalance(wallet) : 0;

  useEffect(() => {
    return subscribePokerTables((data) => {
      setTables(data);
      setLoading(false);
    });
  }, []);

  const handleOpenJoin = (table: PokerTable) => {
    const status = getJoinStatus(table, user?.uid);
    if (status === 'rejoin' || status === 'spectating') {
      navigate(`/games/poker/${table.id}`);
      return;
    }
    setSelectedTable(table);
    setBuyIn(table.minBuyIn);
    setError('');
    setShowJoin(true);
  };

  // Watch as spectator — buyIn = 0
  const handleWatch = async (table: PokerTable) => {
    if (!user) return;
    setJoining(true);
    try {
      await pokerJoin(
        table.id,
        user.displayName || 'Player',
        user.photoURL    || '',
        0,  // spectator — no buy-in
      );
    } catch {
      // Already spectating — just navigate
    } finally {
      setJoining(false);
      navigate(`/games/poker/${table.id}`);
    }
  };

  const handleJoin = async () => {
    if (!user || !selectedTable) return;
    setError('');

    if (buyIn < selectedTable.minBuyIn) {
      setError(`Min buy-in: ${formatCurrency(selectedTable.minBuyIn)}`); return;
    }
    if (buyIn > selectedTable.maxBuyIn) {
      setError(`Max buy-in: ${formatCurrency(selectedTable.maxBuyIn)}`); return;
    }
    if (usable < buyIn) {
      setError('Insufficient balance'); return;
    }

    setJoining(true);
    try {
      // ✅ API call — wallet deduction server side hogi
      await pokerJoin(
        selectedTable.id,
        user.displayName || 'Player',
        user.photoURL    || '',
        buyIn,
      );
      setShowJoin(false);
      navigate(`/games/poker/${selectedTable.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const getStakeLabel = (table: PokerTable) => {
    const bb = table.bigBlind;
    if (bb <= 10)  return { label: 'Micro',  color: 'text-gray-400' };
    if (bb <= 20)  return { label: 'Low',    color: 'text-emerald-400' };
    if (bb <= 50)  return { label: 'Medium', color: 'text-blue-400' };
    if (bb <= 100) return { label: 'High',   color: 'text-purple-400' };
    return           { label: 'VIP',    color: 'text-yellow-400' };
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading tables...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-6">
      <div className="max-w-4xl mx-auto px-3 py-4 md:px-6 md:py-6">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
              <Spade className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black">Texas Hold'em</h1>
              <p className="text-gray-500 text-xs">Join a table • Min 2 players to start</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
          {[
            { label: 'Tables',  value: tables.length,                                          color: 'text-purple-400', icon: '🎰' },
            { label: 'Players', value: tables.reduce((s, t) => s + t.players.length, 0),       color: 'text-blue-400',   icon: '👥' },
            { label: 'Balance', value: formatCurrency(usable),                                  color: 'text-yellow-400', icon: '💰' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-gray-900 border border-gray-700/50 rounded-xl p-3 text-center">
              <p className="text-lg">{icon}</p>
              <p className={`font-black text-sm ${color}`}>{value}</p>
              <p className="text-gray-600 text-xs">{label}</p>
            </div>
          ))}
        </div>

        {/* Tables */}
        {tables.length === 0 ? (
          <div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-dashed border-gray-700">
            <Spade className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <h3 className="text-white font-bold mb-1">No Tables Available</h3>
            <p className="text-gray-600 text-sm">Admin will add tables soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tables.map(table => {
              const stakeInfo  = getStakeLabel(table);
              const joinStatus = getJoinStatus(table, user?.uid);
              const spectators = (table.spectatorQueue || []).length;
              const isFull     = table.players.length >= 6;
              const isPlaying  = table.status === 'playing';

              return (
                <div
                  key={table.id}
                  className="bg-gray-900 border border-gray-700/40 rounded-2xl overflow-hidden
                    hover:border-purple-500/40 transition-all hover:shadow-lg hover:shadow-purple-500/10"
                >
                  <div className="bg-gradient-to-r from-purple-900/25 to-indigo-900/15 border-b border-gray-700/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-base truncate">{table.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-bold ${stakeInfo.color}`}>{stakeInfo.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            isPlaying
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                              : table.players.length >= 2
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          }`}>
                            {isPlaying ? 'Active' : table.players.length >= 2 ? 'Ready' : 'Waiting'}
                          </span>
                          {spectators > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-500 border border-gray-700/50 bg-gray-800/50 px-1.5 py-0.5 rounded-full">
                              <Eye className="w-2.5 h-2.5" /> {spectators} watching
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {[...Array(Math.min(6, Math.max(table.players.length + 1, 2)))].map((_, i) => {
                          const player = table.players[i];
                          const isMe   = player?.uid === user?.uid;
                          return (
                            <div key={i} className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                              player ? isMe ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-600 border-gray-500 text-white'
                                     : 'bg-gray-800 border-gray-700 text-gray-600'
                            }`}>
                              {player ? player.name.charAt(0).toUpperCase() : '·'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 md:p-4">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {([
                        ['Blinds',     `${formatCurrency(table.smallBlind)}/${formatCurrency(table.bigBlind)}`],
                        ['Players',    `${table.players.length}/6`],
                        ['Min Buy-in', formatCurrency(table.minBuyIn)],
                        ['Max Buy-in', formatCurrency(table.maxBuyIn)],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} className="bg-gray-800/60 rounded-lg p-2">
                          <p className="text-gray-500 text-xs mb-0.5">{label}</p>
                          <p className="text-white font-bold text-xs">{value}</p>
                        </div>
                      ))}
                    </div>

                    {table.players.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1">
                        {table.players.map(p => (
                          <span key={p.uid} className={`text-xs px-2 py-0.5 rounded-full border ${
                            p.uid === user?.uid
                              ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}>
                            {p.uid === user?.uid ? '👤 You' : p.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 1. Rejoin */}
                    {joinStatus === 'rejoin' && (
                      <button
                        onClick={() => navigate(`/games/poker/${table.id}`)}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold
                          py-2.5 rounded-xl hover:from-purple-500 hover:to-indigo-500 transition-all
                          flex items-center justify-center gap-2 text-sm active:scale-95"
                      >
                        Return to Table <ChevronRight className="w-4 h-4" />
                      </button>
                    )}

                    {/* 2. Spectating */}
                    {joinStatus === 'spectating' && (
                      <button
                        onClick={() => navigate(`/games/poker/${table.id}`)}
                        className="w-full bg-blue-900/40 border border-blue-500/40 text-blue-300 font-bold
                          py-2.5 rounded-xl hover:bg-blue-900/60 transition-all
                          flex items-center justify-center gap-2 text-sm active:scale-95"
                      >
                        <Eye className="w-4 h-4" /> Back to Watching
                      </button>
                    )}

                    {/* 3. Watch */}
                    {joinStatus === 'watch' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleWatch(table)}
                          disabled={joining}
                          className="flex-1 bg-blue-900/40 border border-blue-500/40 text-blue-300 font-bold
                            py-2.5 rounded-xl hover:bg-blue-900/60 transition-all
                            flex items-center justify-center gap-2 text-sm active:scale-95 disabled:opacity-50"
                        >
                          {joining
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <><Eye className="w-4 h-4" /> Watch</>}
                        </button>
                        <div className="flex items-center gap-1 bg-gray-800/60 border border-gray-700/40 px-3 rounded-xl">
                          {isFull
                            ? <><Lock className="w-3.5 h-3.5 text-gray-500" /><span className="text-gray-500 text-xs">Full</span></>
                            : <><Clock className="w-3.5 h-3.5 text-amber-500" /><span className="text-amber-500 text-xs">Live</span></>}
                        </div>
                      </div>
                    )}

                    {/* 4. Join */}
                    {joinStatus === 'join' && (
                      <button
                        onClick={() => handleOpenJoin(table)}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold
                          py-2.5 rounded-xl hover:from-purple-500 hover:to-indigo-500 transition-all
                          flex items-center justify-center gap-2 text-sm active:scale-95"
                      >
                        Join Table <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rules */}
        <div className="mt-5 bg-gray-900/50 border border-gray-700/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-gray-500 space-y-1">
              <p><span className="text-gray-400 font-medium">How to play:</span> Join admin-created table. 2+ players needed.</p>
              <p>Uses <span className="text-yellow-400">deposit</span> + <span className="text-emerald-400">winning balance</span>. Winnings auto-credited.</p>
              <p>Leave anytime — remaining chips returned to winning balance.</p>
              <p><span className="text-blue-400 font-medium">👁 Watch mode:</span> Full tables can still be watched.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Join Modal */}
      {showJoin && selectedTable && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-t-3xl md:rounded-2xl p-5 w-full md:max-w-md shadow-2xl">
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white text-lg font-bold">Join Table</h3>
                <p className="text-gray-500 text-xs">{selectedTable.name}</p>
              </div>
              <button
                onClick={() => setShowJoin(false)}
                className="text-gray-600 hover:text-white p-1.5 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="bg-gray-800/60 rounded-xl p-3.5 mb-4 space-y-2">
              {([
                ['Blinds',       `${formatCurrency(selectedTable.smallBlind)}/${formatCurrency(selectedTable.bigBlind)}`],
                ['Players',      `${selectedTable.players.length}/6`],
                ['Min Buy-in',   formatCurrency(selectedTable.minBuyIn)],
                ['Max Buy-in',   formatCurrency(selectedTable.maxBuyIn)],
                ['Your Balance', formatCurrency(usable)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className={label === 'Your Balance' ? 'text-yellow-400 font-bold' : 'text-white font-medium'}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="text-gray-400 text-xs mb-2 block uppercase tracking-wider">
                Buy-in Amount
              </label>
              <div className="flex gap-2 mb-2">
                {[
                  selectedTable.minBuyIn,
                  Math.round((selectedTable.minBuyIn + selectedTable.maxBuyIn) / 2),
                  selectedTable.maxBuyIn,
                ].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBuyIn(Math.min(amount, usable))}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors font-medium ${
                      buyIn === Math.min(amount, usable)
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-purple-500/50'
                    }`}
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">₹</span>
                <input
                  type="number"
                  value={buyIn}
                  onChange={e => setBuyIn(Number(e.target.value))}
                  min={selectedTable.minBuyIn}
                  max={Math.min(selectedTable.maxBuyIn, usable)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-8 pr-4 py-3
                    text-white text-sm font-bold focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <p className="text-gray-600 text-xs mt-1">
                Min: {formatCurrency(selectedTable.minBuyIn)} •
                Max: {formatCurrency(Math.min(selectedTable.maxBuyIn, usable))}
              </p>
            </div>

            <button
              onClick={handleJoin}
              disabled={joining || buyIn < selectedTable.minBuyIn || buyIn > usable}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold
                py-3.5 rounded-xl hover:from-purple-500 hover:to-indigo-500 transition-all
                disabled:opacity-50 flex items-center justify-center gap-2 text-sm active:scale-95"
            >
              {joining
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                : `Join with ${formatCurrency(buyIn)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerLobbyPage;
