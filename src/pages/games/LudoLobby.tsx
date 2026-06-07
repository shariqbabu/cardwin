import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeLobby, joinTable } from '../../firebase/ludo';
import { LudoTable } from '../../types';
import { Play, Users, Loader2, Coins, Swords } from 'lucide-react';
import toast from 'react-hot-toast';

const LudoLobby: React.FC = () => {
  const { user, wallet } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<LudoTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeLobby(data => {
      setTables(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleJoin = async (table: LudoTable) => {
    if (!user) return toast.error('Login required');
    if (!wallet) return toast.error('Wallet not loaded');

    const balance = (wallet.depositBalance || 0) + (wallet.winningBalance || 0);
    if (balance < table.entryFee) {
      return toast.error(`Need ₹${table.entryFee}. Balance: ₹${balance}`);
    }

    setJoining(table.id);
    try {
      await joinTable(table.id, user.uid, user.name || 'Player');
      toast.success(`Joined Table #${table.tableNumber}`);
      navigate(`/games/ludo/${table.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to join');
    } finally {
      setJoining(null);
    }
  };

  // ─── LOADING ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading tables...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-6">

        {/* ─── HEADER ─────────────────────────────────── */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1">
            <Swords className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400" />
            <h1 className="text-xl sm:text-3xl font-black text-white">Ludo Arena</h1>
          </div>
          <p className="text-gray-400 text-xs sm:text-sm">Join a table, play against real players</p>
        </div>

        {/* ─── STATS ──────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-2 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-black text-yellow-400">{tables.length}</p>
            <p className="text-gray-500 text-[10px] sm:text-xs">Tables</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-2 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-black text-emerald-400">
              {tables.filter(t => t.status === 'waiting').length}
            </p>
            <p className="text-gray-500 text-[10px] sm:text-xs">Available</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-2 sm:p-3 text-center">
            <p className="text-lg sm:text-2xl font-black text-amber-400">
              {tables.filter(t => t.status === 'playing').length}
            </p>
            <p className="text-gray-500 text-[10px] sm:text-xs">Playing</p>
          </div>
        </div>

        {/* ─── TABLES ─────────────────────────────────── */}
        {tables.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-10 text-center">
            <Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-base sm:text-lg">No tables available</p>
            <p className="text-gray-600 text-xs mt-1">Admin hasn't created any tables yet</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {tables.map(table => {
              const isFull = table.players.length >= 2;
              const isPlaying = table.status === 'playing';
              const myTable = table.players.some(p => p.uid === user?.uid);
              const isJoining = joining === table.id;

              return (
                <div key={table.id}
                  className={`bg-gray-900 border rounded-xl p-3 sm:p-4 transition-all
                    ${myTable ? 'border-yellow-500/60 bg-yellow-500/5' :
                      isFull ? 'border-gray-700 opacity-60' :
                      'border-gray-800 hover:border-emerald-500/50'}`}>

                  {/* ── MOBILE: Stack Layout ─────────────── */}
                  <div className="sm:hidden">
                    {/* Row 1: Table number + Status */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-black text-sm">#{table.tableNumber}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm leading-tight">Table {table.tableNumber}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isPlaying && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">LIVE</span>
                            )}
                            {myTable && (
                              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">YOURS</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Info chips */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1">
                        <Coins className="w-3 h-3 text-yellow-400" />
                        <span className="text-yellow-400 font-bold text-xs">₹{table.entryFee}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                        <span className="text-emerald-400 font-bold text-xs">Win ₹{Math.floor(table.entryFee * 1.9)}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
                        <Users className="w-3 h-3 text-gray-500" />
                        <span className={`text-xs font-medium ${isFull ? 'text-red-400' : 'text-emerald-400'}`}>
                          {table.players.length}/2
                        </span>
                      </div>
                    </div>

                    {/* Row 3: Button */}
                    <div>
                      {isPlaying && !myTable ? (
                        <div className="w-full flex items-center justify-center gap-1.5 text-amber-400 text-sm font-medium bg-amber-500/10 py-2.5 rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          In Progress
                        </div>
                      ) : myTable ? (
                        <button onClick={() => navigate(`/games/ludo/${table.id}`)}
                          className="w-full flex items-center justify-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold py-2.5 rounded-xl transition-all">
                          <Play className="w-4 h-4" /> Rejoin
                        </button>
                      ) : isFull ? (
                        <div className="w-full text-center text-xs text-gray-500 bg-gray-800 py-2.5 rounded-xl">Full</div>
                      ) : (
                        <button onClick={() => handleJoin(table)} disabled={isJoining}
                          className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 transition-all">
                          {isJoining ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              Join ₹{table.entryFee}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── DESKTOP: Horizontal Layout ───────── */}
                  <div className="hidden sm:flex items-center justify-between gap-3">
                    {/* Left */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-black text-sm">#{table.tableNumber}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm truncate">Table {table.tableNumber}</h3>
                          {isPlaying && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0">LIVE</span>}
                          {myTable && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full flex-shrink-0">YOURS</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <div className="flex items-center gap-1">
                            <Coins className="w-3 h-3 text-yellow-400" />
                            <span className="text-yellow-400 font-bold text-xs">₹{table.entryFee}</span>
                          </div>
                          <span className="text-emerald-400 text-xs">Win ₹{Math.floor(table.entryFee * 1.9)}</span>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-gray-500" />
                            <span className={`text-xs ${isFull ? 'text-red-400' : 'text-emerald-400'}`}>{table.players.length}/2</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right */}
                    <div className="flex-shrink-0">
                      {isPlaying && !myTable ? (
                        <div className="flex items-center gap-1.5 text-amber-400 text-sm bg-amber-500/10 px-4 py-2 rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin" /> Playing
                        </div>
                      ) : myTable ? (
                        <button onClick={() => navigate(`/games/ludo/${table.id}`)}
                          className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold px-5 py-2 rounded-xl transition-all">
                          <Play className="w-4 h-4" /> Rejoin
                        </button>
                      ) : isFull ? (
                        <span className="text-xs text-gray-500 bg-gray-800 px-4 py-2 rounded-xl">Full</span>
                      ) : (
                        <button onClick={() => handleJoin(table)} disabled={isJoining}
                          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-50 transition-all">
                          {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> Join ₹{table.entryFee}</>}
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LudoLobby;
