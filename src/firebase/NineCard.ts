// ============================================================
// NineCard.ts — Types, Game Engine & Firebase Logic
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
  | "A"
  | "K"
  | "Q"
  | "J"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

export interface Card {
  rank: Rank;
  suit: Suit;
  id: string; // e.g. "A♠"
}

export type PlayerStatus = "waiting" | "blind" | "seen" | "packed" | "show";

export interface NineCardPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  status: PlayerStatus;
  hasPaidBoot: boolean;
  currentBet: number;    // amount put in this round
  totalBet: number;      // cumulative across rounds
  cardIds: string[];     // hidden from opponent
  isMyTurn: boolean;
  seenCards: boolean;
  connected: boolean;
  joinedAt: Timestamp | null;
}

export type TableStatus =
  | "waiting"   // waiting for 2nd player
  | "booting"   // collecting boot amounts
  | "playing"   // game in progress
  | "showdown"  // cards being revealed
  | "finished"  // round over
  | "disabled"; // admin disabled

export interface NineCardTable {
  id: string;
  name: string;
  bootAmount: number;
  status: TableStatus;
  locked: boolean;
  createdBy: string;        // admin uid
  players: Record<string, NineCardPlayer>;
  playerOrder: string[];    // [uid1, uid2] turn order
  pot: number;
  currentCallAmount: number;
  currentTurn: string | null;   // uid whose turn it is
  round: number;
  deck: string[];               // shuffled card IDs (server-side only)
  deckIndex: number;
  winnerId: string | null;
  winnerReason: string | null;
  isDraw: boolean;
  history: RoundHistory[];
  minPlayers: number;
  maxPlayers: number;
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

export type NineCardAction =
  | { type: "CALL" }
  | { type: "PACK" }
  | { type: "SEE_CARDS" }
  | { type: "SHOW" };

// ─────────────────────────────────────────────
// CARD ENGINE
// ─────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "K", "Q", "J", "2", "3", "4", "5", "6", "7", "8", "9"];
const ENGLISH_CARDS = new Set<Rank>(["A", "K", "Q", "J"]);
const ENGLISH_RANK: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle */
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

/** Compute hand value from 2 card IDs */
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

  // English + English → draw hand
  if (isEng1 && isEng2) {
    const er = Math.max(ENGLISH_RANK[r1] || 0, ENGLISH_RANK[r2] || 0);
    return { value: -1, englishRank: er, isTie: true };
  }

  // Number + Number
  if (!isEng1 && !isEng2) {
    const n1 = parseInt(r1);
    const n2 = parseInt(r2);
    return { value: (n1 + n2) % 10, englishRank: 0, isTie: false };
  }

  // Number + English (English ignored)
  const numCard = isEng1 ? c2 : c1;
  const engCard = isEng1 ? c1 : c2;
  return {
    value: parseInt(numCard.rank),
    englishRank: ENGLISH_RANK[engCard.rank] || 0,
    isTie: false,
  };
}

export interface HandResult {
  value: number;
  englishRank: number;
  isTie: boolean;
}

/**
 * Compare two hands.
 * Returns: "a" | "b" | "draw"
 */
export function compareHands(
  aCards: string[],
  bCards: string[]
): "a" | "b" | "draw" {
  const a = computeHandValue(aCards);
  const b = computeHandValue(bCards);

  // Both English+English
  if (a.isTie && b.isTie) {
    if (a.englishRank > b.englishRank) return "a";
    if (b.englishRank > a.englishRank) return "b";
    return "draw";
  }

  // One is Eng+Eng, other has numeric value
  if (a.isTie && !b.isTie) return b.value >= 0 ? "b" : "draw";
  if (b.isTie && !a.isTie) return a.value >= 0 ? "a" : "draw";

  // Compare numeric values
  if (a.value > b.value) return "a";
  if (b.value > a.value) return "b";

  // Equal values — compare english rank bonus
  if (a.englishRank > b.englishRank) return "a";
  if (b.englishRank > a.englishRank) return "b";

  return "draw";
}

// ─────────────────────────────────────────────
// FIREBASE HELPERS
// ─────────────────────────────────────────────

const TABLES_COL = "nineCardTables";

export function tableRef(tableId: string): DocumentReference {
  return doc(db, TABLES_COL, tableId);
}

/** Subscribe to a table in real-time */
export function subscribeTable(
  tableId: string,
  callback: (table: NineCardTable | null) => void
): () => void {
  return onSnapshot(tableRef(tableId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: snap.id, ...snap.data() } as NineCardTable);
  });
}

/** Fetch all available (non-disabled) tables */
export async function fetchAllTables(): Promise<NineCardTable[]> {
  const q = query(
    collection(db, TABLES_COL),
    where("status", "!=", "disabled")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NineCardTable));
}

/** Subscribe to all tables for lobby */
export function subscribeLobby(
  callback: (tables: NineCardTable[]) => void
): () => void {
  return onSnapshot(collection(db, TABLES_COL), (snap) => {
    const tables = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as NineCardTable)
    );
    callback(tables);
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
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, table);
  return ref.id;
}

