// src/firebase/games.ts
import {
  doc, collection, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, query, where, getDocs,
  orderBy, limit, increment, arrayUnion, addDoc, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  GameRoom, MatchmakingQueue, ColorPredictionRound,
  ColorChoice, PlayerInfo, AndarBaharGame,
  ABBet,
  Card,
} from '../types';
import { addFunds, deductFunds } from './wallet';
import { createDeck, shuffleDeck } from '../utils/cardHelpers';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

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
      const [mySnap, oppSnap] = await Promise.all([tx.get(myQueueRef), tx.get(opponentQueueRef)]);
      if (!mySnap.exists() || !oppSnap.exists()) throw new Error('Queue entry not found');
      if (mySnap.data().status !== 'WAITING' || oppSnap.data().status !== 'WAITING') throw new Error('Already matched');
      const myData = mySnap.data();
      const oppData = oppSnap.data();
      const player1: PlayerInfo = { uid: oppData.uid, name: oppData.userName, photoURL: oppData.photoURL || '' };
      const player2: PlayerInfo = { uid: myData.uid, name: myData.userName, photoURL: myData.photoURL || '' };
      tx.set(roomRef, {
        roomId, gameType, entryFee, status: 'WAITING', player1, player2,
        winner: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      tx.update(myQueueRef, { status: 'MATCHED', roomId, updatedAt: serverTimestamp() });
      tx.update(opponentQueueRef, { status: 'MATCHED', roomId, updatedAt: serverTimestamp() });
    });
  } catch (err: any) {
    if (err.message === 'Already matched') return null;
    throw err;
  }
  return roomId;
};

// ===================== GAME ROOMS =====================
export const subscribeGameRoom = (roomId: string, callback: (room: GameRoom | null) => void) => {
  return onSnapshot(doc(db, 'gameRooms', roomId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as GameRoom) : null);
  });
};

export const startCardGame = async (roomId: string) => {
  const roomRef = doc(db, 'gameRooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room not found');
  const room = roomSnap.data() as GameRoom;
  if (room.status !== 'WAITING') return;
  const suits = ['♠', '♥', '♦', '♣'];
  const card1 = Math.floor(Math.random() * 13) + 1;
  const card2 = Math.floor(Math.random() * 13) + 1;
  const suit1 = suits[Math.floor(Math.random() * 4)];
  const suit2 = suits[Math.floor(Math.random() * 4)];
  let winnerId = '';
  let winnerName = '';
  if (card1 > card2) { winnerId = room.player1!.uid; winnerName = room.player1!.name; }
  else if (card2 > card1) { winnerId = room.player2!.uid; winnerName = room.player2!.name; }
  else { winnerId = 'TIE'; winnerName = 'TIE'; }
  await updateDoc(roomRef, {
    status: 'PLAYING',
    'player1.card': card1, 'player1.cardSuit': suit1,
    'player2.card': card2, 'player2.cardSuit': suit2,
    updatedAt: serverTimestamp(),
  });
  setTimeout(async () => {
    await settleCardGame(roomId, winnerId, winnerName, room.entryFee, room.player1!, room.player2!);
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
    await updateDoc(roomRef, { status: 'FINISHED', winner: 'TIE', winnerName: 'TIE', updatedAt: serverTimestamp() });
  } else {
    const loserId = winnerId === player1.uid ? player2.uid : player1.uid;
    const payout = entryFee * 2 - entryFee * 0.1;
    await addFunds(winnerId, payout, 'winningBalance', `Card game win - ₹${payout}`);
    await updateDoc(roomRef, { status: 'FINISHED', winner: winnerId, winnerName, updatedAt: serverTimestamp() });
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
export const subscribeColorGame = (callback: (round: ColorPredictionRound | null) => void) => {
  const q = query(collection(db, 'colorPredictionGames'), orderBy('roundNumber', 'desc'), limit(1));
  return onSnapshot(q, (snap) => {
    callback(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as ColorPredictionRound));
  });
};

export const getColorGameHistory = async (limitCount = 10) => {
  const q = query(collection(db, 'colorPredictionGames'), orderBy('roundNumber', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ColorPredictionRound));
};

export const placeBet = async (
  uid: string, userName: string, roundId: string, color: ColorChoice, amount: number
) => {
  const roundRef = doc(db, 'colorPredictionGames', roundId);
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


// =====================================================
// CARD UTILITIES
// =====================================================
export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
  numericValue: number;
}

const createDeck = (): Card[] => {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const numericMap: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
  };
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value, numericValue: numericMap[value] });
    }
  }
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

