// ============================================================
// NineCard.ts — Fixed with proper wallet.ts integration
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
import { calculateUsableBalance, calculateTotalBalance } from "../utils/helpers";
import type { Wallet } from "../types";

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
// WALLET HELPERS (internal)
// Yeh functions transaction ke ANDAR use honge
// ─────────────────────────────────────────────

/**
 * Wallet se amount deduct karo — same logic as deductFunds in wallet.ts
 * Deposit → Winning → Referral → Bonus (10%) order mein
 * Transaction ke ANDAR use karo (tx pass karo)
 */
function computeWalletDeduction(wallet: Wallet, amount: number): {
  newDeposit: number;
  newWinning: number;
  newReferral: number;
  newBonus: number;
  previousBalance: number;
  currentBalance: number;
} {
  const usable = calculateUsableBalance(wallet);
  if (usable < amount) throw new Error("Insufficient balance");

  let remaining = amount;
  let newDeposit = wallet.depositBalance;
  let newWinning = wallet.winningBalance;
  let newReferral = wallet.referralBalance;
  let newBonus = wallet.bonusBalance;

  // 1. Deposit pehle
  const fromDeposit = Math.min(newDeposit, remaining);
  newDeposit -= fromDeposit;
  remaining -= fromDeposit;

  // 2. Winning
  if (remaining > 0) {
    const fromWinning = Math.min(newWinning, remaining);
    newWinning -= fromWinning;
    remaining -= fromWinning;
  }

  // 3. Referral
  if (remaining > 0) {
    const fromReferral = Math.min(newReferral, remaining);
    newReferral -= fromReferral;
    remaining -= fromReferral;
  }

  // 4. Bonus max 10%
  if (remaining > 0) {
    const maxBonus = wallet.bonusBalance * 0.1;
    const fromBonus = Math.min(maxBonus, remaining);
    newBonus -= fromBonus;
    remaining -= fromBonus;
  }

  if (remaining > 0) throw new Error("Insufficient usable balance");

  const previousBalance = calculateTotalBalance(wallet);
  const currentBalance = previousBalance - amount;

  return { newDeposit, newWinning, newReferral, newBonus, previousBalance, currentBalance };
}

/**
 * Winning mein add karo (game jeetne pe)
 */
function computeWalletAddition(wallet: Wallet, amount: number): {
  newWinning: number;
  previousBalance: number;
  currentBalance: number;
} {
  const previousBalance = calculateTotalBalance(wallet);
  return {
    newWinning: wallet.winningBalance + amount,
    previousBalance,
    currentBalance: previousBalance + amount,
  };
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
export const AUTO_CALL_SECONDS = 15;

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

export async function joinTable(
  tableId: string,
  uid: string,
  displayName: string,
  photoURL?: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    // ── VALIDATE ──
    if (table.locked) throw new Error("Table is locked");
    if (table.status === "disabled") throw new Error("Table is disabled");
    if (table.status === "playing") throw new Error("Game already in progress");
    if (Object.keys(table.players).length >= table.maxPlayers)
      throw new Error("Table is full");
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
    const willBeFull =
      Object.keys(updatedPlayers).length >= table.maxPlayers;

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      locked: willBeFull,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function seeCards(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
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

    // ── WRITE ──
    tx.update(tableRef(tableId), {
      players: {
        ...table.players,
        [uid]: {
          ...player,
          seenCards: true,
          status: "seen" as PlayerStatus,
          turnStartedAt: now,
          autoCallAt: now,
        },
      },
      updatedAt: serverTimestamp(),
    });
  });
}

