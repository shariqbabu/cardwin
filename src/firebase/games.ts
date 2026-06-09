// src/firebase/games.ts
import {
  doc, collection, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, query, where, getDocs,
  orderBy, limit, increment, arrayUnion, addDoc, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  GameRoom, MatchmakingQueue, ColorPredictionRound,
  ColorChoice, PlayerInfo, AndarBaharGame, ABBet, Card,
} from '../types';
import { addFunds, deductFunds } from './wallet';

// ===================== MATCHMAKING =====================
export const joinMatchmakingQueue = async (
  uid: string, userName: string, photoURL: string,
  entryFee: number, gameType: string
): Promise<string> => {
  const existingQ = query(
    collection(db, 'matchmakingQueue'),
    where('uid', '==', uid),
    where('status', '==', 'WAITING')
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) return existingSnap.docs[0].id;

  const qRef = await addDoc(collection(db, 'matchmakingQueue'), {
    uid, userName, photoURL: photoURL || '', entryFee, gameType,
    status: 'WAITING', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return qRef.id;
};

export const cancelMatchmaking = async (queueId: string) => {
  await updateDoc(doc(db, 'matchmakingQueue', queueId), {
    status: 'CANCELLED', updatedAt: serverTimestamp(),
  });
};

export const subscribeMatchmakingQueue = (
  queueId: string,
  callback: (entry: MatchmakingQueue | null) => void
) => {
  return onSnapshot(doc(db, 'matchmakingQueue', queueId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as MatchmakingQueue) : null);
  });
};

export const findMatch = async (
  uid: string, queueId: string, entryFee: number, gameType: string
): Promise<string | null> => {
  const q = query(
    collection(db, 'matchmakingQueue'),
    where('status', '==', 'WAITING'),
    where('entryFee', '==', entryFee),
    where('gameType', '==', gameType),
    orderBy('createdAt', 'asc'),
    limit(10)
  );
  const snap = await getDocs(q);
  const allWaiting = snap.docs;
  const myEntry = allWaiting.find((d) => d.id === queueId);
  if (!myEntry) return null;
  const others = allWaiting.filter((d) => d.data().uid !== uid);
  if (others.length === 0) return null;
  const myCreatedAt = myEntry.data().createdAt?.toMillis?.() ?? 0;
  const opponent = others[0];
  const opponentCreatedAt = opponent.data().createdAt?.toMillis?.() ?? 0;
  if (myCreatedAt <= opponentCreatedAt) return null;

  const roomRef = doc(collection(db, 'gameRooms'));
  const roomId = roomRef.id;

  try {
    await runTransaction(db, async (tx) => {
      const myQueueRef = doc(db, 'matchmakingQueue', queueId);
      const opponentQueueRef = doc(db, 'matchmakingQueue', opponent.id);
      const [mySnap, oppSnap] = await Promise.all([
        tx.get(myQueueRef),
        tx.get(opponentQueueRef),
      ]);
      if (!mySnap.exists() || !oppSnap.exists()) throw new Error('Queue entry not found');
      if (mySnap.data().status !== 'WAITING' || oppSnap.data().status !== 'WAITING')
        throw new Error('Already matched');
      const myData  = mySnap.data();
      const oppData = oppSnap.data();
      const player1: PlayerInfo = {
        uid: oppData.uid, name: oppData.userName, photoURL: oppData.photoURL || '',
      };
      const player2: PlayerInfo = {
        uid: myData.uid, name: myData.userName, photoURL: myData.photoURL || '',
      };
      tx.set(roomRef, {
        roomId, gameType, entryFee, status: 'WAITING', player1, player2,
        winner: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      tx.update(myQueueRef,       { status: 'MATCHED', roomId, updatedAt: serverTimestamp() });
      tx.update(opponentQueueRef, { status: 'MATCHED', roomId, updatedAt: serverTimestamp() });
    });
  } catch (err: any) {
    if (err.message === 'Already matched') return null;
    throw err;
  }
  return roomId;
};

// ===================== GAME ROOMS =====================
export const subscribeGameRoom = (
  roomId: string,
  callback: (room: GameRoom | null) => void
) => {
  return onSnapshot(doc(db, 'gameRooms', roomId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as GameRoom) : null);
  });
};