export interface DragonTigerGame {
  id: string; status: DTStatus; roundNumber: number;
  dragonCard: Card | null; tigerCard: Card | null;
  bets: DTBet[]; winner: 'dragon' | 'tiger' | 'tie' | null;
  pot: number; bettingEndsAt: any; createdAt: any; updatedAt: any;
}
export interface PokerPlayer {
  uid: string; name: string; avatar: string; chips: number;
  holeCards: Card[]; bet: number; totalBet: number;
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'left';
  isDealer: boolean; isSmallBlind: boolean; isBigBlind: boolean;
  isTurn: boolean; handRank?: string; seatIndex: number; joinedAt: any;
}
export interface PokerTable {
  id: string; name: string; status: PokerStatus; phase: PokerPhase;
  minBuyIn: number; maxBuyIn: number; smallBlind: number; bigBlind: number;
  maxPlayers: 6; players: PokerPlayer[]; spectators: string[];
  communityCards: Card[]; pot: number; sidePots: number[];
  currentBet: number; dealerSeat: number; activePlayerUid: string | null;
  deck: Card[]; handNumber: number; createdBy: string;
  createdAt: any; updatedAt: any; lastActionAt: any;
}


// =====================================================
// POKER — PRODUCTION VERSION
// =====================================================
// Replaces the existing POKER section in games.ts
// All imports (firebase, Card, shuffleDeck, etc.) come from the parent file
// =====================================================

const POKER_COLLECTION = 'pokerTables';

// ─── Types ───────────────────────────────────────────
export type PokerStatus = 'waiting' | 'playing' | 'finished';
export type PokerPhase =
  | 'waiting'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown';

export interface PokerPlayer {
  uid: string;
  name: string;
  avatar: string;
  chips: number;
  holeCards: Card[];
  bet: number;              // bet in current round only
  totalBet: number;         // cumulative bet this hand
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'left' | 'disconnected';
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  hasActedThisRound: boolean; // NEW: tracks if player acted this betting round
  handRank?: string;
  seatIndex: number;
  joinedAt: any;
  disconnectedAt?: any;
}

export interface SpectatorEntry {
  uid: string;
  name: string;
  avatar: string;
  joinedAt: any; // FIFO queue — sorted by this
}

export interface SidePot {
  amount: number;
  eligibleUids: string[];
}

export interface PokerTable {
  id: string;
  name: string;
  status: PokerStatus;
  phase: PokerPhase;
  minBuyIn: number;
  maxBuyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: 6;
  players: PokerPlayer[];
  spectatorQueue: SpectatorEntry[]; // FIFO waiting queue
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  dealerSeat: number;
  activePlayerUid: string | null;
  turnExpiresAt: any;       // for 20-second timer
  deck: Card[];
  handNumber: number;
  createdBy: string;
  lastBrokePlayers: Array<{ uid: string; name: string }>;
  createdAt: any;
  updatedAt: any;
  lastActionAt: any;
}

// ─── Hand Evaluation (Best 5 from N cards) ───────────
const HAND_RANKS = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush 👑',
];

/**
 * Returns numeric rank (0–9) and hand name for the best 5-card hand
 * that can be made from the given cards (2 hole + up to 5 community).
 */
const evaluateBestHand = (
  cards: Card[]
): { rank: number; name: string; bestFive: Card[] } => {
  if (cards.length < 2) return { rank: 0, name: 'No Cards', bestFive: [] };

  // Generate all C(n,5) combinations if n >= 5, else use all cards
  const combos: Card[][] =
    cards.length <= 5
      ? [cards]
      : getCombinations(cards, 5);

  let best = { rank: -1, name: 'High Card', bestFive: combos[0] };
  for (const combo of combos) {
    const result = evaluateFiveCardHand(combo);
    if (result.rank > best.rank) {
      best = { ...result, bestFive: combo };
    }
  }
  return best;
};

const getCombinations = (arr: Card[], k: number): Card[][] => {
  const result: Card[][] = [];
  const combo = (start: number, current: Card[]) => {
    if (current.length === k) { result.push([...current]); return; }
    for (let i = start; i < arr.length; i++) {
      combo(i + 1, [...current, arr[i]]);
    }
  };
  combo(0, []);
  return result;
};

