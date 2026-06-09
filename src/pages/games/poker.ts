// src/firebase/poker.ts
import {
  doc, collection, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, query, where,
  orderBy, increment, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from './config';

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

// =====================================================
// TYPES
// =====================================================
export type PokerStatus = 'waiting' | 'playing' | 'finished';
export type PokerPhase  = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerPlayer {
  uid: string;
  name: string;
  avatar: string;
  chips: number;
  holeCards: Card[];
  bet: number;
  totalBet: number;
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'left' | 'disconnected';
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  hasActedThisRound: boolean;
  handRank?: string;
  seatIndex: number;
  joinedAt: any;
  disconnectedAt?: any;
}

export interface SpectatorEntry {
  uid: string;
  name: string;
  avatar: string;
  joinedAt: any;
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
  spectatorQueue: SpectatorEntry[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  dealerSeat: number;
  activePlayerUid: string | null;
  turnExpiresAt: any;
  deck: Card[];
  handNumber: number;
  createdBy: string;
  lastBrokePlayers: Array<{ uid: string; name: string }>;
  createdAt: any;
  updatedAt: any;
  lastActionAt: any;
}

const POKER_COLLECTION = 'pokerTables';

// =====================================================
// HAND EVALUATION
// =====================================================
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

const evaluateFiveCardHand = (cards: Card[]): { rank: number; name: string } => {
  const sorted = [...cards].sort((a, b) => b.numericValue - a.numericValue);
  const suits  = sorted.map((c) => c.suit);
  const values = sorted.map((c) => c.numericValue);

  const isFlush    = suits.every((s) => s === suits[0]);
  const isStraight = (() => {
    if (values.every((v, i) => i === 0 || v === values[i - 1] - 1)) return true;
    const low = [14, 5, 4, 3, 2];
    return values.join(',') === low.join(',');
  })();

  const freq: Record<number, number> = {};
  values.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
  const counts = Object.values(freq).sort((a, b) => b - a);

  if (isFlush && isStraight && values[0] === 14 && values[1] === 13)
    return { rank: 9, name: 'Royal Flush 👑' };
  if (isFlush && isStraight)              return { rank: 8, name: 'Straight Flush' };
  if (counts[0] === 4)                    return { rank: 7, name: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, name: 'Full House' };
  if (isFlush)                            return { rank: 5, name: 'Flush' };
  if (isStraight)                         return { rank: 4, name: 'Straight' };
  if (counts[0] === 3)                    return { rank: 3, name: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, name: 'Two Pair' };
  if (counts[0] === 2)                    return { rank: 1, name: 'One Pair' };
  return { rank: 0, name: 'High Card' };
};

const evaluateBestHand = (
  cards: Card[]
): { rank: number; name: string; bestFive: Card[] } => {
  if (cards.length < 2) return { rank: 0, name: 'No Cards', bestFive: [] };
  const combos: Card[][] =
    cards.length <= 5 ? [cards] : getCombinations(cards, 5);
  let best = { rank: -1, name: 'High Card', bestFive: combos[0] };
  for (const combo of combos) {
    const result = evaluateFiveCardHand(combo);
    if (result.rank > best.rank) best = { ...result, bestFive: combo };
  }
  return best;
};

// =====================================================
// SIDE POTS
// =====================================================
const buildSidePots = (players: PokerPlayer[]): SidePot[] => {
  const contributors = players
    .filter((p) => p.totalBet > 0)
    .sort((a, b) => a.totalBet - b.totalBet);
  if (contributors.length === 0) return [];

  const pots: SidePot[] = [];
  let prevCap = 0;

  for (let i = 0; i < contributors.length; i++) {
    const cap = contributors[i].totalBet;
    if (cap <= prevCap) continue;
    const slicePerPlayer       = cap - prevCap;
    const contributors_at_level = players.filter((p) => p.totalBet >= cap);
    const potAmount            = slicePerPlayer * contributors_at_level.length;
    const eligibleUids         = contributors_at_level.map((p) => p.uid);
    pots.push({ amount: potAmount, eligibleUids: [...new Set(eligibleUids)] });
    prevCap = cap;
  }
  return pots;
};

// =====================================================
// SETTLE HAND  ← NO wallet writes here (API handles it)
// =====================================================
const settleHand = (
  tx: any,
  tableRef: any,
  players: PokerPlayer[],
  communityCards: Card[],
  forcedWinnerUid?: string
): void => {
  const sidePots  = buildSidePots(players);
  const totalPot  = sidePots.reduce((s, p) => s + p.amount, 0);
  const contenders = players.filter(
    (p) => p.status === 'active' || p.status === 'allin'
  );

  contenders.forEach((p) => {
    const best = evaluateBestHand([...p.holeCards, ...communityCards]);
    p.handRank = best.name;
  });

  const winsByUid: Record<string, number> = {};

  if (forcedWinnerUid) {
    winsByUid[forcedWinnerUid] = totalPot;
  } else {
    for (const pot of sidePots) {
      const eligible = contenders.filter((p) => pot.eligibleUids.includes(p.uid));
      if (eligible.length === 0) continue;
      let bestRank = -1;
      let winner: PokerPlayer | null = null;
      for (const p of eligible) {
        const { rank } = evaluateBestHand([...p.holeCards, ...communityCards]);
        if (rank > bestRank) { bestRank = rank; winner = p; }
      }
      if (winner) winsByUid[winner.uid] = (winsByUid[winner.uid] || 0) + pot.amount;
    }
  }

  // ── Update chip counts only (wallet handled by /api/poker/settle) ──
  for (const [winnerUid, amount] of Object.entries(winsByUid)) {
    if (amount <= 0) continue;
    const wIdx = players.findIndex((p) => p.uid === winnerUid);
    if (wIdx !== -1) players[wIdx].chips += amount;
  }

  const brokePlayers: Array<{ uid: string; name: string }> = [];
  const survivingPlayers: PokerPlayer[] = [];
  players.forEach((p) => {
    if (p.chips <= 0) brokePlayers.push({ uid: p.uid, name: p.name });
    else survivingPlayers.push(p);
  });

  const finalPlayers = survivingPlayers.map((p, i) => ({ ...p, seatIndex: i }));

  // ── Store winners map so /api/poker/settle can read it ──
  const winnersPayload = Object.entries(winsByUid).map(([uid, amount]) => {
    const p = players.find((x) => x.uid === uid);
    return { uid, amount, handRank: p?.handRank || '' };
  });

  tx.update(tableRef, {
    players: finalPlayers,
    pot: 0,
    sidePots: [],
    currentBet: 0,
    activePlayerUid: null,
    turnExpiresAt: null,
    phase: 'showdown',
    status: 'waiting',
    communityCards,
    lastBrokePlayers: brokePlayers,
    // API settle endpoint reads this field
    pendingSettlement: winnersPayload,
    updatedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  });
};

// =====================================================
// HELPERS
// =====================================================
const isBettingRoundComplete = (
  players: PokerPlayer[], currentBet: number
): boolean => {
  const active = players.filter((p) => p.status === 'active');
  if (active.length === 0) return true;
  return active.every((p) => p.hasActedThisRound && p.bet >= currentBet);
};

const findNextActiveIndex = (players: PokerPlayer[], fromIndex: number): number => {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    if (players[idx].status === 'active') return idx;
  }
  return -1;
};

const resetRoundTracking = (players: PokerPlayer[]): void => {
  players.forEach((p) => {
    if (p.status === 'active') {
      p.bet = 0;
      p.hasActedThisRound = false;
      p.isTurn = false;
    }
  });
};

// =====================================================
// PUBLIC API — SUBSCRIBE
// =====================================================
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

// =====================================================
// CREATE TABLE
// =====================================================
export const createPokerTable = async (
  uid: string, name: string,
  smallBlind: number, bigBlind: number,
  minBuyIn: number, maxBuyIn: number
): Promise<string> => {
  const ref = doc(collection(db, POKER_COLLECTION));
  await setDoc(ref, {
    id: ref.id, name, status: 'waiting', phase: 'waiting',
    smallBlind, bigBlind, minBuyIn, maxBuyIn, maxPlayers: 6,
    players: [], spectatorQueue: [], communityCards: [],
    pot: 0, sidePots: [], currentBet: 0, dealerSeat: 0,
    activePlayerUid: null, turnExpiresAt: null, deck: [],
    handNumber: 0, createdBy: uid, lastBrokePlayers: [],
    pendingSettlement: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  });
  return ref.id;
};

// =====================================================
// CHECK & AUTO START
// =====================================================
export const checkAndAutoStart = async (tableId: string): Promise<void> => {
  const tableRef  = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  if (
    table.status === 'waiting' &&
    table.phase  === 'waiting' &&
    table.players.length >= 2
  ) {
    try { await startPokerHand(tableId); } catch (e) { console.error(e); }
  }
};

// =====================================================
// START HAND
// =====================================================
export const startPokerHand = async (tableId: string): Promise<void> => {
  const tableRef = doc(db, POKER_COLLECTION, tableId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tableRef);
      if (!snap.exists()) throw new Error('Table not found');
      const table = snap.data() as PokerTable;
      if (table.players.length < 2) throw new Error('Need at least 2 players');
      if (table.status === 'playing') throw new Error('Already playing');

      const players    = table.players.map((p) => ({ ...p }));
      const handNumber = (table.handNumber || 0) + 1;
      const numPlayers = players.length;
      const dealerSeat = handNumber % numPlayers;
      const sbIdx      = (dealerSeat + 1) % numPlayers;
      const bbIdx      = (dealerSeat + 2) % numPlayers;

      players.forEach((p, i) => {
        p.holeCards          = [];
        p.bet                = 0;
        p.totalBet           = 0;
        p.status             = 'active';
        p.isTurn             = false;
        p.hasActedThisRound  = false;
        p.handRank           = '';
        p.isDealer           = i === dealerSeat;
        p.isSmallBlind       = i === sbIdx;
        p.isBigBlind         = i === bbIdx;
      });

      let deck = shuffleDeck(createDeck());
      players.forEach((p) => {
        p.holeCards = [deck.pop()!, deck.pop()!];
      });

      const sbAmount = Math.min(table.smallBlind, players[sbIdx].chips);
      players[sbIdx].chips -= sbAmount;
      players[sbIdx].bet    = sbAmount;
      players[sbIdx].totalBet = sbAmount;
      players[sbIdx].hasActedThisRound = true;
      if (players[sbIdx].chips === 0) players[sbIdx].status = 'allin';

      const bbAmount = Math.min(table.bigBlind, players[bbIdx].chips);
      players[bbIdx].chips -= bbAmount;
      players[bbIdx].bet    = bbAmount;
      players[bbIdx].totalBet = bbAmount;
      players[bbIdx].hasActedThisRound = true;
      if (players[bbIdx].chips === 0) players[bbIdx].status = 'allin';

      const currentBet = Math.max(sbAmount, bbAmount, table.bigBlind);
      const pot        = sbAmount + bbAmount;

      let firstToAct = (bbIdx + 1) % numPlayers;
      let attempts   = 0;
      while (players[firstToAct].status !== 'active' && attempts < numPlayers) {
        firstToAct = (firstToAct + 1) % numPlayers;
        attempts++;
      }
      if (players[firstToAct].status === 'active') players[firstToAct].isTurn = true;

      const turnExpiresAt = Timestamp.fromDate(new Date(Date.now() + 20000));

      tx.update(tableRef, {
        status: 'playing', phase: 'preflop', players, deck, pot,
        sidePots: [], currentBet, dealerSeat,
        activePlayerUid: players[firstToAct]?.uid || null,
        turnExpiresAt, communityCards: [], handNumber,
        lastBrokePlayers: [], pendingSettlement: [],
        updatedAt: serverTimestamp(), lastActionAt: serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e.message === 'Already playing') return;
    throw e;
  }
};

// =====================================================
// POKER ACTION
// =====================================================
export const pokerAction = async (
  tableId: string,
  uid: string,
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
  raiseAmount?: number
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const tableRef  = doc(db, POKER_COLLECTION, tableId);
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) throw new Error('Table not found');
    const table = tableSnap.data() as PokerTable;

    if (table.activePlayerUid !== uid) throw new Error('Not your turn');
    if (table.status !== 'playing')    throw new Error('Game not in progress');

    const players = table.players.map((p) => ({ ...p }));
    const pIndex  = players.findIndex((p) => p.uid === uid);
    if (pIndex === -1) throw new Error('Player not found');

    const player     = { ...players[pIndex] };
    let pot          = table.pot;
    let currentBet   = table.currentBet;

    switch (action) {
      case 'fold':
        player.status           = 'folded';
        player.isTurn           = false;
        player.hasActedThisRound = true;
        break;

      case 'check':
        if (player.bet < currentBet) throw new Error('Cannot check — must call or raise');
        player.isTurn           = false;
        player.hasActedThisRound = true;
        break;

      case 'call': {
        const toCall = Math.min(currentBet - player.bet, player.chips);
        player.chips   -= toCall;
        player.bet     += toCall;
        player.totalBet += toCall;
        pot            += toCall;
        if (player.chips === 0) player.status = 'allin';
        player.isTurn           = false;
        player.hasActedThisRound = true;
        break;
      }
      case 'raise': {
        const minRaise = currentBet > 0 ? currentBet * 2 : table.bigBlind * 2;
        const target   = raiseAmount && raiseAmount >= minRaise ? raiseAmount : minRaise;
        const toAdd    = Math.min(target - player.bet, player.chips);
        player.chips   -= toAdd;
        player.bet     += toAdd;
        player.totalBet += toAdd;
        pot            += toAdd;
        currentBet      = player.bet;
        if (player.chips === 0) player.status = 'allin';
        player.isTurn           = false;
        player.hasActedThisRound = true;
        players.forEach((p, i) => {
          if (i !== pIndex && p.status === 'active' && p.bet < currentBet)
            p.hasActedThisRound = false;
        });
        break;
      }

      case 'allin': {
        const allIn = player.chips;
        pot            += allIn;
        player.bet     += allIn;
        player.totalBet += allIn;
        if (player.bet > currentBet) currentBet = player.bet;
        player.chips  = 0;
        player.status = 'allin';
        player.isTurn           = false;
        player.hasActedThisRound = true;
        if (player.bet > table.currentBet) {
          players.forEach((p, i) => {
            if (i !== pIndex && p.status === 'active' && p.bet < player.bet)
              p.hasActedThisRound = false;
          });
        }
        break;
      }
    }

    players[pIndex] = player;

    const nonFolded    = players.filter((p) => p.status !== 'folded' && p.status !== 'left');
    const activePlayers = players.filter((p) => p.status === 'active');

    if (nonFolded.length === 1) {
      settleHand(tx, tableRef, players, table.communityCards || [], nonFolded[0].uid);
      return;
    }

    const roundComplete = isBettingRoundComplete(players, currentBet);

    if (roundComplete) {
      const deck           = [...(table.deck || [])];
      const communityCards = [...(table.communityCards || [])];
      resetRoundTracking(players);

      if (activePlayers.length === 0) {
        while (communityCards.length < 5 && deck.length > 0) {
          communityCards.push(deck.pop()!);
        }
        settleHand(tx, tableRef, players, communityCards);
        return;
      }
       
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
        settleHand(tx, tableRef, players, communityCards);
        return;
      }

      const dealerSeat = table.dealerSeat;
      let firstActive  = -1;
      for (let i = 1; i <= players.length; i++) {
        const idx = (dealerSeat + i) % players.length;
        if (players[idx].status === 'active') { firstActive = idx; break; }
      }
      if (firstActive !== -1) players[firstActive].isTurn = true;

      const turnExpiresAt = Timestamp.fromDate(new Date(Date.now() + 20000));

      tx.update(tableRef, {
        players, communityCards, deck, pot,
        sidePots: buildSidePots(players),
        currentBet: 0, phase: newPhase,
        activePlayerUid: firstActive !== -1 ? players[firstActive].uid : null,
        turnExpiresAt, updatedAt: serverTimestamp(), lastActionAt: serverTimestamp(),
      });
      return;
    }

    const nextIdx = findNextActiveIndex(players, pIndex);
    if (nextIdx !== -1) players[nextIdx].isTurn = true;
    const turnExpiresAt = Timestamp.fromDate(new Date(Date.now() + 20000));

    tx.update(tableRef, {
      players, pot, sidePots: buildSidePots(players), currentBet,
      activePlayerUid: nextIdx !== -1 ? players[nextIdx].uid : null,
      turnExpiresAt, updatedAt: serverTimestamp(), lastActionAt: serverTimestamp(),
    });
  });
};
      

