// ============================================================
// NineCard.ts — Final
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
import type { Wallet } from "../types";
import { calculateUsableBalance, calculateTotalBalance } from "../utils/helpers";

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
  timeoutCount: number; // ✅ first timeout auto action, second timeout = leave
}

export type TableStatus =
  | "waiting"
  | "booting"
  | "playing"
  | "showdown"
  | "finished"
  | "disabled";

export interface RoundHistory {
  round: number;
  winnerId: string | null;
  winnerName: string | null;
  pot: number;
  reason: string;
  isDraw: boolean;
  timestamp: Timestamp | null;
}

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

export const AUTO_CALL_SECONDS = 15;

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
// WALLET HELPERS
// ─────────────────────────────────────────────

function computeWalletDeduction(wallet: Wallet, amount: number) {
  const safeWallet = {
    depositBalance: wallet.depositBalance || 0,
    winningBalance: wallet.winningBalance || 0,
    referralBalance: wallet.referralBalance || 0,
    bonusBalance: wallet.bonusBalance || 0,
  };

  const usable = calculateUsableBalance(safeWallet as Wallet);
  if (usable < amount) throw new Error("Insufficient balance");

  let remaining = amount;
  let newDeposit = safeWallet.depositBalance;
  let newWinning = safeWallet.winningBalance;
  let newReferral = safeWallet.referralBalance;
  let newBonus = safeWallet.bonusBalance;

  const fromDeposit = Math.min(newDeposit, remaining);
  newDeposit -= fromDeposit;
  remaining -= fromDeposit;

  if (remaining > 0) {
    const fromWinning = Math.min(newWinning, remaining);
    newWinning -= fromWinning;
    remaining -= fromWinning;
  }

  if (remaining > 0) {
    const fromReferral = Math.min(newReferral, remaining);
    newReferral -= fromReferral;
    remaining -= fromReferral;
  }

  if (remaining > 0) {
    const maxBonus = safeWallet.bonusBalance * 0.1;
    const fromBonus = Math.min(maxBonus, remaining);
    newBonus -= fromBonus;
    remaining -= fromBonus;
  }

  if (remaining > 0) throw new Error("Insufficient usable balance");

  const previousBalance = calculateTotalBalance(safeWallet as Wallet);
  const currentBalance = previousBalance - amount;

  return {
    newDeposit,
    newWinning,
    newReferral,
    newBonus,
    previousBalance,
    currentBalance,
  };
}

function computeWalletAddition(wallet: Wallet, amount: number) {
  const safeWallet = {
    depositBalance: wallet.depositBalance || 0,
    winningBalance: wallet.winningBalance || 0,
    referralBalance: wallet.referralBalance || 0,
    bonusBalance: wallet.bonusBalance || 0,
  };

  const previousBalance = calculateTotalBalance(safeWallet as Wallet);

  return {
    newWinning: safeWallet.winningBalance + amount,
    previousBalance,
    currentBalance: previousBalance + amount,
  };
}

// ─────────────────────────────────────────────
// FIREBASE HELPERS
// ─────────────────────────────────────────────

const TABLES_COL = "nineCardTables";

export function tableRef(tableId: string): DocumentReference {
  return doc(db, TABLES_COL, tableId);
}

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

export async function fetchAllTables(): Promise<NineCardTable[]> {
  const q = query(collection(db, TABLES_COL), where("status", "!=", "disabled"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NineCardTable));
}

export function subscribeLobby(
  callback: (tables: NineCardTable[]) => void
): () => void {
  return onSnapshot(collection(db, TABLES_COL), (snap) => {
    const tables = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NineCardTable));
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
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.locked) throw new Error("Table is locked");
    if (table.status === "disabled") throw new Error("Table is disabled");
    if (table.status === "playing") throw new Error("Game already in progress");
    if (Object.keys(table.players).length >= table.maxPlayers) throw new Error("Table is full");
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
      turnStartedAt: null,
      autoCallAt: null,
      timeoutCount: 0,
    };

    const updatedPlayers = { ...table.players, [uid]: player };
    const updatedOrder = [...table.playerOrder, uid];
    const willBeFull = Object.keys(updatedPlayers).length >= table.maxPlayers;

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
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");

    const table = snap.data() as NineCardTable;
    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (player.seenCards) throw new Error("Already seen cards");

    const now = serverTimestamp() as Timestamp;

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