const evaluateFiveCardHand = (
  cards: Card[]
): { rank: number; name: string } => {
  const sorted = [...cards].sort((a, b) => b.numericValue - a.numericValue);
  const suits = sorted.map((c) => c.suit);
  const values = sorted.map((c) => c.numericValue);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = (() => {
    if (values.every((v, i) => i === 0 || v === values[i - 1] - 1)) return true;
    // Ace-low straight: A-2-3-4-5
    const low = [14, 5, 4, 3, 2];
    return values.join(',') === low.join(',');
  })();

  const freq: Record<number, number> = {};
  values.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
  const counts = Object.values(freq).sort((a, b) => b - a);

  if (isFlush && isStraight && values[0] === 14 && values[1] === 13)
    return { rank: 9, name: 'Royal Flush 👑' };
  if (isFlush && isStraight)   return { rank: 8, name: 'Straight Flush' };
  if (counts[0] === 4)         return { rank: 7, name: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, name: 'Full House' };
  if (isFlush)                 return { rank: 5, name: 'Flush' };
  if (isStraight)              return { rank: 4, name: 'Straight' };
  if (counts[0] === 3)         return { rank: 3, name: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, name: 'Two Pair' };
  if (counts[0] === 2)         return { rank: 1, name: 'One Pair' };
  return { rank: 0, name: 'High Card' };
};

// ─── Side Pot Calculator ──────────────────────────────
/**
 * Given players and total pot, builds correct side pots.
 * Each all-in player creates a new eligibility boundary.
 */
const buildSidePots = (players: PokerPlayer[]): SidePot[] => {
  // Only players who contributed chips
  const contributors = players
    .filter((p) => p.totalBet > 0)
    .sort((a, b) => a.totalBet - b.totalBet);

  if (contributors.length === 0) return [];

  const pots: SidePot[] = [];
  let prevCap = 0;

  for (let i = 0; i < contributors.length; i++) {
    const cap = contributors[i].totalBet;
    if (cap <= prevCap) continue;

    const slicePerPlayer = cap - prevCap;
    const eligible = contributors
      .slice(i) // everyone who put in at least `cap`
      .map((p) => p.uid);

    // also include players who aren't all-in (active/folded) at same cap
    const allAtLevel = players
      .filter((p) => p.totalBet >= cap)
      .map((p) => p.uid);

    const eligibleUids = [...new Set([...eligible, ...allAtLevel])];

    // count everyone who contributed at this level
    const contributors_at_level = players.filter((p) => p.totalBet >= cap);
    const potAmount = slicePerPlayer * contributors_at_level.length;

    pots.push({ amount: potAmount, eligibleUids });
    prevCap = cap;
  }

  return pots;
};

// ─── Settle Hand (inside transaction) ────────────────
const settleHand = (
  tx: any,
  tableRef: any,
  tableId: string,
  players: PokerPlayer[],
  communityCards: Card[],
  forcedWinnerUid?: string
): void => {
  const sidePots = buildSidePots(players);
  const totalPot = sidePots.reduce((s, p) => s + p.amount, 0);

  // Evaluate hands for all non-folded players
  const contenders = players.filter(
    (p) => p.status === 'active' || p.status === 'allin'
  );

  contenders.forEach((p) => {
    const all = [...p.holeCards, ...communityCards];
    const best = evaluateBestHand(all);
    p.handRank = best.name;
  });

  // For each side pot, find the best-ranking eligible player
  const winsByUid: Record<string, number> = {};

  if (forcedWinnerUid) {
    // Only 1 non-folded: wins entire pot
    winsByUid[forcedWinnerUid] = totalPot;
  } else {
    for (const pot of sidePots) {
      const eligible = contenders.filter((p) =>
        pot.eligibleUids.includes(p.uid)
      );
      if (eligible.length === 0) continue;

      let bestRank = -1;
      let winner: PokerPlayer | null = null;
      for (const p of eligible) {
        const all = [...p.holeCards, ...communityCards];
        const { rank } = evaluateBestHand(all);
        if (rank > bestRank) { bestRank = rank; winner = p; }
      }
      if (winner) {
        winsByUid[winner.uid] = (winsByUid[winner.uid] || 0) + pot.amount;
      }
    }
  }

  // Apply wins to player chip stacks + wallets
  for (const [winnerUid, amount] of Object.entries(winsByUid)) {
    if (amount <= 0) continue;
    const wIdx = players.findIndex((p) => p.uid === winnerUid);
    if (wIdx !== -1) players[wIdx].chips += amount;

    const walletRef = doc(db, 'wallets', winnerUid);
    tx.update(walletRef, {
      winningBalance: increment(amount),
      updatedAt: serverTimestamp(),
    });

    const winnerPlayer = players.find((p) => p.uid === winnerUid);
    const txnRef = doc(collection(db, 'transactions'));
    tx.set(txnRef, {
      uid: winnerUid,
      type: 'GAME_WIN',
      amount,
      previousBalance: 0,
      currentBalance: amount,
      status: 'COMPLETED',
      description: `Poker win${winnerPlayer?.handRank ? ` (${winnerPlayer.handRank})` : ''}`,
      tableId,
      createdAt: serverTimestamp(),
    });
  }

  // Remove broke players, promote first spectator (handled client-side after)
  const brokePlayers: Array<{ uid: string; name: string }> = [];
  const survivingPlayers: PokerPlayer[] = [];

  players.forEach((p) => {
    if (p.chips <= 0) brokePlayers.push({ uid: p.uid, name: p.name });
    else survivingPlayers.push(p);
  });

  const finalPlayers = survivingPlayers.map((p, i) => ({ ...p, seatIndex: i }));

  tx.update(tableRef, {
    players: finalPlayers,
    pot: 0,
    sidePots: [],
    currentBet: 0,
    activePlayerUid: null,
    turnExpiresAt: null,
    phase: 'showdown',
    status: finalPlayers.length < 2 ? 'waiting' : 'waiting',
    communityCards,
    lastBrokePlayers: brokePlayers,
    updatedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  });
};

