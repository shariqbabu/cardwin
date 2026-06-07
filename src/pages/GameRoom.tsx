import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Clock, Home, Crown, Frown } from 'lucide-react';
import { subscribeGameRoom, startCardGame } from '../firebase/games';
import { useAuth } from '../context/AuthContext';
import { GameRoom as GameRoomType } from '../types';
import { formatCurrency, getCardName, getCardSuit } from '../utils/helpers';
import { Loader2 } from 'lucide-react';

const CARD_SUITS = ['♠', '♥', '♦', '♣'];

const suitColor = (suit: string) =>
  suit === '♥' || suit === '♦'
    ? 'text-red-500'
    : 'text-black';

const PlayingCard: React.FC<{ value?: number; suit?: string; hidden?: boolean; revealed?: boolean }> = ({
  value,
  suit,
  hidden = false,
  revealed = false,
}) => {
  return (
    <motion.div
      initial={revealed ? { rotateY: 180, scale: 0.8 } : {}}
      animate={revealed ? { rotateY: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, type: 'spring' }}
      className={`w-24 h-36 rounded-2xl border-2 flex flex-col items-center justify-center shadow-2xl ${
        hidden
          ? 'bg-gradient-to-br from-blue-800 to-indigo-900 border-blue-500/50'
          : 'bg-gradient-to-br from-gray-100 to-white border-white/50'
      }`}
    >
      {hidden ? (
        <div className="text-4xl opacity-30">🃏</div>
      ) : (
        <>
          <div className={`text-3xl font-bold ${suitColor(suit || '♠')}`}>
            {getCardName(value || 1)}
          </div>
          <div className={`text-4xl ${suitColor(suit || '♠')}`}>{suit}</div>
        </>
      )}
    </motion.div>
  );
};

export const GameRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [room, setRoom] = useState<GameRoomType | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const unsub = subscribeGameRoom(roomId, (r) => {
      setRoom(r);
      setLoading(false);

      if (r?.status === 'WAITING' && !gameStarted && r.player1 && r.player2) {
        // Both players joined, start game
        setGameStarted(true);
        setTimeout(() => {
          startCardGame(roomId);
        }, 2000);
      }
    });

    return () => unsub();
  }, [roomId, gameStarted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Room not found</p>
        <button onClick={() => navigate('/matchmaking')} className="mt-4 text-yellow-400">
          Back to Matchmaking
        </button>
      </div>
    );
  }

  const isPlayer1 = firebaseUser?.uid === room.player1?.uid;
  const myPlayer = isPlayer1 ? room.player1 : room.player2;
  const opponent = isPlayer1 ? room.player2 : room.player1;
  const iWon = room.winner === firebaseUser?.uid;
  const tieGame = room.winner === 'TIE';

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h2 className="text-2xl font-bold text-white">🃏 Card Battle</h2>
        <p className="text-gray-400 text-sm">Entry Fee: {formatCurrency(room.entryFee)}</p>
      </motion.div>

      {/* Status */}
      <div className={`rounded-2xl p-3 text-center border text-sm font-semibold ${
        room.status === 'WAITING' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
        room.status === 'PLAYING' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
        room.status === 'FINISHED' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
        'bg-red-500/10 border-red-500/20 text-red-400'
      }`}>
        {room.status === 'WAITING' && '⏳ Waiting for game to start...'}
        {room.status === 'PLAYING' && '🎮 Cards are being revealed...'}
        {room.status === 'FINISHED' && (tieGame ? '🤝 It\'s a Tie!' : iWon ? '🎉 You Won!' : '😔 You Lost!')}
        {room.status === 'CANCELLED' && '❌ Game Cancelled'}
      </div>

      {/* Players & Cards */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          {/* Opponent */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
              {opponent?.name?.charAt(0).toUpperCase() || '?'}
            </div>
            <p className="text-sm text-gray-300 text-center max-w-[80px] truncate">{opponent?.name || 'Waiting...'}</p>

            <AnimatePresence>
              {room.status === 'WAITING' || room.status === 'PLAYING' ? (
                opponent ? (
                  <PlayingCard hidden />
                ) : (
                  <div className="w-24 h-36 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
                  </div>
                )
              ) : (
                <PlayingCard
                  value={isPlayer1 ? room.player2?.card : room.player1?.card}
                  suit={isPlayer1 ? room.player2?.cardSuit : room.player1?.cardSuit}
                  revealed
                />
              )}
            </AnimatePresence>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-gray-500">VS</div>
            {room.status === 'FINISHED' && !tieGame && room.winner && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mt-2"
              >
                <Trophy className="w-6 h-6 text-yellow-400" />
              </motion.div>
            )}
          </div>

          {/* My card */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold">
              {myPlayer?.name?.charAt(0).toUpperCase() || 'Y'}
            </div>
            <p className="text-sm text-gray-300 text-center max-w-[80px] truncate">You</p>

            <AnimatePresence>
              {room.status === 'WAITING' || room.status === 'PLAYING' ? (
                <PlayingCard hidden />
              ) : (
                <PlayingCard
                  value={isPlayer1 ? room.player1?.card : room.player2?.card}
                  suit={isPlayer1 ? room.player1?.cardSuit : room.player2?.cardSuit}
                  revealed
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Result */}
      <AnimatePresence>
        {room.status === 'FINISHED' && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`rounded-2xl p-6 text-center border ${
              tieGame
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : iWon
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}
          >
            {tieGame ? (
              <>
                <div className="text-5xl mb-3">🤝</div>
                <h3 className="text-xl font-bold text-yellow-400">It's a Tie!</h3>
                <p className="text-gray-400 mt-1">Entry fee refunded</p>
              </>
            ) : iWon ? (
              <>
                <Crown className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-green-400">You Won!</h3>
                <p className="text-2xl font-bold text-yellow-400">+{formatCurrency(room.entryFee * 1.8)}</p>
                <p className="text-gray-400 text-sm mt-1">Added to winning balance</p>
              </>
            ) : (
              <>
                <Frown className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-red-400">You Lost</h3>
                <p className="text-gray-400 mt-1">Better luck next time!</p>
              </>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/matchmaking')}
              className="mt-4 flex items-center justify-center gap-2 w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold py-3 rounded-xl"
            >
              <Home className="w-4 h-4" />
              Play Again
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting animation */}
      {room.status === 'WAITING' && (
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Starting game...</span>
          </div>
          <div className="flex justify-center gap-2 mt-3">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                className="w-2 h-2 bg-yellow-400 rounded-full"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
