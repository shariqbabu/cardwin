// ============================================================
// NineCard.ts — Complete Rewrite with All Fixes
// ============================================================

import {
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./config";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "A" | "K" | "Q" | "J"
  | "2" | "3" | "4" | "5"
  | "6" | "7" | "8" | "9";

export interface Card {
  rank: Rank;
  suit: Suit;
  id: string;
}

export type PlayerStatus = "waiting" | "blind" | "seen" | "packed" | "show";

export interface NineCardPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  status: PlayerStatus;
  hasPaidBoot: boolean;
  currentBet: number;
  totalBet: number;
  cardIds: string[];
  isMyTurn: boolean;
  seenCards: boolean;
  connected: boolean;
  joinedAt: Timestamp | null;
  // ✅ NEW: Per-player turn timer
  turnStartedAt: Timestamp | null;
  autoCallAt: Timestamp | null;
}

export type TableStatus =
  | "waiting"
  | "booting"
  | "playing"
  | "showdown"
  | "finished"
  | "disabled";

export interface NineCardTable {
  id: string;
  name: string;
  bootAmount: number;
  status: TableStatus;
  locked: boolean;
  createdBy: string;
  players: Record<string, NineCardPlayer>;
  playerOrder: string[];
  pot: number;
  currentCallAmount: number;
  currentTurn: string | null;
  round: number;
  deck: string[];
  deckIndex: number;
  winnerId: string | null;
  winnerReason: string | null;
  isDraw: boolean;
  history: RoundHistory[];
  minPlayers: number;
  maxPlayers: number;
  // ✅ NEW: Raise tracking
  lastRaiseBy: string | null;
  lastRaiseAmount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface RoundHistory {
  round: number;
  winnerId: string | null;
  winnerName: string | null;
  pot: number;
  reason: string;
  isDraw: boolean;
  timestamp: Timestamp | null;
}

// ─────────────────────────────────────────────
// CARD ENGINE
// ─────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A","K","Q","J","2","3","4","5","6","7","8","9"];
const ENGLISH_CARDS = new Set<Rank>(["A", "K", "Q", "J"]);
const ENGLISH_RANK: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit, id: `${rank}${suit}` });
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function getCardById(id: string): Card {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  return { rank, suit, id };
}

export function computeHandValue(cardIds: string[]): {
  value: number;
  englishRank: number;
  isTie: boolean;
} {
  const [c1, c2] = cardIds.map(getCardById);
  const r1 = c1.rank;
  const r2 = c2.rank;
  const isEng1 = ENGLISH_CARDS.has(r1);
  const isEng2 = ENGLISH_CARDS.has(r2);

  if (isEng1 && isEng2) {
    const er = Math.max(ENGLISH_RANK[r1] || 0, ENGLISH_RANK[r2] || 0);
    return { value: -1, englishRank: er, isTie: true };
  }

  if (!isEng1 && !isEng2) {
    const n1 = parseInt(r1);
    const n2 = parseInt(r2);
    return { value: (n1 + n2) % 10, englishRank: 0, isTie: false };
  }

  const numCard = isEng1 ? c2 : c1;
  const engCard = isEng1 ? c1 : c2;
  return {
    value: parseInt(numCard.rank),
    englishRank: ENGLISH_RANK[engCard.rank] || 0,
    isTie: false,
  };
}

export function compareHands(
  aCards: string[],
  bCards: string[]
): "a" | "b" | "draw" {
  const a = computeHandValue(aCards);
  const b = computeHandValue(bCards);

  if (a.isTie && b.isTie) {
    if (a.englishRank > b.englishRank) return "a";
    if (b.englishRank > a.englishRank) return "b";
    return "draw";
  }

  if (a.isTie && !b.isTie) return b.value >= 0 ? "b" : "draw";
  if (b.isTie && !a.isTie) return a.value >= 0 ? "a" : "draw";

  if (a.value > b.value) return "a";
  if (b.value > a.value) return "b";

  if (a.englishRank > b.englishRank) return "a";
  if (b.englishRank > a.englishRank) return "b";

  return "draw";
}

// ─────────────────────────────────────────────
// FIREBASE HELPERS
// ─────────────────────────────────────────────

const TABLES_COL = "nineCardTables";
const AUTO_CALL_SECONDS = 15;

export function tableRef(tableId: string): DocumentReference {
  return doc(db, TABLES_COL, tableId);
}