// ─── Check if a betting round is complete ────────────
/**
 * A betting round ends ONLY when:
 * 1. Every active player has acted at least once this round.
 * 2. Every active player's bet equals currentBet (or they're all-in).
 */
const isBettingRoundComplete = (
  players: PokerPlayer[],
  currentBet: number
): boolean => {
  const activePlayers = players.filter((p) => p.status === 'active');
  if (activePlayers.length === 0) return true;

  return activePlayers.every(
    (p) => p.hasActedThisRound && p.bet >= currentBet
  );
};

// ─── Find next active player after index ─────────────
const findNextActiveIndex = (
  players: PokerPlayer[],
  fromIndex: number
): number => {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    if (players[idx].status === 'active') return idx;
  }
  return -1;
};

// ─── Reset round-level tracking ──────────────────────
const resetRoundTracking = (players: PokerPlayer[]): void => {
  players.forEach((p) => {
    if (p.status === 'active') {
      p.bet = 0;
      p.hasActedThisRound = false;
      p.isTurn = false;
    }
  });
};

// ─── Public API ───────────────────────────────────────

export const createPokerTable = async (
  uid: string,
  name: string,
  smallBlind: number,
  bigBlind: number,
  minBuyIn: number,
  maxBuyIn: number
): Promise<string> => {
  const ref = doc(collection(db, POKER_COLLECTION));
  await setDoc(ref, {
    id: ref.id,
    name,
    status: 'waiting',
    phase: 'waiting',
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    maxPlayers: 6,
    players: [],
    spectatorQueue: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    dealerSeat: 0,
    activePlayerUid: null,
    turnExpiresAt: null,
    deck: [],
    handNumber: 0,
    createdBy: uid,
    lastBrokePlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  });
  return ref.id;
};

export const subscribePokerTables = (cb: (tables: PokerTable[]) => void) => {
  const q = query(
    collection(db, POKER_COLLECTION),
    where('status', 'in', ['waiting', 'playing']),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PokerTable)));
  });
};

export const subscribePokerTable = (
  tableId: string,
  cb: (table: PokerTable) => void
) => {
  return onSnapshot(doc(db, POKER_COLLECTION, tableId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() } as PokerTable);
  });
};

/**
 * Join a poker table.
 * - If seats are available: joins as player.
 * - If table is full: joins spectatorQueue (FIFO).
 */