export async function callBet(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    const callAmt = Number(table.currentCallAmount || 0);

    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const wallet = walletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));

    const deduction = computeWalletDeduction(wallet, callAmt);

    const activePlayers = table.playerOrder.filter((id) => table.players[id]?.status !== "packed");
    const myIdx = activePlayers.indexOf(uid);
    const nextIdx = (myIdx + 1) % activePlayers.length;
    const nextUid = activePlayers[nextIdx];
    const now = serverTimestamp() as Timestamp;

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: (player.currentBet || 0) + callAmt,
      totalBet: (player.totalBet || 0) + callAmt,
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
      description: `9 Card call ₹${callAmt}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: Number(table.pot || 0) + callAmt,
      currentTurn: nextUid,
      lastRaiseBy: null,
      lastRaiseAmount: 0,
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
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const player = table.players[uid];
    if (!player) throw new Error("Player not found");

    const minRaise = player.seenCards
      ? Number(table.currentCallAmount || 0) * 2
      : Number(table.currentCallAmount || 0);

    if (raiseAmount < minRaise) {
      throw new Error(`Minimum raise is ₹${minRaise}`);
    }

    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error("Wallet not found");
    const wallet = walletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));
    const deduction = computeWalletDeduction(wallet, raiseAmount);

    const activePlayers = table.playerOrder.filter((id) => table.players[id]?.status !== "packed");
    const myIdx = activePlayers.indexOf(uid);
    const nextIdx = (myIdx + 1) % activePlayers.length;
    const nextUid = activePlayers[nextIdx];
    const now = serverTimestamp() as Timestamp;

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: (player.currentBet || 0) + raiseAmount,
      totalBet: (player.totalBet || 0) + raiseAmount,
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
      description: `9 Card raise ₹${raiseAmount}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: Number(table.pot || 0) + raiseAmount,
      currentCallAmount: raiseAmount,
      currentTurn: nextUid,
      lastRaiseBy: uid,
      lastRaiseAmount: raiseAmount,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function packHand(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const order = table.playerOrder.filter((id) => table.players[id]);
    const myIdx = order.indexOf(uid);
    const winnerUid = order[(myIdx + 1) % order.length];
    const winnerPlayer = table.players[winnerUid];
    const payoutAmount = Number(table.pot || 0);

    const winnerWalletRef = doc(db, "wallets", winnerUid);
    const winnerWalletSnap = await tx.get(winnerWalletRef);
    if (!winnerWalletSnap.exists()) throw new Error("Winner wallet not found");
    const winnerWallet = winnerWalletSnap.data() as Wallet;

    const txLogRef = doc(collection(db, "transactions"));
    const addition = computeWalletAddition(winnerWallet, payoutAmount);

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
      winnerName: winnerPlayer?.displayName || "Player",
      pot: payoutAmount,
      reason: `${table.players[uid].displayName} packed`,
      isDraw: false,
      timestamp: Timestamp.now(),
    };

    if (payoutAmount > 0) {
      tx.update(winnerWalletRef, {
        winningBalance: addition.newWinning,
        updatedAt: serverTimestamp(),
      });

      tx.set(txLogRef, {
        uid: winnerUid,
        type: "GAME_WIN",
        amount: payoutAmount,
        previousBalance: addition.previousBalance,
        currentBalance: addition.currentBalance,
        status: "COMPLETED",
        description: `9 Card win — Opponent packed`,
        tableId,
        createdAt: serverTimestamp(),
      });
    }

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId: winnerUid,
      winnerReason: "Opponent packed",
      isDraw: false,
      status: "finished",
      history: [...table.history, historyEntry],
      lastRaiseBy: null,
      lastRaiseAmount: 0,
      currentTurn: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function showHands(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // READS first
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) throw new Error("Table not found");
    const table = snap.data() as NineCardTable;

    if (table.currentTurn !== uid) throw new Error("Not your turn");

    const player = table.players[uid];
    if (!player) throw new Error("Player not found");
    if (!player.seenCards) throw new Error("See cards first");

    const order = table.playerOrder.filter((id) => table.players[id]);
    const myIdx = order.indexOf(uid);
    const oppUid = order[(myIdx + 1) % order.length];

    const myCards = table.players[uid].cardIds;
    const oppCards = table.players[oppUid].cardIds;
    const payoutAmount = Number(table.pot || 0);

    const walletRefs: Record<string, ReturnType<typeof doc>> = {};
    const wallets: Record<string, Wallet> = {};
    const txRefs: Record<string, ReturnType<typeof doc>> = {};

    for (const pUid of order) {
      walletRefs[pUid] = doc(db, "wallets", pUid);
      const wSnap = await tx.get(walletRefs[pUid]);
      if (!wSnap.exists()) throw new Error(`Wallet not found: ${pUid}`);
      wallets[pUid] = wSnap.data() as Wallet;
      txRefs[pUid] = doc(collection(db, "transactions"));
    }

    // COMPUTE
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
      pot: payoutAmount,
      reason: winnerReason,
      isDraw,
      timestamp: Timestamp.now(),
    };

    // WRITES
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      winnerId,
      winnerReason,
      isDraw,
      status: "finished",
      history: [...table.history, historyEntry],
      lastRaiseBy: null,
      lastRaiseAmount: 0,
      currentTurn: null,
      updatedAt: serverTimestamp(),
    });

    if (isDraw) {
      const half = Math.floor(payoutAmount / 2);
      const remainder = payoutAmount - half * 2;

      for (let i = 0; i < order.length; i++) {
        const pUid = order[i];
        const payout = half + (i === 0 ? remainder : 0);
        const addition = computeWalletAddition(wallets[pUid], payout);

        if (payout > 0) {
          tx.update(walletRefs[pUid], {
            winningBalance: addition.newWinning,
            updatedAt: serverTimestamp(),
          });

          tx.set(txRefs[pUid], {
            uid: pUid,
            type: "GAME_WIN",
            amount: payout,
            previousBalance: addition.previousBalance,
            currentBalance: addition.currentBalance,
            status: "COMPLETED",
            description: `9 Card draw split ₹${payout}`,
            tableId,
            createdAt: serverTimestamp(),
          });
        }
      }
    } else if (winnerId) {
      const addition = computeWalletAddition(wallets[winnerId], payoutAmount);

      if (payoutAmount > 0) {
        tx.update(walletRefs[winnerId], {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txRefs[winnerId], {
          uid: winnerId,
          type: "GAME_WIN",
          amount: payoutAmount,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card show win ₹${payoutAmount}`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }
    }
  });
}

export async function leaveTable(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;
    const table = snap.data() as NineCardTable;
    if (!table.players[uid]) return;

    const updatedPlayers = { ...table.players };
    const updatedOrder = table.playerOrder.filter((id) => id !== uid);

    // ── Active game: opponent wins pot ──
    if (
      (table.status === "playing" || table.status === "booting") &&
      updatedOrder.length > 0
    ) {
      const winnerUid = updatedOrder[0];
      const payoutAmount = Number(table.pot || 0);

      const winnerWalletRef = doc(db, "wallets", winnerUid);
      const winnerWalletSnap = await tx.get(winnerWalletRef);
      if (!winnerWalletSnap.exists()) throw new Error("Winner wallet not found");
      const winnerWallet = winnerWalletSnap.data() as Wallet;

      const txLogRef = doc(collection(db, "transactions"));
      const addition = computeWalletAddition(winnerWallet, payoutAmount);

      // Remove leaving player completely
      delete updatedPlayers[uid];

      const historyEntry: RoundHistory = {
        round: table.round || 0,
        winnerId: winnerUid,
        winnerName: table.players[winnerUid]?.displayName || "Player",
        pot: payoutAmount,
        reason: `${table.players[uid].displayName} left the game`,
        isDraw: false,
        timestamp: Timestamp.now(),
      };

      if (payoutAmount > 0) {
        tx.update(winnerWalletRef, {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });
        tx.set(txLogRef, {
          uid: winnerUid,
          type: "GAME_WIN",
          amount: payoutAmount,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card win — Opponent left`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        playerOrder: updatedOrder,
        status: "finished",
        winnerId: winnerUid,
        winnerReason: "Opponent left the table",
        isDraw: false,
        history: [...table.history, historyEntry],
        currentTurn: null,
        locked: false,
        lastRaiseBy: null,
        lastRaiseAmount: 0,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ── Dono players chale gaye ya game finish/waiting ──
    delete updatedPlayers[uid];

    // ✅ Agar koi bhi player nahi bacha — table poora reset karo
    if (updatedOrder.length === 0) {
      tx.update(tableRef(tableId), {
        players: {},
        playerOrder: [],
        pot: 0,                    // ✅ pot clear
        currentCallAmount: table.bootAmount,
        currentTurn: null,
        deck: [],
        deckIndex: 0,
        winnerId: null,            // ✅ winner clear
        winnerReason: null,        // ✅ reason clear
        isDraw: false,
        lastRaiseBy: null,
        lastRaiseAmount: 0,
        locked: false,
        status: "waiting",         // ✅ back to waiting
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ── Ek player bacha, game waiting state me ──
    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      playerOrder: updatedOrder,
      pot: 0,                      // ✅ pot clear
      currentCallAmount: table.bootAmount,
      currentTurn: null,
      deck: [],
      deckIndex: 0,
      winnerId: null,              // ✅ winner clear
      winnerReason: null,
      isDraw: false,
      lastRaiseBy: null,
      lastRaiseAmount: 0,
      locked: false,
      status: "waiting",           // ✅ reset to waiting
      updatedAt: serverTimestamp(),
    });
  });
}

export async function autoStartGame(tableId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // READS
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;

    const table = snap.data() as NineCardTable;
    if (table.status !== "waiting") return;
    if (Object.keys(table.players).length < table.minPlayers) return;

    const walletRefs: Record<string, ReturnType<typeof doc>> = {};
    const wallets: Record<string, Wallet> = {};
    const txLogRefs: Record<string, ReturnType<typeof doc>> = {};

    for (const uid of table.playerOrder) {
      walletRefs[uid] = doc(db, "wallets", uid);
      const wSnap = await tx.get(walletRefs[uid]);
      if (!wSnap.exists()) {
        throw new Error(`${table.players[uid].displayName} ka wallet nahi mila`);
      }
      wallets[uid] = wSnap.data() as Wallet;
      txLogRefs[uid] = doc(collection(db, "transactions"));
    }

    // VALIDATE
    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot) {
        const usable = calculateUsableBalance(wallets[uid]);
        if (usable < table.bootAmount) {
          throw new Error(`${p.displayName} ka balance kam hai`);
        }
      }
    }

    // COMPUTE
    const updatedPlayers = { ...table.players };
    const deductions: Record<string, ReturnType<typeof computeWalletDeduction>> = {};
    let newPot = Number(table.pot || 0);

    for (const uid of table.playerOrder) {
      const p = table.players[uid];
      if (!p.hasPaidBoot) {
        deductions[uid] = computeWalletDeduction(wallets[uid], table.bootAmount);
        updatedPlayers[uid] = {
          ...p,
          hasPaidBoot: true,
          currentBet: table.bootAmount,
          totalBet: table.bootAmount,
          timeoutCount: 0,
        };
        newPot += table.bootAmount;
      } else {
        updatedPlayers[uid] = {
          ...p,
          timeoutCount: 0,
        };
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
        turnStartedAt: i === 0 ? now : null,
        autoCallAt: i === 0 ? now : null,
      };
    }

    // WRITES
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
          description: `9 Card boot ₹${table.bootAmount}`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }
    }

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
 * Timeout logic:
 * 1st timeout:
 *   - normal turn => auto call
 *   - if facing raise => auto pack
 * 2nd timeout:
 *   - direct leave from table
 */