export async function adminToggleTable(
  tableId: string,
  disabled: boolean
): Promise<void> {
  await updateDoc(tableRef(tableId), {
    status: disabled ? "disabled" : "waiting",
    updatedAt: serverTimestamp(),
  });
}

export async function adminToggleLock(
  tableId: string,
  locked: boolean
): Promise<void> {
  await updateDoc(tableRef(tableId), {
    locked,
    updatedAt: serverTimestamp(),
  });
}

export async function adminDeleteTable(tableId: string): Promise<void> {
  await updateDoc(tableRef(tableId), {
    status: "disabled",
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
// PLAYER ACTIONS
// ─────────────────────────────────────────────

/** Join a table */
export async function joinTable(
  tableId: string,
  uid: string,
  displayName: string,
  photoURL?: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.locked) throw new Error("Table is locked");
    if (table.status === "disabled") throw new Error("Table is disabled");
    if (table.status === "playing") throw new Error("Game already in progress");
    if (Object.keys(table.players).length >= table.maxPlayers)
      throw new Error("Table is full");
    if (table.players[uid]) throw new Error("Already joined");

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
    };

    const updatedPlayers = { ...table.players, [uid]: player };
    const updatedOrder = [...table.playerOrder, uid];

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Pay boot amount & auto-start when all players paid */
export async function payBoot(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;
    const player = table.players[uid];
    if (!player) throw new Error("Not in this table");
    if (player.hasPaidBoot) throw new Error("Already paid boot");

    // Deduct from wallet
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const balance = walletSnap.data().balance as number;
    if (balance < table.bootAmount) throw new Error("Insufficient balance");

    const updatedPlayer: NineCardPlayer = {
      ...player,
      hasPaidBoot: true,
      currentBet: table.bootAmount,
    };

    const updatedPlayers = { ...table.players, [uid]: updatedPlayer };
    const newPot = table.pot + table.bootAmount;

    // Check if all players have paid
    const allPaid = Object.values(updatedPlayers).every((p) => p.hasPaidBoot);

    if (allPaid && Object.keys(updatedPlayers).length >= table.minPlayers) {
      // Deal cards and start game
      const deck = shuffleDeck(buildDeck());
      const deckIds = deck.map((c) => c.id);
      let deckIdx = 0;

      const playerOrder = table.playerOrder;
      const finalPlayers = { ...updatedPlayers };

      for (const pUid of playerOrder) {
        finalPlayers[pUid] = {
          ...finalPlayers[pUid],
          cardIds: [deckIds[deckIdx++], deckIds[deckIdx++]],
          status: "blind",
          isMyTurn: pUid === playerOrder[0],
        };
      }

      tx.update(tableRef(tableId), {
        players: finalPlayers,
        pot: newPot,
        status: "playing",
        deck: deckIds,
        deckIndex: deckIdx,
        currentTurn: playerOrder[0],
        currentCallAmount: table.bootAmount,
        round: 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        pot: newPot,
        status: "booting",
        updatedAt: serverTimestamp(),
      });
    }

    tx.update(walletRef, {
      balance: balance - table.bootAmount,
      updatedAt: serverTimestamp(),
    });
  });
}