export const joinPokerTable = async (
  tableId: string,
  uid: string,
  name: string,
  avatar: string,
  buyIn: number
): Promise<{ role: 'player' | 'spectator' }> => {
  let role: 'player' | 'spectator' = 'spectator';

  await runTransaction(db, async (tx) => {
    const tableRef = doc(db, POKER_COLLECTION, tableId);
    const walletRef = doc(db, 'wallets', uid);
    const [tableSnap, walletSnap] = await Promise.all([
      tx.get(tableRef),
      tx.get(walletRef),
    ]);
    if (!tableSnap.exists()) throw new Error('Table not found');
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const table = tableSnap.data() as PokerTable;
    const wallet = walletSnap.data();

    // Prevent duplicate
    const alreadyPlayer = table.players.some((p) => p.uid === uid);
    const alreadySpec = (table.spectatorQueue || []).some(
      (s: SpectatorEntry) => s.uid === uid
    );
    if (alreadyPlayer || alreadySpec)
      throw new Error('Already at this table');

    const isFull = table.players.length >= 6;
    const isPlaying = table.status === 'playing';

    if (isFull || isPlaying) {
      // Join as spectator — no chips deducted
      const entry: SpectatorEntry = {
        uid, name, avatar,
        joinedAt: Timestamp.now(),
      };
      tx.update(tableRef, {
        spectatorQueue: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      });
      role = 'spectator';
      return;
    }

    // Validate buy-in
    if (buyIn < table.minBuyIn)
      throw new Error(`Min buy-in is ₹${table.minBuyIn}`);
    if (buyIn > table.maxBuyIn)
      throw new Error(`Max buy-in is ₹${table.maxBuyIn}`);

    const usable = calculateUsableBalance(wallet as any);
    if (usable < buyIn) throw new Error('Insufficient balance');
    const newBalances = deductFromWallet(wallet as any, buyIn);
    if (!newBalances) throw new Error('Insufficient balance');

    // Find empty seat
    const occupied = table.players.map((p) => p.seatIndex);
    let seat = 0;
    while (occupied.includes(seat)) seat++;

    const newPlayer: PokerPlayer = {
      uid, name, avatar,
      chips: buyIn,
      holeCards: [],
      bet: 0,
      totalBet: 0,
      status: 'waiting',
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      hasActedThisRound: false,
      seatIndex: seat,
      joinedAt: Timestamp.now(),
    };

    tx.update(walletRef, { ...newBalances, updatedAt: serverTimestamp() });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type: 'GAME_BET',
      amount: -buyIn,
      previousBalance:
        (wallet.depositBalance || 0) + (wallet.winningBalance || 0),
      currentBalance:
        (wallet.depositBalance || 0) +
        (wallet.winningBalance || 0) -
        buyIn,
      status: 'COMPLETED',
      description: `Poker buy-in at "${table.name}"`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef, {
      players: arrayUnion(newPlayer),
      updatedAt: serverTimestamp(),
    });

    role = 'player';
  });

  return { role };
};

/**
 * Leave poker table.
 * - If game is running: mark as folded, return chips after hand.
 * - Otherwise: remove immediately and return chips.
 * - Promote first spectator from queue to fill the seat.
 */
export const leavePokerTable = async (
  tableId: string,
  uid: string
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const tableRef = doc(db, POKER_COLLECTION, tableId);
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) throw new Error('Table not found');
    const table = tableSnap.data() as PokerTable;

    const player = table.players.find((p) => p.uid === uid);
    const inQueue = (table.spectatorQueue || []).some(
      (s: SpectatorEntry) => s.uid === uid
    );

    // ── Case 1: User sirf spectator queue mein hai ──
    if (inQueue && !player) {
      const updatedQueue = (table.spectatorQueue || []).filter(
        (s: SpectatorEntry) => s.uid !== uid
      );
      tx.update(tableRef, {
        spectatorQueue: updatedQueue,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ── Case 2: Player table mein nahi hai ──
    if (!player) return;

    const isPlaying = table.status === 'playing';

    // ── Case 3: Game chal raha hai ──
    if (isPlaying) {
      const updatedPlayers = table.players.map((p) =>
        p.uid === uid
          ? { ...p, status: 'left' as const, isTurn: false }
          : p
      );

      let activePlayerUid = table.activePlayerUid;

      // Agar is player ki turn thi toh next player ko turn do
      if (activePlayerUid === uid) {
        const pIdx = updatedPlayers.findIndex((p) => p.uid === uid);
        const nextIdx = findNextActiveIndex(
          updatedPlayers.map((p) =>
            p.uid === uid ? { ...p, status: 'active' as const } : p
          ),
          pIdx
        );
        if (nextIdx !== -1) {
          updatedPlayers[nextIdx] = {
            ...updatedPlayers[nextIdx],
            isTurn: true,
          };
          activePlayerUid = updatedPlayers[nextIdx].uid;
        } else {
          activePlayerUid = null;
        }
      }

      // ── Check: Kya sirf 1 player bacha non-folded ──
      const nonFolded = updatedPlayers.filter(
        (p) => p.status !== 'folded' && p.status !== 'left'
      );

      if (nonFolded.length === 1) {
        // Ek hi player bacha → hand settle karo
        settleHand(
          tx,
          tableRef,
          tableId,
          updatedPlayers,
          table.communityCards || [],
          nonFolded[0].uid
        );
        return;
      }

      if (nonFolded.length === 0) {
        // Koi nahi bacha → table reset
        // Sab 'left' players ke chips wapas karo
        for (const p of updatedPlayers) {
          if (p.chips > 0) {
            const walletRef = doc(db, 'wallets', p.uid);
            tx.update(walletRef, {
              winningBalance: increment(p.chips),
              updatedAt: serverTimestamp(),
            });
          }
        }
        tx.update(tableRef, {
          players: [],
          pot: 0,
          sidePots: [],
          currentBet: 0,
          activePlayerUid: null,
          turnExpiresAt: null,
          phase: 'waiting',
          status: 'waiting',
          communityCards: [],
          deck: [],
          updatedAt: serverTimestamp(),
          lastActionAt: serverTimestamp(),
        });
        return;
      }

      tx.update(tableRef, {
        players: updatedPlayers,
        activePlayerUid,
        updatedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
      });
      return;
    }

    // ── Case 4: Game nahi chal raha (waiting state) ──
    // Chips safely return kar sakte hain — settleHand kabhi nahi chala
    const chips = player.chips;

    const updatedPlayers = table.players
      .filter((p) => p.uid !== uid)
      .map((p, i) => ({ ...p, seatIndex: i }));

    // Spectator queue sort karo (FIFO)
    const queue = [...(table.spectatorQueue || [])].sort(
      (a, b) =>
        (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0)
    );
    const promoted = queue.shift(); // pehla spectator nikalo

    // Chips wallet mein wapas
    if (chips > 0) {
      const walletRef = doc(db, 'wallets', uid);
      tx.update(walletRef, {
        winningBalance: increment(chips),
        updatedAt: serverTimestamp(),
      });

      const txRef = doc(collection(db, 'transactions'));
      tx.set(txRef, {
        uid,
        type: 'CASH_OUT',       // GAME_WIN se better type hai refund ke liye
        amount: chips,
        previousBalance: 0,
        currentBalance: chips,
        status: 'COMPLETED',
        description: `Poker table se chips wapas - "${table.name}"`,
        tableId,
        createdAt: serverTimestamp(),
      });
    }

    // ── Table empty ho gaya ──
    const tableWillBeEmpty = updatedPlayers.length === 0;

    const updatePayload: any = {
      players: updatedPlayers,
      spectatorQueue: queue,
      updatedAt: serverTimestamp(),
    };

    if (tableWillBeEmpty) {
      // Table completely reset
      updatePayload.status = 'waiting';
      updatePayload.phase = 'waiting';
      updatePayload.activePlayerUid = null;
      updatePayload.turnExpiresAt = null;
      updatePayload.pot = 0;
      updatePayload.sidePots = [];
      updatePayload.currentBet = 0;
      updatePayload.communityCards = [];
      updatePayload.deck = [];
      updatePayload.dealerSeat = 0;
    } else {
      // Kuch players baaki hain
      updatePayload.status =
        updatedPlayers.length < 2 ? 'waiting' : table.status;
      updatePayload.phase =
        updatedPlayers.length < 2 ? 'waiting' : table.phase;
      updatePayload.activePlayerUid =
        updatedPlayers.length < 2 ? null : table.activePlayerUid;

      if (promoted) {
        updatePayload.nextToJoinUid = promoted.uid;
      }
    }

    tx.update(tableRef, updatePayload);
  });
};

