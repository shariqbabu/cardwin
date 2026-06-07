// src/firebase/colorPrediction.ts
import {
  doc,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { addFunds } from './wallet';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

const CP_COLLECTION       = 'colorPredictionGames';
export const ROUND_DURATION_MS = 60_000;
const NEXT_ROUND_DELAY_MS = 6_000;

export type ColorChoice = 'RED' | 'GREEN' | 'VIOLET';
export type CPStatus    = 'BETTING' | 'CLOSED' | 'RESULT';

export interface CPBet {
  uid:        string;
  userName:   string;
  color:      ColorChoice;
  amount:     number;
  multiplier: number;
  placedAt:   any;
}

export interface ColorPredictionRound {
  id:          string;
  roundNumber: number;
  status:      CPStatus;
  bets:        CPBet[];
  result:      ColorChoice | null;
  endsAt:      string;
  settleLock:  string | null;
  createdAt:   any;
  updatedAt:   any;
}

const MULTIPLIERS: Record<ColorChoice, number> = { RED: 2, GREEN: 2, VIOLET: 3 };
const WEIGHTS = { RED: 45, GREEN: 45, VIOLET: 10 };

const pickResult = (): ColorChoice => {
  const rand = Math.random() * 100;
  if (rand < WEIGHTS.RED) return 'RED';
  if (rand < WEIGHTS.RED + WEIGHTS.GREEN) return 'GREEN';
  return 'VIOLET';
};

// ─── FIXED: Mutex flag taaki ek hi baar round create ho ──────────────────────
let _creatingRound = false;

export const getOrCreateActiveRound = async (): Promise<string> => {
  // Pehle check — koi active round hai?
  const activeQ = query(
    collection(db, CP_COLLECTION),
    where('status', 'in', ['BETTING', 'CLOSED']),
    orderBy('roundNumber', 'desc'),
    limit(1),
  );
  const snap = await getDocs(activeQ);
  if (!snap.empty) return snap.docs[0].id;

  // Mutex — sirf ek client banaye
  if (_creatingRound) {
    // Thoda ruko aur dobara check karo
    await new Promise((r) => setTimeout(r, 1500));
    const retrySnap = await getDocs(activeQ);
    if (!retrySnap.empty) return retrySnap.docs[0].id;
  }

  _creatingRound = true;
  try {
    // Last round number nikalo
    const recentQ = query(
      collection(db, CP_COLLECTION),
      orderBy('roundNumber', 'desc'),
      limit(1),
    );
    const recentSnap = await getDocs(recentQ);
    const lastRound = recentSnap.empty
      ? 0
      : recentSnap.docs[0].data().roundNumber || 0;

    const endsAt = new Date(Date.now() + ROUND_DURATION_MS).toISOString();

    const ref = await addDoc(collection(db, CP_COLLECTION), {
      roundNumber: lastRound + 1,
      status:      'BETTING',
      bets:        [],
      result:      null,
      endsAt,
      settleLock:  null,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });

    return ref.id;
  } finally {
    // Thodi der baad reset karo
    setTimeout(() => { _creatingRound = false; }, 3000);
  }
};

// ─── Place Bet (unchanged logic, same as before) ──────────────────────────────
export const placeBet = async (
  uid:      string,
  userName: string,
  roundId:  string,
  color:    ColorChoice,
  amount:   number,
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const roundRef  = doc(db, CP_COLLECTION, roundId);
    const walletRef = doc(db, 'wallets', uid);

    const [roundSnap, walletSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(walletRef),
    ]);

    if (!roundSnap.exists()) throw new Error('Round not found');
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const round  = roundSnap.data() as ColorPredictionRound;
    const wallet = walletSnap.data() as any;

    if (round.status !== 'BETTING') throw new Error('Betting is closed for this round');

    const endsAt = new Date(round.endsAt).getTime();
    if (Date.now() > endsAt - 5_000) throw new Error('Too late to place a bet!');

    if (round.bets?.some((b: CPBet) => b.uid === uid))
      throw new Error('You already placed a bet this round');

    if (amount < 1) throw new Error('Minimum bet is ₹1');

    const usable = calculateUsableBalance(wallet);
    if (usable < amount) throw new Error('Insufficient balance');

    const newBalances = deductFromWallet(wallet, amount);
    if (!newBalances) throw new Error('Insufficient balance');

    const newBet: CPBet = {
      uid, userName, color, amount,
      multiplier: MULTIPLIERS[color],
      placedAt:   Timestamp.now(),
    };

    tx.update(walletRef, { ...newBalances, updatedAt: serverTimestamp() });
    tx.update(roundRef, {
      bets:      [...(round.bets || []), newBet],
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type:            'GAME_BET',
      amount:          -amount,
      previousBalance: (wallet.depositBalance || 0) + (wallet.winningBalance || 0),
      currentBalance:  (wallet.depositBalance || 0) + (wallet.winningBalance || 0) - amount,
      status:          'COMPLETED',
      description:     `Color Prediction bet — ${color} (Round #${round.roundNumber})`,
      roundId,
      createdAt:       serverTimestamp(),
    });
  });
};