export function subscribeTable(
  tableId: string,
  callback: (table: NineCardTable | null) => void
): () => void {
  return onSnapshot(tableRef(tableId), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback({ id: snap.id, ...snap.data() } as NineCardTable);
  });
}

export function subscribeLobby(
  callback: (tables: NineCardTable[]) => void
): () => void {
  return onSnapshot(collection(db, TABLES_COL), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NineCardTable)));
  });
}

// ─────────────────────────────────────────────
// ADMIN ACTIONS
// ─────────────────────────────────────────────

export async function adminCreateTable(
  adminUid: string,
  name: string,
  bootAmount: number,
  maxPlayers: 2 | 3 | 4 = 2
): Promise<string> {
  const ref = doc(collection(db, TABLES_COL));
  const table: Omit<NineCardTable, "id"> = {
    name,
    bootAmount,
    status: "waiting",
    locked: false,
    createdBy: adminUid,
    players: {},
    playerOrder: [],
    pot: 0,
    currentCallAmount: bootAmount,
    currentTurn: null,
    round: 0,
    deck: [],
    deckIndex: 0,
    winnerId: null,
    winnerReason: null,
    isDraw: false,
    history: [],
    minPlayers: 2,
    maxPlayers,
    lastRaiseBy: null,
    lastRaiseAmount: 0,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, table);
  return ref.id;
}

export async function adminToggleTable(tableId: string, disabled: boolean): Promise<void> {
  await updateDoc(tableRef(tableId), {
    status: disabled ? "disabled" : "waiting",
    updatedAt: serverTimestamp(),
  });
}

export async function adminToggleLock(tableId: string, locked: boolean): Promise<void> {
  await updateDoc(tableRef(tableId), { locked, updatedAt: serverTimestamp() });
}

export async function adminDeleteTable(tableId: string): Promise<void> {
  await updateDoc(tableRef(tableId), { status: "disabled", updatedAt: serverTimestamp() });
}

// ─────────────────────────────────────────────
// PLAYER ACTIONS
// ─────────────────────────────────────────────

export async function joinTable(
  tableId: string,
  uid: string,
  displayName: string,
  photoURL?: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    // ── VALIDATE ──
    if (table.locked) throw new Error("Table is locked");
    if (table.status === "disabled") throw new Error("Table is disabled");
    if (table.status === "playing") throw new Error("Game already in progress");
    if (Object.keys(table.players).length >= table.maxPlayers) throw new Error("Table is full");
    if (table.players[uid]) throw new Error("Already joined");

    // ── COMPUTE ──
    const player: NineCardPlayer = {
      uid,
      displayName,
      photoURL: photoURL || "",
      status: "waiting",
      hasPaidBoot: false,
      currentBet: 0,
      totalBet: 0,
      cardIds: [],
      isMyTurn: false,
      seenCards: false,
      connected: true,
      joinedAt: serverTimestamp() as Timestamp,
      turnStartedAt: null,
      autoCallAt: null,
    };

    const updatedPlayers = { ...table.players, [uid]: player };
    const updatedOrder = [...table.playerOrder, uid];
    const willBeFull = Object.keys(updatedPlayers).length >= table.maxPlayers;

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      locked: willBeFull,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function seeCards(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    // ── VALIDATE ──
    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (player.seenCards) throw new Error("Already seen cards");

    // ── COMPUTE ──
    const now = serverTimestamp() as Timestamp;
    const updatedPlayers = {
      ...table.players,
      [uid]: {
        ...player,
        seenCards: true,
        status: "seen" as PlayerStatus,
        // Timer continues, player still needs to call/raise/pack
        turnStartedAt: now,
        autoCallAt: now,
      },
    };

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function callBet(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    const callAmt = table.currentCallAmount;
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const balance = walletSnap.data().balance as number;
    if (balance < callAmt) throw new Error("Insufficient balance");

    // ── COMPUTE ──
    const order = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = order.indexOf(uid);
    const nextIdx = (myIdx + 1) % order.length;
    const nextUid = order[nextIdx];

    const now = serverTimestamp() as Timestamp;
    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: player.currentBet + callAmt,
      totalBet: player.totalBet + callAmt,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };
    updatedPlayers[nextUid] = {
      ...updatedPlayers[nextUid],
      isMyTurn: true,
      turnStartedAt: now,
      autoCallAt: now,
    };

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + callAmt,
      currentTurn: nextUid,
      updatedAt: serverTimestamp(),
    });

    tx.update(walletRef, {
      balance: balance - callAmt,
      updatedAt: serverTimestamp(),
    });
  });
}