/**
 * Mark player as disconnected.
 * Auto-fold them when their turn comes (handled in pokerAction timeout).
 */
export const markPokerDisconnect = async (
  tableId: string,
  uid: string
): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  const updatedPlayers = table.players.map((p) =>
    p.uid === uid
      ? { ...p, status: 'disconnected' as const, disconnectedAt: Timestamp.now() }
      : p
  );
  await updateDoc(tableRef, {
    players: updatedPlayers,
    updatedAt: serverTimestamp(),
  });
};

export const markPokerReconnect = async (
  tableId: string,
  uid: string
): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  const updatedPlayers = table.players.map((p) =>
    p.uid === uid
      ? { ...p, status: 'active' as const, disconnectedAt: null }
      : p
  );
  await updateDoc(tableRef, {
    players: updatedPlayers,
    updatedAt: serverTimestamp(),
  });
};

export const checkAndAutoStart = async (tableId: string): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  if (
    table.status === 'waiting' &&
    table.phase === 'waiting' &&
    table.players.length >= 2
  ) {
    try {
      await startPokerHand(tableId);
    } catch (e) {
      console.error('Auto-start failed:', e);
    }
  }
};

export const startPokerHand = async (tableId: string): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);

  // Atomic guard against double-start
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tableRef);
      if (!snap.exists()) throw new Error('Table not found');
      const table = snap.data() as PokerTable;
      if (table.players.length < 2) throw new Error('Need at least 2 players');
      if (table.status === 'playing') throw new Error('Already playing');

      const players = table.players.map((p) => ({ ...p }));
      const handNumber = (table.handNumber || 0) + 1;
      const numPlayers = players.length;
      const dealerSeat = handNumber % numPlayers;
      const sbIdx = (dealerSeat + 1) % numPlayers;
      const bbIdx = (dealerSeat + 2) % numPlayers;

      // Reset all players for new hand
      players.forEach((p, i) => {
        p.holeCards = [];
        p.bet = 0;
        p.totalBet = 0;
        p.status = 'active';
        p.isTurn = false;
        p.hasActedThisRound = false;
        p.handRank = '';
        p.isDealer = i === dealerSeat;
        p.isSmallBlind = i === sbIdx;
        p.isBigBlind = i === bbIdx;
      });

      // Deal 2 cards to each player
      let deck = shuffleDeck(createDeck());
      players.forEach((p) => {
        p.holeCards = [deck.pop()!, deck.pop()!];
      });

      // Post blinds
      const sbAmount = Math.min(table.smallBlind, players[sbIdx].chips);
      players[sbIdx].chips -= sbAmount;
      players[sbIdx].bet = sbAmount;
      players[sbIdx].totalBet = sbAmount;
      players[sbIdx].hasActedThisRound = true; // blind counts as action
      if (players[sbIdx].chips === 0) players[sbIdx].status = 'allin';

      const bbAmount = Math.min(table.bigBlind, players[bbIdx].chips);
      players[bbIdx].chips -= bbAmount;
      players[bbIdx].bet = bbAmount;
      players[bbIdx].totalBet = bbAmount;
      players[bbIdx].hasActedThisRound = true; // blind counts as action
      if (players[bbIdx].chips === 0) players[bbIdx].status = 'allin';

      const currentBet = Math.max(sbAmount, bbAmount, table.bigBlind);
      const pot = sbAmount + bbAmount;

      // First to act pre-flop is UTG (after BB)
      let firstToAct = (bbIdx + 1) % numPlayers;
      let attempts = 0;
      while (
        players[firstToAct].status !== 'active' &&
        attempts < numPlayers
      ) {
        firstToAct = (firstToAct + 1) % numPlayers;
        attempts++;
      }

      if (players[firstToAct].status === 'active') {
        players[firstToAct].isTurn = true;
      }

      const turnExpiresAt = Timestamp.fromDate(
        new Date(Date.now() + 20000)
      );

      tx.update(tableRef, {
        status: 'playing',
        phase: 'preflop',
        players,
        deck,
        pot,
        sidePots: [],
        currentBet,
        dealerSeat,
        activePlayerUid: players[firstToAct]?.uid || null,
        turnExpiresAt,
        communityCards: [],
        handNumber,
        lastBrokePlayers: [],
        updatedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e.message === 'Already playing') return;
    throw e;
  }
};