// =====================================================
// DISCONNECT / RECONNECT
// =====================================================
export const markPokerDisconnect = async (
  tableId: string, uid: string
): Promise<void> => {
  const tableRef  = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  const updatedPlayers = table.players.map((p) =>
    p.uid === uid
      ? { ...p, status: 'disconnected' as const, disconnectedAt: Timestamp.now() }
      : p
  );
  await updateDoc(tableRef, { players: updatedPlayers, updatedAt: serverTimestamp() });
};

export const markPokerReconnect = async (
  tableId: string, uid: string
): Promise<void> => {
  const tableRef  = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  const updatedPlayers = table.players.map((p) =>
    p.uid === uid
      ? { ...p, status: 'active' as const, disconnectedAt: null }
      : p
  );
  await updateDoc(tableRef, { players: updatedPlayers, updatedAt: serverTimestamp() });
};

// =====================================================
// AUTO FOLD TIMED OUT PLAYER
// =====================================================
export const autoFoldTimedOutPlayer = async (tableId: string): Promise<void> => {
  const tableRef  = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  if (!table.activePlayerUid || !table.turnExpiresAt) return;

  const expiresAt =
    table.turnExpiresAt instanceof Timestamp
      ? table.turnExpiresAt.toMillis()
      : Number(table.turnExpiresAt);

  if (Date.now() < expiresAt) return;

  const uid    = table.activePlayerUid;
  const player = table.players.find((p) => p.uid === uid);
  if (!player) return;

  const canCheck = player.bet >= table.currentBet;
  await pokerAction(tableId, uid, canCheck ? 'check' : 'fold');
};

    // =====================================================
// AUTO FOLD TIMED OUT PLAYER
// =====================================================
export const autoFoldTimedOutPlayer = async (tableId: string): Promise<void> => {
  const tableRef  = doc(db, POKER_COLLECTION, tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;
  const table = tableSnap.data() as PokerTable;
  if (!table.activePlayerUid || !table.turnExpiresAt) return;

  const expiresAt =
    table.turnExpiresAt instanceof Timestamp
      ? table.turnExpiresAt.toMillis()
      : Number(table.turnExpiresAt);

  if (Date.now() < expiresAt) return;

  const uid    = table.activePlayerUid;
  const player = table.players.find((p) => p.uid === uid);
  if (!player) return;

  const canCheck = player.bet >= table.currentBet;
  await pokerAction(tableId, uid, canCheck ? 'check' : 'fold');
};