// ✅ NEW: Raise bet
export async function raiseBet(
  tableId: string,
  uid: string,
  raiseAmount: number
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    // Seen player raises double, blind raises single
    const minRaise = player.seenCards
      ? table.currentCallAmount * 2
      : table.currentCallAmount;
    if (raiseAmount < minRaise)
      throw new Error(`Minimum raise is ₹${minRaise}`);

    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const balance = walletSnap.data().balance as number;
    if (balance < raiseAmount) throw new Error("Insufficient balance");

    // ── COMPUTE ──
    const order = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = order.indexOf(uid);
    const nextIdx = (myIdx + 1) % order.length;
    const nextUid = order[nextIdx];

    const now = serverTimestamp() as Timestamp;
    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: player.currentBet + raiseAmount,
      totalBet: player.totalBet + raiseAmount,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };
    updatedPlayers[nextUid] = {
      ...updatedPlayers[nextUid],
      isMyTurn: true,
      turnStartedAt: now,
      autoCallAt: now,
    };

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + raiseAmount,
      currentCallAmount: raiseAmount, // Opponent must match this raise
      currentTurn: nextUid,
      lastRaiseBy: uid,
      lastRaiseAmount: raiseAmount,
      updatedAt: serverTimestamp(),
    });

    tx.update(walletRef, {
      balance: balance - raiseAmount,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function packHand(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const winnerUid = order[(myIdx + 1) % order.length];
    const winnerPlayer = table.players[winnerUid];
    const pot = table.pot;

    const walletRef = doc(db, "wallets", winnerUid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const winnerBalance = walletSnap.data().balance as number;

    // ── COMPUTE ──
    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...updatedPlayers[uid],
      status: "packed",
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };

    const historyEntry: RoundHistory = {
      round: table.round,
      winnerId: winnerUid,
      winnerName: winnerPlayer.displayName,
      pot,
      reason: `${table.players[uid].displayName} packed`,
      isDraw: false,
      timestamp: serverTimestamp() as Timestamp,
    };

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId: winnerUid,
      winnerReason: `Opponent packed`,
      isDraw: false,
      status: "finished",
      history: [...table.history, historyEntry],
      updatedAt: serverTimestamp(),
    });

    tx.update(walletRef, {
      balance: winnerBalance + pot,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * ✅ FIX: showHands — reads sab pehle, phir writes
 * Both players cards visible after show
 */
export async function showHands(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (!player.seenCards) throw new Error("See cards before showing");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const oppUid = order[(myIdx + 1) % order.length];

    const myCards = table.players[uid].cardIds;
    const oppCards = table.players[oppUid].cardIds;

    const pot = table.pot;

    // Read all wallets needed BEFORE any write
    const isDraw = compareHands(myCards, oppCards) === "draw";
    const result = compareHands(myCards, oppCards);
    let winnerId: string | null = null;
    let winnerReason = "";
    let isDrawResult = false;

    if (result === "a") {
      winnerId = uid;
      winnerReason = "Higher hand value";
    } else if (result === "b") {
      winnerId = oppUid;
      winnerReason = "Higher hand value";
    } else {
      isDrawResult = true;
      winnerReason = "Draw — pot split";
    }

    // Read wallets for all players who need payout
    const walletReads: Record<string, { ref: ReturnType<typeof doc>; balance: number }> = {};
    for (const pUid of order) {
      const wRef = doc(db, "wallets", pUid);
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists()) throw new Error(`Wallet not found for ${pUid}`);
      walletReads[pUid] = { ref: wRef, balance: wSnap.data().balance as number };
    }

    // ── COMPUTE ──
    // ✅ FIX: Both players marked as "show" so cards are visible
    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...updatedPlayers[uid],
      status: "show" as PlayerStatus,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };
    updatedPlayers[oppUid] = {
      ...updatedPlayers[oppUid],
      status: "show" as PlayerStatus,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };

    const historyEntry: RoundHistory = {
      round: table.round,
      winnerId,
      winnerName: winnerId ? table.players[winnerId].displayName : null,
      pot,
      reason: winnerReason,
      isDraw: isDrawResult,
      timestamp: serverTimestamp() as Timestamp,
    };

    // ── WRITE TABLE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId,
      winnerReason,
      isDraw: isDrawResult,
      status: "finished",
      history: [...table.history, historyEntry],
      updatedAt: serverTimestamp(),
    });

    // ── WRITE WALLETS ──
    if (isDrawResult) {
      const half = Math.floor(pot / 2);
      const remainder = pot - half * 2; // Handle odd amounts
      for (let i = 0; i < order.length; i++) {
        const pUid = order[i];
        const extra = i === 0 ? remainder : 0; // Give remainder to first player
        tx.update(walletReads[pUid].ref, {
          balance: walletReads[pUid].balance + half + extra,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (winnerId) {
      tx.update(walletReads[winnerId].ref, {
        balance: walletReads[winnerId].balance + pot,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * ✅ FIX: leaveTable — player completely removed, pot distributed
 */
export async function leaveTable(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (!table.players[uid]) return;

    // If game is active — opponent wins pot
    if (table.status === "playing" || table.status === "booting") {
      const oppUid = table.playerOrder.find((id) => id !== uid);

      if (oppUid && table.players[oppUid]) {
        // Read opponent wallet BEFORE write
        const wRef = doc(db, "wallets", oppUid);
        const wSnap = await tx.get(wRef);

        // ── COMPUTE ──
        const historyEntry: RoundHistory = {
          round: table.round || 0,
          winnerId: oppUid,
          winnerName: table.players[oppUid].displayName,
          pot: table.pot,
          reason: `${table.players[uid].displayName} left the game`,
          isDraw: false,
          timestamp: serverTimestamp() as Timestamp,
        };

        // ✅ FIX: Remove leaving player completely from players map
        const updatedPlayers = { ...table.players };
        // Keep for winner overlay display, but mark as disconnected/packed
        updatedPlayers[uid] = {
          ...updatedPlayers[uid],
          status: "packed" as PlayerStatus,
          connected: false,
          isMyTurn: false,
          turnStartedAt: null,
          autoCallAt: null,
        };

        // ── WRITE ──
        tx.update(tableRef(tableId), {
          status: "finished",
          winnerId: oppUid,
          winnerReason: "Opponent left the game",
          isDraw: false,
          players: updatedPlayers,
          history: [...table.history, historyEntry],
          updatedAt: serverTimestamp(),
        });

        if (wSnap.exists() && table.pot > 0) {
          tx.update(wRef, {
            balance: (wSnap.data().balance as number) + table.pot,
            updatedAt: serverTimestamp(),
          });
        }
        return;
      }
    }

    // ✅ FIX: Not in game — completely remove player from table
    const updatedPlayers = { ...table.players };
    delete updatedPlayers[uid];
    const updatedOrder = table.playerOrder.filter((id) => id !== uid);

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      locked: false,
      currentTurn: table.currentTurn === uid ? null : table.currentTurn,
      status: updatedOrder.length === 0 ? "waiting" : table.status,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * ✅ FIX: autoStartGame — all reads before writes
 */
export async function autoStartGame(tableId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ 1: Table ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (table.status !== "waiting") return;
    if (Object.keys(table.players).length < table.minPlayers) return;

    // ── READ 2: All Wallets ──
    const walletData: Record<string, { balance: number }> = {};
    for (const uid of table.playerOrder) {
      const wRef = doc(db, "wallets", uid);
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists())
        throw new Error(`${table.players[uid].displayName} ka wallet nahi mila`);
      walletData[uid] = { balance: wSnap.data().balance as number };
    }

    // ── VALIDATE (after reads) ──
    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot && walletData[uid].balance < table.bootAmount) {
        throw new Error(`${p.displayName} ka balance kam hai`);
      }
    }

    // ── COMPUTE ──
    const updatedPlayers = { ...table.players };
    let newPot = table.pot;

    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot) {
        updatedPlayers[uid] = {
          ...p,
          hasPaidBoot: true,
          currentBet: table.bootAmount,
        };
        newPot += table.bootAmount;
      }
    }

    const deck = shuffleDeck(buildDeck());
    const deckIds = deck.map((c) => c.id);
    let deckIdx = 0;
    const now = serverTimestamp() as Timestamp;

    for (let i = 0; i < table.playerOrder.length; i++) {
      const uid = table.playerOrder[i];
      updatedPlayers[uid] = {
        ...updatedPlayers[uid],
        cardIds: [deckIds[deckIdx++], deckIds[deckIdx++]],
        status: "blind",
        isMyTurn: i === 0,
        // ✅ Set turn timer for first player
        turnStartedAt: i === 0 ? now : null,
        autoCallAt: i === 0 ? now : null,
      };
    }

    // ── WRITE 1: Wallets ──
    for (const uid of table.playerOrder) {
      if (!table.players[uid].hasPaidBoot) {
        const wRef = doc(db, "wallets", uid);
        tx.update(wRef, {
          balance: walletData[uid].balance - table.bootAmount,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // ── WRITE 2: Table ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: newPot,
      status: "playing",
      locked: true,
      deck: deckIds,
      deckIndex: deckIdx,
      currentTurn: table.playerOrder[0],
      currentCallAmount: table.bootAmount,
      lastRaiseBy: null,
      lastRaiseAmount: 0,
      round: (table.round || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * ✅ NEW: Auto-call when timer expires
 */
export async function autoCallBet(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ FIRST ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    // Only auto-call if it's still this player's turn and game is active
    if (table.currentTurn !== uid) return;
    if (table.status !== "playing") return;

    const player = table.players[uid];
    if (!player || player.status === "packed") return;

    const callAmt = table.currentCallAmount;
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) return;
    const balance = walletSnap.data().balance as number;

    // ── COMPUTE ──
    // If insufficient balance, auto-pack instead
    if (balance < callAmt) {
      const order = table.playerOrder.filter(
        (id) => table.players[id]?.status !== "packed"
      );
      const myIdx = order.indexOf(uid);
      const winnerUid = order[(myIdx + 1) % order.length];
      const winnerPlayer = table.players[winnerUid];

      const wRef = doc(db, "wallets", winnerUid);
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists()) return;

      const historyEntry: RoundHistory = {
        round: table.round,
        winnerId: winnerUid,
        winnerName: winnerPlayer.displayName,
        pot: table.pot,
        reason: `${player.displayName} auto-packed (no balance)`,
        isDraw: false,
        timestamp: serverTimestamp() as Timestamp,
      };

      const updatedPlayers = { ...table.players };
      updatedPlayers[uid] = {
        ...player,
        status: "packed",
        isMyTurn: false,
        turnStartedAt: null,
        autoCallAt: null,
      };

      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        winnerId: winnerUid,
        winnerReason: "Opponent timed out",
        isDraw: false,
        status: "finished",
        history: [...table.history, historyEntry],
        updatedAt: serverTimestamp(),
      });

      tx.update(wRef, {
        balance: (wSnap.data().balance as number) + table.pot,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Auto-call
    const order = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = order.indexOf(uid);
    const nextIdx = (myIdx + 1) % order.length;
    const nextUid = order[nextIdx];

    const nowTs = serverTimestamp() as Timestamp;
    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: player.currentBet + callAmt,
      totalBet: player.totalBet + callAmt,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
    };
    updatedPlayers[nextUid] = {
      ...updatedPlayers[nextUid],
      isMyTurn: true,
      turnStartedAt: nowTs,
      autoCallAt: nowTs,
    };

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + callAmt,
      currentTurn: nextUid,
      updatedAt: serverTimestamp(),
    });

    tx.update(walletRef, {
      balance: balance - callAmt,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function resetTable(tableId: string): Promise<void> {
  const snap = await getDoc(tableRef(tableId));
  if (!snap.exists()) return;
  const table = snap.data() as NineCardTable;

  const resetPlayers: Record<string, NineCardPlayer> = {};
  for (const uid of table.playerOrder) {
    if (!table.players[uid]) continue;
    resetPlayers[uid] = {
      ...table.players[uid],
      status: "waiting",
      hasPaidBoot: false,
      currentBet: 0,
      cardIds: [],
      isMyTurn: false,
      seenCards: false,
      turnStartedAt: null,
      autoCallAt: null,
    };
  }

  await updateDoc(tableRef(tableId), {
    players: resetPlayers,
    pot: 0,
    currentCallAmount: table.bootAmount,
    currentTurn: null,
    deck: [],
    deckIndex: 0,
    winnerId: null,
    winnerReason: null,
    isDraw: false,
    lastRaiseBy: null,
    lastRaiseAmount: 0,
    locked: Object.keys(resetPlayers).length >= table.maxPlayers,
    status: "waiting",
    updatedAt: serverTimestamp(),
  });
}