export async function callBet(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS (ALL READS PEHLE) ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    const callAmt = table.currentCallAmount;

    // Wallet read
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const wallet = walletSnap.data() as Wallet;

    // Transaction log ref
    const txLogRef = doc(collection(db, "transactions"));

    // ── COMPUTE ──
    // Wallet deduction (deposit → winning → referral → bonus order)
    const deduction = computeWalletDeduction(wallet, callAmt);

    // Next turn
    const activePlayers = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = activePlayers.indexOf(uid);
    const nextIdx = (myIdx + 1) % activePlayers.length;
    const nextUid = activePlayers[nextIdx];

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

    // ── WRITES ──
    // 1. Wallet update
    tx.update(walletRef, {
      depositBalance: deduction.newDeposit,
      winningBalance: deduction.newWinning,
      referralBalance: deduction.newReferral,
      bonusBalance: deduction.newBonus,
      updatedAt: serverTimestamp(),
    });

    // 2. Transaction log
    tx.set(txLogRef, {
      uid,
      type: "GAME_BET",
      amount: -callAmt,
      previousBalance: deduction.previousBalance,
      currentBalance: deduction.currentBalance,
      status: "COMPLETED",
      description: `9 Card bet — Call ₹${callAmt}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    // 3. Table update
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + callAmt,
      currentTurn: nextUid,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function raiseBet(
  tableId: string,
  uid: string,
  raiseAmount: number
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    // Seen player = 2x minimum, blind = 1x
    const minRaise = player.seenCards
      ? table.currentCallAmount * 2
      : table.currentCallAmount;
    if (raiseAmount < minRaise)
      throw new Error(`Minimum raise is ₹${minRaise}`);

    // Wallet read
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const wallet = walletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));

    // ── COMPUTE ──
    const deduction = computeWalletDeduction(wallet, raiseAmount);

    const activePlayers = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = activePlayers.indexOf(uid);
    const nextIdx = (myIdx + 1) % activePlayers.length;
    const nextUid = activePlayers[nextIdx];

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

    // ── WRITES ──
    tx.update(walletRef, {
      depositBalance: deduction.newDeposit,
      winningBalance: deduction.newWinning,
      referralBalance: deduction.newReferral,
      bonusBalance: deduction.newBonus,
      updatedAt: serverTimestamp(),
    });

    tx.set(txLogRef, {
      uid,
      type: "GAME_BET",
      amount: -raiseAmount,
      previousBalance: deduction.previousBalance,
      currentBalance: deduction.currentBalance,
      status: "COMPLETED",
      description: `9 Card bet — Raise ₹${raiseAmount}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + raiseAmount,
      currentCallAmount: raiseAmount,
      currentTurn: nextUid,
      lastRaiseBy: uid,
      lastRaiseAmount: raiseAmount,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function packHand(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const winnerUid = order[(myIdx + 1) % order.length];
    const winnerPlayer = table.players[winnerUid];
    const pot = table.pot;

    // Winner wallet read
    const winnerWalletRef = doc(db, "wallets", winnerUid);
    const winnerWalletSnap = await tx.get(winnerWalletRef);
    if (!winnerWalletSnap.exists()) throw new Error("Winner wallet not found");
    const winnerWallet = winnerWalletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));

    // ── COMPUTE ──
    const addition = computeWalletAddition(winnerWallet, pot);

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...updatedPlayers[uid],
      status: "packed" as PlayerStatus,
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

    // ── WRITES ──
    // 1. Winner wallet — winningBalance mein add
    tx.update(winnerWalletRef, {
      winningBalance: addition.newWinning,
      updatedAt: serverTimestamp(),
    });

    // 2. Transaction log
    tx.set(txLogRef, {
      uid: winnerUid,
      type: "GAME_WIN",
      amount: pot,
      previousBalance: addition.previousBalance,
      currentBalance: addition.currentBalance,
      status: "COMPLETED",
      description: `9 Card win — Opponent packed`,
      tableId,
      createdAt: serverTimestamp(),
    });

    // 3. Table update
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId: winnerUid,
      winnerReason: "Opponent packed",
      isDraw: false,
      status: "finished",
      history: [...table.history, historyEntry],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function showHands(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS (ALL PEHLE) ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");
    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (!player.seenCards) throw new Error("See cards pehle dekho");

    const order = table.playerOrder;
    const myIdx = order.indexOf(uid);
    const oppUid = order[(myIdx + 1) % order.length];

    const myCards = table.players[uid].cardIds;
    const oppCards = table.players[oppUid].cardIds;
    const pot = table.pot;

    // Read ALL wallets pehle
    const walletRefs: Record<string, ReturnType<typeof doc>> = {};
    const wallets: Record<string, Wallet> = {};
    for (const pUid of order) {
      walletRefs[pUid] = doc(db, "wallets", pUid);
      const wSnap = await tx.get(walletRefs[pUid]);
      if (!wSnap.exists()) throw new Error(`Wallet not found: ${pUid}`);
      wallets[pUid] = wSnap.data() as Wallet;
    }

    // Tx log refs
    const txLogRefs: Record<string, ReturnType<typeof doc>> = {};
    for (const pUid of order) {
      txLogRefs[pUid] = doc(collection(db, "transactions"));
    }

    // ── COMPUTE ──
    const result = compareHands(myCards, oppCards);
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

    // Both players show status
    const updatedPlayers = { ...table.players };
    for (const pUid of order) {
      updatedPlayers[pUid] = {
        ...updatedPlayers[pUid],
        status: "show" as PlayerStatus,
        isMyTurn: false,
        turnStartedAt: null,
        autoCallAt: null,
      };
    }

    const historyEntry: RoundHistory = {
      round: table.round,
      winnerId,
      winnerName: winnerId ? table.players[winnerId].displayName : null,
      pot,
      reason: winnerReason,
      isDraw,
      timestamp: serverTimestamp() as Timestamp,
    };

    // ── WRITES ──
    // 1. Table update
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId,
      winnerReason,
      isDraw,
      status: "finished",
      history: [...table.history, historyEntry],
      updatedAt: serverTimestamp(),
    });

    // 2. Wallet + transaction log writes
    if (isDraw) {
      // Split pot
      const half = Math.floor(pot / 2);
      const remainder = pot - half * 2;

      for (let i = 0; i < order.length; i++) {
        const pUid = order[i];
        const extra = i === 0 ? remainder : 0;
        const payout = half + extra;
        const addition = computeWalletAddition(wallets[pUid], payout);

        tx.update(walletRefs[pUid], {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRefs[pUid], {
          uid: pUid,
          type: "GAME_WIN",
          amount: payout,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card — Draw, pot split ₹${payout}`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }
    } else if (winnerId) {
      // Winner gets full pot
      const addition = computeWalletAddition(wallets[winnerId], pot);

      tx.update(walletRefs[winnerId], {
        winningBalance: addition.newWinning,
        updatedAt: serverTimestamp(),
      });

      tx.set(txLogRefs[winnerId], {
        uid: winnerId,
        type: "GAME_WIN",
        amount: pot,
        previousBalance: addition.previousBalance,
        currentBalance: addition.currentBalance,
        status: "COMPLETED",
        description: `9 Card win — Show ₹${pot}`,
        tableId,
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function leaveTable(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (!table.players[uid]) return;

    // Game active hai — opponent wins
    if (table.status === "playing" || table.status === "booting") {
      const oppUid = table.playerOrder.find((id) => id !== uid);

      if (oppUid && table.players[oppUid] && table.pot > 0) {
        // Opponent wallet read
        const oppWalletRef = doc(db, "wallets", oppUid);
        const oppWalletSnap = await tx.get(oppWalletRef);
        if (!oppWalletSnap.exists()) throw new Error("Opponent wallet not found");
        const oppWallet = oppWalletSnap.data() as Wallet;

        const txLogRef = doc(collection(db, "transactions"));

        // ── COMPUTE ──
        const addition = computeWalletAddition(oppWallet, table.pot);

        const historyEntry: RoundHistory = {
          round: table.round || 0,
          winnerId: oppUid,
          winnerName: table.players[oppUid].displayName,
          pot: table.pot,
          reason: `${table.players[uid].displayName} left the game`,
          isDraw: false,
          timestamp: serverTimestamp() as Timestamp,
        };

        const updatedPlayers = { ...table.players };
        updatedPlayers[uid] = {
          ...updatedPlayers[uid],
          status: "packed" as PlayerStatus,
          connected: false,
          isMyTurn: false,
          turnStartedAt: null,
          autoCallAt: null,
        };

        // ── WRITES ──
        tx.update(oppWalletRef, {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRef, {
          uid: oppUid,
          type: "GAME_WIN",
          amount: table.pot,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card win — Opponent left`,
          tableId,
          createdAt: serverTimestamp(),
        });

        tx.update(tableRef(tableId), {
          status: "finished",
          winnerId: oppUid,
          winnerReason: "Opponent left the game",
          isDraw: false,
          players: updatedPlayers,
          history: [...table.history, historyEntry],
          updatedAt: serverTimestamp(),
        });
      }
      return;
    }

    // Waiting/finished — player ko remove karo
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

export async function autoStartGame(tableId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READ 1: Table ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (table.status !== "waiting") return;
    if (Object.keys(table.players).length < table.minPlayers) return;

    // ── READ 2: ALL Wallets pehle ──
    const walletRefs: Record<string, ReturnType<typeof doc>> = {};
    const wallets: Record<string, Wallet> = {};
    const txLogRefs: Record<string, ReturnType<typeof doc>> = {};

    for (const uid of table.playerOrder) {
      walletRefs[uid] = doc(db, "wallets", uid);
      const wSnap = await tx.get(walletRefs[uid]);
      if (!wSnap.exists())
        throw new Error(`${table.players[uid].displayName} ka wallet nahi mila`);
      wallets[uid] = wSnap.data() as Wallet;
      txLogRefs[uid] = doc(collection(db, "transactions"));
    }

    // ── VALIDATE ──
    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot) {
        const usable = calculateUsableBalance(wallets[uid]);
        if (usable < table.bootAmount) {
          throw new Error(`${p.displayName} ka balance kam hai (₹${table.bootAmount} chahiye)`);
        }
      }
    }

    // ── COMPUTE ──
    const updatedPlayers = { ...table.players };
    const deductions: Record<string, ReturnType<typeof computeWalletDeduction>> = {};
    let newPot = table.pot;

    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot) {
        deductions[uid] = computeWalletDeduction(wallets[uid], table.bootAmount);
        updatedPlayers[uid] = {
          ...p,
          hasPaidBoot: true,
          currentBet: table.bootAmount,
        };
        newPot += table.bootAmount;
      }
    }

    // Deal cards
    const deck = shuffleDeck(buildDeck());
    const deckIds = deck.map((c) => c.id);
    let deckIdx = 0;
    const now = serverTimestamp() as Timestamp;

    for (let i = 0; i < table.playerOrder.length; i++) {
      const uid = table.playerOrder[i];
      updatedPlayers[uid] = {
        ...updatedPlayers[uid],
        cardIds: [deckIds[deckIdx++], deckIds[deckIdx++]],
        status: "blind" as PlayerStatus,
        isMyTurn: i === 0,
        turnStartedAt: i === 0 ? now : null,
        autoCallAt: i === 0 ? now : null,
      };
    }

    // ── WRITES ──
    // 1. Wallet deductions + transaction logs
    for (const uid of table.playerOrder) {
      if (!table.players[uid].hasPaidBoot) {
        const d = deductions[uid];
        tx.update(walletRefs[uid], {
          depositBalance: d.newDeposit,
          winningBalance: d.newWinning,
          referralBalance: d.newReferral,
          bonusBalance: d.newBonus,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRefs[uid], {
          uid,
          type: "GAME_BET",
          amount: -table.bootAmount,
          previousBalance: d.previousBalance,
          currentBalance: d.currentBalance,
          status: "COMPLETED",
          description: `9 Card boot amount ₹${table.bootAmount}`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 2. Table update
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

export async function autoCallBet(
  tableId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // ── READS ──
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) return;
    if (table.status !== "playing") return;

    const player = table.players[uid];
    if (!player || player.status === "packed") return;

    const callAmt = table.currentCallAmount;
    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) return;
    const wallet = walletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));

    // ── COMPUTE ──
    const activePlayers = table.playerOrder.filter(
      (id) => table.players[id]?.status !== "packed"
    );
    const myIdx = activePlayers.indexOf(uid);
    const nextIdx = (myIdx + 1) % activePlayers.length;
    const nextUid = activePlayers[nextIdx];
    const now = serverTimestamp() as Timestamp;

    const usable = calculateUsableBalance(wallet);

    // Balance nahi hai — auto pack
    if (usable < callAmt) {
      const winnerUid = nextUid;
      const winnerWalletRef = doc(db, "wallets", winnerUid);
      const winnerWalletSnap = await tx.get(winnerWalletRef);
      if (!winnerWalletSnap.exists()) return;
      const winnerWallet = winnerWalletSnap.data() as Wallet;

      const winTxRef = doc(collection(db, "transactions"));
      const addition = computeWalletAddition(winnerWallet, table.pot);

      const historyEntry: RoundHistory = {
        round: table.round,
        winnerId: winnerUid,
        winnerName: table.players[winnerUid].displayName,
        pot: table.pot,
        reason: `${player.displayName} auto-packed (insufficient balance)`,
        isDraw: false,
        timestamp: serverTimestamp() as Timestamp,
      };

      const updatedPlayers = { ...table.players };
      updatedPlayers[uid] = {
        ...player,
        status: "packed" as PlayerStatus,
        isMyTurn: false,
        turnStartedAt: null,
        autoCallAt: null,
      };

      // ── WRITES ──
      tx.update(winnerWalletRef, {
        winningBalance: addition.newWinning,
        updatedAt: serverTimestamp(),
      });
      tx.set(winTxRef, {
        uid: winnerUid,
        type: "GAME_WIN",
        amount: table.pot,
        previousBalance: addition.previousBalance,
        currentBalance: addition.currentBalance,
        status: "COMPLETED",
        description: `9 Card win — Opponent timed out`,
        tableId,
        createdAt: serverTimestamp(),
      });
      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        winnerId: winnerUid,
        winnerReason: "Opponent timed out",
        isDraw: false,
        status: "finished",
        history: [...table.history, historyEntry],
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Auto call
    const deduction = computeWalletDeduction(wallet, callAmt);

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

    // ── WRITES ──
    tx.update(walletRef, {
      depositBalance: deduction.newDeposit,
      winningBalance: deduction.newWinning,
      referralBalance: deduction.newReferral,
      bonusBalance: deduction.newBonus,
      updatedAt: serverTimestamp(),
    });

    tx.set(txLogRef, {
      uid,
      type: "GAME_BET",
      amount: -callAmt,
      previousBalance: deduction.previousBalance,
      currentBalance: deduction.currentBalance,
      status: "COMPLETED",
      description: `9 Card — Auto-call ₹${callAmt}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: table.pot + callAmt,
      currentTurn: nextUid,
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