export async function autoCallBet(tableId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // READS
    const snap = await tx.get(tableRef(tableId));
    if (!snap.exists()) return;

    const table = snap.data() as NineCardTable;
    if (table.status !== "playing") return;
    if (table.currentTurn !== uid) return;

    const player = table.players[uid];
    if (!player || player.status === "packed") return;

    const activePlayers = table.playerOrder.filter((id) => table.players[id]?.status !== "packed");
    if (activePlayers.length < 2) return;

    const myIdx = activePlayers.indexOf(uid);
    const nextUid = activePlayers[(myIdx + 1) % activePlayers.length];

    const callAmt = Number(table.currentCallAmount || 0);
    const payoutAmount = Number(table.pot || 0);
    const skipCount = Number(player.timeoutCount || 0);

    const hasPendingRaiseAgainstPlayer =
      !!table.lastRaiseBy &&
      table.lastRaiseBy !== uid &&
      Number(table.lastRaiseAmount || 0) > 0;

    const walletRef = doc(db, "wallets", uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) return;
    const wallet = walletSnap.data() as Wallet;

    // SECOND TIMEOUT = DIRECT LEAVE
    if (skipCount >= 1) {
      const winnerWalletRef = doc(db, "wallets", nextUid);
      const winnerWalletSnap = await tx.get(winnerWalletRef);
      if (!winnerWalletSnap.exists()) return;
      const winnerWallet = winnerWalletSnap.data() as Wallet;

      const txLogRef = doc(collection(db, "transactions"));
      const addition = computeWalletAddition(winnerWallet, payoutAmount);

      const updatedPlayers = { ...table.players };
      delete updatedPlayers[uid];
      const updatedOrder = table.playerOrder.filter((id) => id !== uid);

      const historyEntry: RoundHistory = {
        round: table.round,
        winnerId: nextUid,
        winnerName: table.players[nextUid].displayName,
        pot: payoutAmount,
        reason: `${player.displayName} removed after second timeout`,
        isDraw: false,
        timestamp: Timestamp.now(),
      };

      if (payoutAmount > 0) {
        tx.update(winnerWalletRef, {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRef, {
          uid: nextUid,
          type: "GAME_WIN",
          amount: payoutAmount,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card win — Opponent removed after second timeout`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        playerOrder: updatedOrder,
        winnerId: nextUid,
        winnerReason: "Opponent removed after second timeout",
        isDraw: false,
        status: "finished",
        history: [...table.history, historyEntry],
        currentTurn: null,
        locked: false,
        lastRaiseBy: null,
        lastRaiseAmount: 0,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    // FIRST TIMEOUT + RAISE = AUTO PACK
    if (hasPendingRaiseAgainstPlayer) {
      const winnerWalletRef = doc(db, "wallets", nextUid);
      const winnerWalletSnap = await tx.get(winnerWalletRef);
      if (!winnerWalletSnap.exists()) return;
      const winnerWallet = winnerWalletSnap.data() as Wallet;

      const txLogRef = doc(collection(db, "transactions"));
      const addition = computeWalletAddition(winnerWallet, payoutAmount);

      const updatedPlayers = { ...table.players };
      updatedPlayers[uid] = {
        ...player,
        status: "packed",
        isMyTurn: false,
        turnStartedAt: null,
        autoCallAt: null,
        timeoutCount: 1,
      };

      const historyEntry: RoundHistory = {
        round: table.round,
        winnerId: nextUid,
        winnerName: table.players[nextUid].displayName,
        pot: payoutAmount,
        reason: `${player.displayName} timed out after raise`,
        isDraw: false,
        timestamp: Timestamp.now(),
      };

      if (payoutAmount > 0) {
        tx.update(winnerWalletRef, {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRef, {
          uid: nextUid,
          type: "GAME_WIN",
          amount: payoutAmount,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card win — Opponent timed out after raise`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        winnerId: nextUid,
        winnerReason: "Opponent timed out after raise",
        isDraw: false,
        status: "finished",
        history: [...table.history, historyEntry],
        currentTurn: null,
        lastRaiseBy: null,
        lastRaiseAmount: 0,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    // FIRST TIMEOUT + NO BALANCE = AUTO PACK
    const usable = calculateUsableBalance(wallet);
    if (usable < callAmt) {
      const winnerWalletRef = doc(db, "wallets", nextUid);
      const winnerWalletSnap = await tx.get(winnerWalletRef);
      if (!winnerWalletSnap.exists()) return;
      const winnerWallet = winnerWalletSnap.data() as Wallet;

      const txLogRef = doc(collection(db, "transactions"));
      const addition = computeWalletAddition(winnerWallet, payoutAmount);

      const updatedPlayers = { ...table.players };
      updatedPlayers[uid] = {
        ...player,
        status: "packed",
        isMyTurn: false,
        turnStartedAt: null,
        autoCallAt: null,
        timeoutCount: 1,
      };

      const historyEntry: RoundHistory = {
        round: table.round,
        winnerId: nextUid,
        winnerName: table.players[nextUid].displayName,
        pot: payoutAmount,
        reason: `${player.displayName} auto-packed (insufficient balance)`,
        isDraw: false,
        timestamp: Timestamp.now(),
      };

      if (payoutAmount > 0) {
        tx.update(winnerWalletRef, {
          winningBalance: addition.newWinning,
          updatedAt: serverTimestamp(),
        });

        tx.set(txLogRef, {
          uid: nextUid,
          type: "GAME_WIN",
          amount: payoutAmount,
          previousBalance: addition.previousBalance,
          currentBalance: addition.currentBalance,
          status: "COMPLETED",
          description: `9 Card win — Opponent timed out`,
          tableId,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(tableRef(tableId), {
        players: updatedPlayers,
        winnerId: nextUid,
        winnerReason: "Opponent timed out",
        isDraw: false,
        status: "finished",
        history: [...table.history, historyEntry],
        currentTurn: null,
        lastRaiseBy: null,
        lastRaiseAmount: 0,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    // FIRST TIMEOUT NORMAL = AUTO CALL
    const txLogRef = doc(collection(db, "transactions"));
    const deduction = computeWalletDeduction(wallet, callAmt);
    const now = serverTimestamp() as Timestamp;

    const updatedPlayers = { ...table.players };
    updatedPlayers[uid] = {
      ...player,
      currentBet: (player.currentBet || 0) + callAmt,
      totalBet: (player.totalBet || 0) + callAmt,
      isMyTurn: false,
      turnStartedAt: null,
      autoCallAt: null,
      timeoutCount: 1,
    };
    updatedPlayers[nextUid] = {
      ...updatedPlayers[nextUid],
      isMyTurn: true,
      turnStartedAt: now,
      autoCallAt: now,
    };

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
      description: `9 Card auto-call ₹${callAmt}`,
      tableId,
      createdAt: serverTimestamp(),
    });

    tx.update(tableRef(tableId), {
      players: updatedPlayers,
      pot: Number(table.pot || 0) + callAmt,
      currentTurn: nextUid,
      lastRaiseBy: null,
      lastRaiseAmount: 0,
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
    const p = table.players[uid];
    if (!p) continue;

    resetPlayers[uid] = {
      ...p,
      status: "waiting",
      hasPaidBoot: false,
      currentBet: 0,
      totalBet: 0,
      cardIds: [],
      isMyTurn: false,
      seenCards: false,
      connected: true,
      turnStartedAt: null,
      autoCallAt: null,
      timeoutCount: 0,
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