/**
 * Core poker action handler.
 * Validates turn, applies action, checks round completion,
 * advances phase or settles hand.
 */
export const pokerAction = async (
  tableId: string,
  uid: string,
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
  raiseAmount?: number
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const tableRef = doc(db, POKER_COLLECTION, tableId);
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) throw new Error('Table not found');
    const table = tableSnap.data() as PokerTable;

    if (table.activePlayerUid !== uid) throw new Error('Not your turn');
    if (table.status !== 'playing') throw new Error('Game not in progress');

    const players = table.players.map((p) => ({ ...p }));
    const pIndex = players.findIndex((p) => p.uid === uid);
    if (pIndex === -1) throw new Error('Player not found');

    const player = { ...players[pIndex] };
    let pot = table.pot;
    let currentBet = table.currentBet;

    // ── Apply Action ──
    switch (action) {
      case 'fold':
        player.status = 'folded';
        player.isTurn = false;
        player.hasActedThisRound = true;
        break;

      case 'check':
        if (player.bet < currentBet)
          throw new Error('Cannot check — must call or raise');
        player.isTurn = false;
        player.hasActedThisRound = true;
        break;

      case 'call': {
        const toCall = Math.min(currentBet - player.bet, player.chips);
        player.chips -= toCall;
        player.bet += toCall;
        player.totalBet += toCall;
        pot += toCall;
        if (player.chips === 0) player.status = 'allin';
        player.isTurn = false;
        player.hasActedThisRound = true;
        break;
      }

      case 'raise': {
        // Min raise = currentBet * 2 (or bigBlind * 2 if no bets yet)
        const minRaise =
          currentBet > 0 ? currentBet * 2 : table.bigBlind * 2;
        const target = raiseAmount && raiseAmount >= minRaise
          ? raiseAmount
          : minRaise;
        const toAdd = Math.min(target - player.bet, player.chips);
        player.chips -= toAdd;
        player.bet += toAdd;
        player.totalBet += toAdd;
        pot += toAdd;
        currentBet = player.bet;
        if (player.chips === 0) player.status = 'allin';
        player.isTurn = false;
        player.hasActedThisRound = true;

        // When someone raises, others need to act again
        players.forEach((p, i) => {
          if (i !== pIndex && p.status === 'active' && p.bet < currentBet) {
            p.hasActedThisRound = false;
          }
        });
        break;
      }

      case 'allin': {
        const allIn = player.chips;
        pot += allIn;
        player.bet += allIn;
        player.totalBet += allIn;
        if (player.bet > currentBet) currentBet = player.bet;
        player.chips = 0;
        player.status = 'allin';
        player.isTurn = false;
        player.hasActedThisRound = true;

        // If this all-in raises, others need to act
        if (player.bet > table.currentBet) {
          players.forEach((p, i) => {
            if (i !== pIndex && p.status === 'active' && p.bet < player.bet) {
              p.hasActedThisRound = false;
            }
          });
        }
        break;
      }
    }

    players[pIndex] = player;

    // ── Check round/hand completion ──
    const nonFolded = players.filter(
      (p) => p.status !== 'folded' && p.status !== 'left'
    );
    const activePlayers = players.filter((p) => p.status === 'active');

    // Only 1 player left → immediate win
    if (nonFolded.length === 1) {
      settleHand(tx, tableRef, tableId, players, table.communityCards || [], nonFolded[0].uid);
      return;
    }

    // Check if betting round is complete
    const roundComplete = isBettingRoundComplete(players, currentBet);

    if (roundComplete) {
      const deck = [...(table.deck || [])];
      const communityCards = [...(table.communityCards || [])];

      // Reset bets and round tracking for next street
      resetRoundTracking(players);

      // All remaining are all-in → run board and settle
      if (activePlayers.length === 0) {
        while (communityCards.length < 5 && deck.length > 0) {
          communityCards.push(deck.pop()!);
        }
        settleHand(tx, tableRef, tableId, players, communityCards);
        return;
      }

      // Advance to next phase
      let newPhase: PokerPhase = table.phase;

      switch (table.phase) {
        case 'preflop':
          communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
          newPhase = 'flop';
          break;
        case 'flop':
          communityCards.push(deck.pop()!);
          newPhase = 'turn';
          break;
        case 'turn':
          communityCards.push(deck.pop()!);
          newPhase = 'river';
          break;
        case 'river':
          newPhase = 'showdown';
          break;
      }

      if (newPhase === 'showdown') {
        settleHand(tx, tableRef, tableId, players, communityCards);
        return;
      }

      // Find first active player (post-flop: start from left of dealer)
      const dealerSeat = table.dealerSeat;
      let firstActive = -1;
      for (let i = 1; i <= players.length; i++) {
        const idx = (dealerSeat + i) % players.length;
        if (players[idx].status === 'active') {
          firstActive = idx;
          break;
        }
      }

      if (firstActive !== -1) players[firstActive].isTurn = true;

      const turnExpiresAt = Timestamp.fromDate(
        new Date(Date.now() + 20000)
      );

      tx.update(tableRef, {
        players,
        communityCards,
        deck,
        pot,
        sidePots: buildSidePots(players),
        currentBet: 0,
        phase: newPhase,
        activePlayerUid:
          firstActive !== -1 ? players[firstActive].uid : null,
        turnExpiresAt,
        updatedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
      });
      return;
    }

    // ── Advance to next active player ──
    const nextIdx = findNextActiveIndex(players, pIndex);
    if (nextIdx !== -1) players[nextIdx].isTurn = true;

    const turnExpiresAt = Timestamp.fromDate(new Date(Date.now() + 20000));

    tx.update(tableRef, {
      players,
      pot,
      sidePots: buildSidePots(players),
      currentBet,
      activePlayerUid: nextIdx !== -1 ? players[nextIdx].uid : null,
      turnExpiresAt,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
    });
  });
};

/**
 * Auto-fold for timed-out / disconnected players.
 * Call this from a Cloud Function or client-side timer that fires
 * when Date.now() > turnExpiresAt.
 */
export const autoFoldTimedOutPlayer = async (
  tableId: string
): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;

  if (!table.activePlayerUid) return;
  if (!table.turnExpiresAt) return;

  const expiresAt =
    table.turnExpiresAt instanceof Timestamp
      ? table.turnExpiresAt.toMillis()
      : table.turnExpiresAt;

  if (Date.now() < expiresAt) return; // not expired yet

  const uid = table.activePlayerUid;
  const player = table.players.find((p) => p.uid === uid);
  if (!player) return;

  // If player can check (no amount owed), check. Otherwise fold.
  const canCheck = player.bet >= table.currentBet;
  await pokerAction(tableId, uid, canCheck ? 'check' : 'fold');
};

// ─── NOTIFICATIONS ───────────────────────────────────
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
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const markNotificationRead = async (notifId: string): Promise<void> => {
  await updateDoc(doc(db, 'notifications', notifId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
};