/** See own cards */
export async function seeCards(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (player.seenCards) throw new Error("Already seen cards");

    const updatedPlayers = {
      ...table.players,
      [uid]: {
        ...player,
        seenCards: true,
        status: "seen" as PlayerStatus,
      },
    };

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Call — match current bet */
export async function callBet(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    const callAmt = table.currentCallAmount;

    // Deduct from wallet
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const balance = walletSnap.data().balance as number;
    if (balance < callAmt) throw new Error("Insufficient balance");

    // Advance turn
    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const nextIdx = (myIdx + 1) % order.length;
    const nextUid = order[nextIdx];

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: player.currentBet + callAmt,
      totalBet: player.totalBet + callAmt,
      isMyTurn: false,
    };
    updatedPlayers[nextUid] = {
      ...updatedPlayers[nextUid],
      isMyTurn: true,
    };

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

/** Pack / Fold */
export async function packHand(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const winnerUid = order[(myIdx + 1) % order.length];
    const winnerPlayer = table.players[winnerUid];
    const pot = table.pot;

    // Award pot to winner
    const walletRef = doc(db, "wallets", winnerUid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const winnerBalance = walletSnap.data().balance as number;

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = { ...updatedPlayers[uid], status: "packed" };

    const historyEntry: RoundHistory = {
      round: table.round,
      winnerId: winnerUid,
      winnerName: winnerPlayer.displayName,
      pot,
      reason: `${table.players[uid].displayName} packed`,
      isDraw: false,
      timestamp: null, // serverTimestamp() array mein allowed nahi
    };

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

/** Show — compare hands */
export async function showHands(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const oppUid = order[(myIdx + 1) % order.length];

    const myCards = table.players[uid].cardIds;
    const oppCards = table.players[oppUid].cardIds;

    const result = compareHands(myCards, oppCards);
    const pot = table.pot;
    let winnerId: string | null = null;
    let winnerReason = "";
    let isDraw = false;

    if (result === "a") {
      winnerId = uid;
      winnerReason = "Higher hand value";
    } else if (result === "b") {
      winnerId = oppUid;
      winnerReason = "Higher hand value";
    } else {
      isDraw = true;
      winnerReason = "Draw — pot split";
    }

    const historyEntry: RoundHistory = {
      round: table.round,
      winnerId,
      winnerName: winnerId ? table.players[winnerId].displayName : null,
      pot,
      reason: winnerReason,
      isDraw,
      timestamp: null, // serverTimestamp() array mein allowed nahi
    };

    tx.update(tableRef(tableId), {
      winnerId,
      winnerReason,
      isDraw,
      status: "finished",
      history: [...table.history, historyEntry],
      updatedAt: serverTimestamp(),
    });

    // Award pot
    if (isDraw) {
      const half = Math.floor(pot / 2);
      for (const pUid of order) {
        const wRef = doc(db, "wallets", pUid);
        const wSnap = await tx.get(wRef);
        if (wSnap.exists()) {
          tx.update(wRef, {
            balance: (wSnap.data().balance as number) + half,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } else if (winnerId) {
      const wRef = doc(db, "wallets", winnerId);
      const wSnap = await tx.get(wRef);
      if (wSnap.exists()) {
        tx.update(wRef, {
          balance: (wSnap.data().balance as number) + pot,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });
}

/** Leave / disconnect from table */
export async function leaveTable(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (!table.players[uid]) return;

    // If game playing and player leaves, opponent wins
    if (table.status === "playing") {
      const order = table.playerOrder;
      const myIdx = order.indexOf(uid);
      const oppUid = order[(myIdx + 1) % order.length];
      if (oppUid && table.players[oppUid]) {
        const wRef = doc(db, "wallets", oppUid);
        const wSnap = await tx.get(wRef);
        if (wSnap.exists()) {
          tx.update(wRef, {
            balance: (wSnap.data().balance as number) + table.pot,
            updatedAt: serverTimestamp(),
          });
        }
        tx.update(tableRef(tableId), {
          status: "finished",
          winnerId: oppUid,
          winnerReason: "Opponent disconnected",
          updatedAt: serverTimestamp(),
        });
        return;
      }
    }

    const updatedPlayers = { ...table.players };
    delete updatedPlayers[uid];
    const updatedOrder = table.playerOrder.filter((id) => id !== uid);

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      status: updatedOrder.length === 0 ? "waiting" : table.status,
      updatedAt: serverTimestamp(),
    });
  });
}
/** Reset table for next round */
export async function resetTable(tableId: string): Promise<void> {
  const snap = await getDoc(tableRef(tableId));
  if (!snap.exists()) return;
  const table = snap.data() as NineCardTable;

  const resetPlayers: Record<string, NineCardPlayer> = {};
  for (const uid of table.playerOrder) {
    resetPlayers[uid] = {
      ...table.players[uid],
      status: "waiting",
      hasPaidBoot: false,
      currentBet: 0,
      cardIds: [],
      isMyTurn: false,
      seenCards: false,
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
    status: "waiting",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Auto-start: Sab players ke liye boot pay karo aur game shuru karo.
 * Ye tab call hota hai jab 15 second countdown khatam ho.
 */
export async function autoStartGame(tableId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (table.status !== "waiting") return;
    if (Object.keys(table.players).length < table.minPlayers) return;

    // Sab players ki wallet check karo aur boot deduct karo
    const updatedPlayers = { ...table.players };
    let newPot = table.pot;

    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (p.hasPaidBoot) continue;

      const walletRef = doc(db, "wallets", uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists()) throw new Error(`Wallet not found for ${uid}`);
      const balance = walletSnap.data().balance as number;
      if (balance < table.bootAmount) throw new Error(`${p.displayName} ka balance kam hai`);

      tx.update(walletRef, {
        balance: balance - table.bootAmount,
        updatedAt: serverTimestamp(),
      });

      updatedPlayers[uid] = { ...p, hasPaidBoot: true, currentBet: table.bootAmount };
      newPot += table.bootAmount;
    }

    // Cards deal karo
    const deck = shuffleDeck(buildDeck());
    const deckIds = deck.map((c) => c.id);
    let deckIdx = 0;

    for (const uid of table.playerOrder) {
      updatedPlayers[uid] = {
        ...updatedPlayers[uid],
        cardIds: [deckIds[deckIdx++], deckIds[deckIdx++]],
        status: "blind",
        isMyTurn: uid === table.playerOrder[0],
      };
    }

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: newPot,
      status: "playing",
      deck: deckIds,
      deckIndex: deckIdx,
      currentTurn: table.playerOrder[0],
      currentCallAmount: table.bootAmount,
      round: 1,
      updatedAt: serverTimestamp(),
    });
  });
}