export const startCardGame = async (roomId: string) => {
  const roomRef  = doc(db, 'gameRooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room not found');
  const room = roomSnap.data() as GameRoom;
  if (room.status !== 'WAITING') return;
  const suits = ['♠', '♥', '♦', '♣'];
  const card1  = Math.floor(Math.random() * 13) + 1;
  const card2  = Math.floor(Math.random() * 13) + 1;
  const suit1  = suits[Math.floor(Math.random() * 4)];
  const suit2  = suits[Math.floor(Math.random() * 4)];
  let winnerId   = '';
  let winnerName = '';
  if (card1 > card2)      { winnerId = room.player1!.uid; winnerName = room.player1!.name; }
  else if (card2 > card1) { winnerId = room.player2!.uid; winnerName = room.player2!.name; }
  else                    { winnerId = 'TIE'; winnerName = 'TIE'; }
  await updateDoc(roomRef, {
    status: 'PLAYING',
    'player1.card': card1, 'player1.cardSuit': suit1,
    'player2.card': card2, 'player2.cardSuit': suit2,
    updatedAt: serverTimestamp(),
  });
  setTimeout(async () => {
    await settleCardGame(
      roomId, winnerId, winnerName, room.entryFee, room.player1!, room.player2!
    );
  }, 3000);
};

export const settleCardGame = async (
  roomId: string, winnerId: string, winnerName: string,
  entryFee: number, player1: PlayerInfo, player2: PlayerInfo
) => {
  const roomRef = doc(db, 'gameRooms', roomId);
  if (winnerId === 'TIE') {
    await Promise.all([
      addFunds(player1.uid, entryFee, 'winningBalance', 'Card game - Tie refund', 'REFUND'),
      addFunds(player2.uid, entryFee, 'winningBalance', 'Card game - Tie refund', 'REFUND'),
    ]);
    await updateDoc(roomRef, {
      status: 'FINISHED', winner: 'TIE', winnerName: 'TIE', updatedAt: serverTimestamp(),
    });
  } else {
    const loserId = winnerId === player1.uid ? player2.uid : player1.uid;
    const payout  = entryFee * 2 - entryFee * 0.1;
    await addFunds(winnerId, payout, 'winningBalance', `Card game win - ₹${payout}`);
    await updateDoc(roomRef, {
      status: 'FINISHED', winner: winnerId, winnerName, updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'transactions'), {
      uid: loserId, type: 'GAME_LOSS', amount: -entryFee,
      previousBalance: 0, currentBalance: 0, status: 'COMPLETED',
      description: 'Card game loss', createdAt: serverTimestamp(),
    });
  }
  await Promise.all([
    sendGameNotification(player1.uid, winnerId === player1.uid, 'Card Battle', entryFee),
    sendGameNotification(player2.uid, winnerId === player2.uid, 'Card Battle', entryFee),
  ]);
};

// ===================== COLOR PREDICTION =====================
export const subscribeColorGame = (
  callback: (round: ColorPredictionRound | null) => void
) => {
  const q = query(
    collection(db, 'colorPredictionGames'),
    orderBy('roundNumber', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.empty
        ? null
        : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as ColorPredictionRound)
    );
  });
};

export const getColorGameHistory = async (limitCount = 10) => {
  const q = query(
    collection(db, 'colorPredictionGames'),
    orderBy('roundNumber', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ColorPredictionRound));
};

export const placeBet = async (
  uid: string, userName: string, roundId: string,
  color: ColorChoice, amount: number
) => {
  const roundRef  = doc(db, 'colorPredictionGames', roundId);
  const roundSnap = await getDoc(roundRef);
  if (!roundSnap.exists()) throw new Error('Round not found');
  const round = roundSnap.data() as ColorPredictionRound;
  if (round.status !== 'BETTING') throw new Error('Betting is closed');
  const existingBet = round.bets?.find((b: any) => b.uid === uid);
  if (existingBet) throw new Error('Already placed a bet in this round');
  await deductFunds(uid, amount, 'GAME_LOSS', `Color prediction bet - ${color}`);
  const multiplier = color === 'VIOLET' ? 3 : 2;
  await updateDoc(roundRef, {
    bets: [...(round.bets || []), { uid, userName, color, amount, multiplier, settled: false }],
    updatedAt: serverTimestamp(),
  });
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const subscribeNotifications = (
  uid: string,
  cb: (notifications: any[]) => void
) => {
  const q = query(
    collection(db, 'notifications'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

export const markNotificationRead = async (notifId: string): Promise<void> => {
  await updateDoc(doc(db, 'notifications', notifId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
};
