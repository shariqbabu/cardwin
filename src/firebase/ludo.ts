// src/firebase/ludo.ts
import {
  doc, collection, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, query, where, getDocs,
  orderBy, Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { LudoTable, LudoPlayer, LudoColor, LudoGameState } from '../types';
import { MATCH_DURATION } from '../utils/ludoHelpers';
import { addFunds } from './wallet';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

const COLLECTION = 'ludoTables';

const createEmptyTable = (num: number, entryFee: number = 10): LudoTable => ({
  id: `table_${num}`,
  tableNumber: num,
  status: 'waiting',
  maxPlayers: 2,
  players: [],
  gameState: {
    diceValue: 0,
    activePlayer: '',
    consecutiveSixes: 0,
    lastRollTime: null,
  },
  matchStarted: false,
  matchEnded: false,
  timer: MATCH_DURATION,
  timerStartedAt: null,
  winnerId: null,
  winnerName: null,
  entryFee,
  pot: 0,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});


// ─── SUBSCRIBE LOBBY ─────────────────────────────────
export const subscribeLobby = (cb: (tables: LudoTable[]) => void) => {
  const q = query(
    collection(db, COLLECTION),
    where('status', 'in', ['waiting', 'playing']),
    orderBy('tableNumber', 'asc')
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as LudoTable));
  });
};

// ─── SUBSCRIBE SINGLE TABLE ──────────────────────────
export const subscribeTable = (tableId: string, cb: (table: LudoTable) => void) => {
  return onSnapshot(doc(db, COLLECTION, tableId), snap => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() } as LudoTable);
  });
};


// ─── JOIN TABLE ──────────────────────────────────────
export const joinTable = async (tableId: string, uid: string, name: string) => {
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTION, tableId);
    const wRef = doc(db, 'wallets', uid);
    const [snap, wSnap] = await Promise.all([tx.get(ref), tx.get(wRef)]);

    if (!snap.exists()) throw new Error('Table not found');
    if (!wSnap.exists()) throw new Error('Wallet not found');

    const table = snap.data() as LudoTable;
    const wallet = wSnap.data();

    if (table.players.length >= 2) throw new Error('Table full');
    if (table.players.some(p => p.uid === uid)) throw new Error('Already joined');

    const usable = calculateUsableBalance(wallet);
    if (usable < table.entryFee) throw new Error('Insufficient balance');

    const nb = deductFromWallet(wallet, table.entryFee);
    if (!nb) throw new Error('Insufficient balance');
    tx.update(wRef, { ...nb, updatedAt: serverTimestamp() });

    // ✅ Entry Fee transaction record
    const previousBalance = (wallet.depositBalance || 0) + (wallet.winningBalance || 0) + (wallet.referralBalance || 0) + (wallet.bonusBalance || 0);
    const currentBalance = previousBalance - table.entryFee;
    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type: 'GAME_JOIN',
      amount: -table.entryFee,
      previousBalance,
      currentBalance,
      status: 'COMPLETED',
      description: `Entry Fee - Ludo Table ${table.tableNumber}`,
      createdAt: serverTimestamp(),
    });

    // Color assign
    const color: LudoColor = table.players.length === 0 ? 'red' : 'green';
    const newPlayer: LudoPlayer = {
      uid,
      name,
      color,
      score: 0,
    };

    const updatedPlayers = [...table.players, newPlayer];
    const isSecond = updatedPlayers.length === 2;

    tx.update(ref, {
      players: updatedPlayers,
      pot: table.pot + table.entryFee,
      status: isSecond ? 'playing' : 'waiting',
      matchStarted: isSecond,
      timerStartedAt: isSecond ? serverTimestamp() : null,
      'gameState.activePlayer': isSecond ? updatedPlayers[0].uid : '',
      'gameState.diceValue': 0,
      'gameState.consecutiveSixes': 0,
      updatedAt: serverTimestamp(),
    });
  });
};