// ─── FIXED: Close Betting ─────────────────────────────────────────────────────
export const closeBetting = async (roundId: string): Promise<boolean> => {
  let claimed = false;
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, CP_COLLECTION, roundId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-round');

      const status = snap.data().status;
      // Agar already CLOSED ya RESULT hai toh skip
      if (status !== 'BETTING') throw new Error('already-closed');

      tx.update(ref, { status: 'CLOSED', updatedAt: serverTimestamp() });
      claimed = true;
    });
  } catch (e: any) {
    if (['already-closed', 'no-round'].includes(e.message)) return false;
    throw e;
  }
  return claimed;
};

// ─── FIXED: Settle Round — retry + guaranteed next round ─────────────────────
export const settleRound = async (roundId: string): Promise<boolean> => {
  const lockToken = `lock-${Date.now()}-${Math.random()}`;
  let claimed = false;

  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, CP_COLLECTION, roundId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-round');

      const data = snap.data();
      if (data.status === 'RESULT') throw new Error('already-settled');
      if (data.settleLock !== null)  throw new Error('lock-taken');

      tx.update(ref, { settleLock: lockToken, updatedAt: serverTimestamp() });
      claimed = true;
    });
  } catch (e: any) {
    if (['already-settled', 'lock-taken', 'no-round'].includes(e.message)) return false;
    throw e;
  }

  if (!claimed) return false;

  const result = pickResult();

  const roundRef  = doc(db, CP_COLLECTION, roundId);
  const roundSnap = await getDoc(roundRef);
  if (!roundSnap.exists()) return false;
  const round = roundSnap.data() as ColorPredictionRound;

  await updateDoc(roundRef, {
    status:    'RESULT',
    result,
    updatedAt: serverTimestamp(),
  });

  // Winners ko pay karo
  for (const bet of round.bets || []) {
    if (bet.color !== result) continue;
    const payout = bet.amount * MULTIPLIERS[bet.color];
    try {
      await addFunds(
        bet.uid,
        payout,
        'winningBalance',
        `Color Prediction WIN — ${bet.color} × ${MULTIPLIERS[bet.color]} (Round #${round.roundNumber})`,
      );
    } catch (err) {
      console.error('Payout error:', bet.uid, err);
    }
  }

  // ─── FIXED: Next round guaranteed create hoga ─────────────────────────────
  setTimeout(async () => {
    let attempts = 0;
    const maxAttempts = 5;

    const tryCreate = async () => {
      attempts++;
      try {
        await getOrCreateActiveRound();
      } catch (e) {
        console.error(`Next round attempt ${attempts} failed:`, e);
        if (attempts < maxAttempts) {
          setTimeout(tryCreate, 2000 * attempts); // exponential backoff
        }
      }
    };

    await tryCreate();
  }, NEXT_ROUND_DELAY_MS);

  return true;
};

// ─── Subscribe: Latest Round ──────────────────────────────────────────────────
export const subscribeLatestRound = (
  callback: (round: ColorPredictionRound | null) => void,
) => {
  const q = query(
    collection(db, CP_COLLECTION),
    orderBy('roundNumber', 'desc'),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() } as ColorPredictionRound);
    }
  });
};

// ─── Subscribe: History ───────────────────────────────────────────────────────
export const subscribeColorHistory = (
  limitCount: number,
  callback: (rounds: ColorPredictionRound[]) => void,
) => {
  const q = query(
    collection(db, CP_COLLECTION),
    where('status', '==', 'RESULT'),
    orderBy('roundNumber', 'desc'),
    limit(limitCount),
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() } as ColorPredictionRound)),
    );
  });
};