// ─── LEAVE TABLE ─────────────────────────────────────
export const leaveTable = async (tableId: string, uid: string): Promise<void> => {
  const ref = doc(db, COLLECTION, tableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const table = snap.data() as LudoTable;
  const leavingPlayer = table.players.find(p => p.uid === uid);
  if (!leavingPlayer) return;

  // Match shuru nahi, sirf 1 player tha — refund
  if (!table.matchStarted && table.players.length === 1) {
    await addFunds(uid, table.entryFee, 'depositBalance', `Refund - Ludo Table ${table.tableNumber}`, 'REFUND');
    await setDoc(ref, createEmptyTable(table.tableNumber, table.entryFee));
    return;
  }

  // Match chal raha tha — opponent wins
  if (table.matchStarted && !table.matchEnded) {
    const winner = table.players.find(p => p.uid !== uid);
    if (winner) {
      const winAmount = Math.floor(table.pot * 0.95); // ✅ FIX: 95% of pot (e.g. ₹100 pot → ₹95)
      await addFunds(winner.uid, winAmount, 'winningBalance', 'Ludo Win - Opponent Left');
    }
    await updateDoc(ref, {
      matchEnded: true,
      status: 'finished',
      winnerId: winner?.uid || null,
      winnerName: winner?.name || null,
      updatedAt: serverTimestamp(),
    });
    setTimeout(() => {
      setDoc(ref, createEmptyTable(table.tableNumber, table.entryFee));
    }, 10000);
    return;
  }

  await setDoc(ref, createEmptyTable(table.tableNumber, table.entryFee));
};


// ─── ROLL DICE ───────────────────────────────────────
// Rules:
// 1. Pehla join = pehla roll
// 2. 6 aaya = same player roll again
// 3. Consecutively 2 se zyada 6 (yaani 3rd 6) = no points + turn switch
// 4. Normal number (1-5) = points add + turn switch
export const rollDice = async (tableId: string, uid: string): Promise<void> => {
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTION, tableId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Table not found');

    const table = snap.data() as LudoTable;
    if (!table.matchStarted) throw new Error('Match not started');
    if (table.matchEnded) throw new Error('Match ended');
    if (table.gameState.activePlayer !== uid) throw new Error('Not your turn');

    const diceValue = Math.floor(Math.random() * 6) + 1;
    const isSix = diceValue === 6;

    const prevConsec = table.gameState.consecutiveSixes ?? 0;
    const newConsec = isSix ? prevConsec + 1 : 0;

    const playerIdx = table.players.findIndex(p => p.uid === uid);
    const otherPlayer = table.players.find(p => p.uid !== uid)!;
    const updatedPlayers = [...table.players];

    // ── CASE 1: 3rd consecutive 6 — no points, turn switch ──
    if (isSix && newConsec > 2) {
      tx.update(ref, {
        players: updatedPlayers,
        gameState: {
          diceValue: 0,
          consecutiveSixes: 0,
          activePlayer: otherPlayer.uid,
          lastRollTime: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ── CASE 2: 6 aaya (1st ya 2nd) — points add, same player roll again ──
    if (isSix) {
      updatedPlayers[playerIdx] = {
        ...updatedPlayers[playerIdx],
        score: updatedPlayers[playerIdx].score + diceValue,
      };
      tx.update(ref, {
        players: updatedPlayers,
        gameState: {
          diceValue: 0,
          consecutiveSixes: newConsec,
          activePlayer: uid,
          lastRollTime: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ── CASE 3: Normal number (1-5) — points add, turn switch ──
    updatedPlayers[playerIdx] = {
      ...updatedPlayers[playerIdx],
      score: updatedPlayers[playerIdx].score + diceValue,
    };
    tx.update(ref, {
      players: updatedPlayers,
      gameState: {
        diceValue: 0,
        consecutiveSixes: 0,
        activePlayer: otherPlayer.uid,
        lastRollTime: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  });
};


// ─── END MATCH (timer zero) ──────────────────────────
export const endMatch = async (tableId: string) => {
  const ref = doc(db, COLLECTION, tableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const table = snap.data() as LudoTable;
  if (table.matchEnded) return;

  const [p1, p2] = table.players;
  let winnerId: string | null = null;
  let winnerName: string | null = null;

  if (p1 && p2) {
    if (p1.score > p2.score) { winnerId = p1.uid; winnerName = p1.name; }
    else if (p2.score > p1.score) { winnerId = p2.uid; winnerName = p2.name; }
    // Draw: dono null
  }

  await updateDoc(ref, {
    matchEnded: true,
    status: 'finished',
    winnerId,
    winnerName,
    updatedAt: serverTimestamp(),
  });

  if (winnerId) {
    const winAmount = Math.floor(table.pot * 0.95); // ✅ FIX: 95% of pot (e.g. ₹100 pot → ₹95)
    await addFunds(winnerId, winAmount, 'winningBalance', `Ludo Win - Table ${table.tableNumber}`);
  } else {
    // Draw — refund dono ko
    for (const p of table.players) {
      await addFunds(p.uid, table.entryFee, 'depositBalance', 'Ludo Draw Refund');
    }
  }

  setTimeout(() => {
    setDoc(ref, createEmptyTable(table.tableNumber, table.entryFee));
  }, 10000);
};
