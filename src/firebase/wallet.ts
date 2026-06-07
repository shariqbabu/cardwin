import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from './config';
import { Wallet, Transaction, TransactionType } from '../types';
import { calculateUsableBalance, calculateTotalBalance } from '../utils/helpers';

// ─── Get Wallet (one-time) ───────────────────────────────────────────────────

export const getWallet = async (uid: string): Promise<Wallet | null> => {
  const snap = await getDoc(doc(db, 'wallets', uid));
  if (!snap.exists()) return null;
  return snap.data() as Wallet;
};

// ─── Subscribe Wallet (realtime) ─────────────────────────────────────────────

export const subscribeWallet = (
  uid: string,
  callback: (wallet: Wallet | null) => void
) => {
  return onSnapshot(doc(db, 'wallets', uid), (snap) => {
    callback(snap.exists() ? (snap.data() as Wallet) : null);
  });
};

// ─── Add Funds ───────────────────────────────────────────────────────────────

export const addFunds = async (
  uid: string,
  amount: number,
  type: 'depositBalance' | 'winningBalance' | 'bonusBalance' | 'referralBalance' = 'depositBalance',
  description: string = 'Deposit approved',
  overrideTxType?: string  // ✅ Optional: REFUND, GAME_WIN, etc. override
) => {
  if (amount <= 0) throw new Error('Amount must be positive');

  await runTransaction(db, async (tx) => {
    // ── READS ────────────────────────────────────────────────────────────────
    const walletRef = doc(db, 'wallets', uid);
    const walletSnap = await tx.get(walletRef);

    if (!walletSnap.exists()) throw new Error('Wallet not found');

    // ── COMPUTE ──────────────────────────────────────────────────────────────
    const wallet = walletSnap.data() as Wallet;
    const previousBalance = calculateTotalBalance(wallet);
    const newTypeBalance = (wallet[type] || 0) + amount;
    const currentBalance = previousBalance + amount;

    // ✅ overrideTxType diya to wahi use hoga, warna default mapping
    const txType = overrideTxType ?? (
        type === 'depositBalance' ? 'DEPOSIT'
      : type === 'winningBalance' ? 'GAME_WIN'
      : type === 'bonusBalance' ? 'BONUS'
      : 'REFERRAL'
    );

    // ── WRITES ───────────────────────────────────────────────────────────────
    tx.update(walletRef, {
      [type]: newTypeBalance,
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type: txType,
      amount,
      previousBalance,
      currentBalance,
      status: 'COMPLETED',
      description,
      createdAt: serverTimestamp(),
    });
  });
};

// ─── Deduct Funds ────────────────────────────────────────────────────────────

export const deductFunds = async (
  uid: string,
  amount: number,
  type: TransactionType,
  description: string
) => {
  if (amount <= 0) throw new Error('Amount must be positive');

  await runTransaction(db, async (tx) => {
    // ── READS ────────────────────────────────────────────────────────────────
    const walletRef = doc(db, 'wallets', uid);
    const walletSnap = await tx.get(walletRef);

    if (!walletSnap.exists()) throw new Error('Wallet not found');

    // ── COMPUTE ──────────────────────────────────────────────────────────────
    const wallet = walletSnap.data() as Wallet;
    const usable = calculateUsableBalance(wallet);

    if (usable < amount) throw new Error('Insufficient balance');

    // Deduction order: deposit → winning → referral → bonus (10% only)
    let remaining = amount;
    let newDeposit = wallet.depositBalance;
    let newWinning = wallet.winningBalance;
    let newReferral = wallet.referralBalance;
    let newBonus = wallet.bonusBalance;

    // 1. Deposit first
    const fromDeposit = Math.min(newDeposit, remaining);
    newDeposit -= fromDeposit;
    remaining -= fromDeposit;

    // 2. Then winning
    if (remaining > 0) {
      const fromWinning = Math.min(newWinning, remaining);
      newWinning -= fromWinning;
      remaining -= fromWinning;
    }

    // 3. Then referral
    if (remaining > 0) {
      const fromReferral = Math.min(newReferral, remaining);
      newReferral -= fromReferral;
      remaining -= fromReferral;
    }

    // 4. Finally bonus (max 10% of original bonus balance)
    if (remaining > 0) {
      const maxBonus = wallet.bonusBalance * 0.1;
      const fromBonus = Math.min(maxBonus, remaining);
      newBonus -= fromBonus;
      remaining -= fromBonus;
    }

    if (remaining > 0) throw new Error('Insufficient usable balance');

    const previousBalance = calculateTotalBalance(wallet);
    const currentBalance = previousBalance - amount;

    // ── WRITES ───────────────────────────────────────────────────────────────
    tx.update(walletRef, {
      depositBalance: newDeposit,
      winningBalance: newWinning,
      referralBalance: newReferral,
      bonusBalance: newBonus,
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type,
      amount: -amount,
      previousBalance,
      currentBalance,
      status: 'COMPLETED',
      description,
      createdAt: serverTimestamp(),
    });
  });
};

// ─── Withdraw Funds ──────────────────────────────────────────────────────────

export const withdrawFunds = async (uid: string, amount: number, upiId: string) => {
  if (amount < 100) throw new Error('Minimum withdrawal is ₹100');

  await runTransaction(db, async (tx) => {
    // ── READS (all reads BEFORE any writes) ──────────────────────────────────
    const walletRef = doc(db, 'wallets', uid);
    const userRef = doc(db, 'users', uid);

    const [walletSnap, userSnap] = await Promise.all([
      tx.get(walletRef),
      tx.get(userRef),
    ]);

    if (!walletSnap.exists()) throw new Error('Wallet not found');

    // ── COMPUTE ──────────────────────────────────────────────────────────────
    const wallet = walletSnap.data() as Wallet;
    const userData = userSnap.data();

    if (wallet.winningBalance < amount) {
      throw new Error('Insufficient winning balance for withdrawal');
    }

    const previousBalance = calculateTotalBalance(wallet);
    const newWinning = wallet.winningBalance - amount;
    const currentBalance = previousBalance - amount;

    // ── WRITES ───────────────────────────────────────────────────────────────
    tx.update(walletRef, {
      winningBalance: newWinning,
      updatedAt: serverTimestamp(),
    });

    const withdrawalRef = doc(collection(db, 'withdrawals'));
    tx.set(withdrawalRef, {
      uid,
      userName: userData?.name || 'Unknown',
      userEmail: userData?.email || '',
      amount,
      upiId,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid,
      type: 'WITHDRAWAL',
      amount: -amount,
      previousBalance,
      currentBalance,
      status: 'PENDING',
      description: `Withdrawal to ${upiId}`,
      createdAt: serverTimestamp(),
    });
  });
};

// ─── Get Transactions (one-time) ─────────────────────────────────────────────

export const getTransactions = async (
  uid: string,
  limitCount = 20
): Promise<Transaction[]> => {
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
};

// ─── Subscribe Transactions (realtime) ───────────────────────────────────────

export const subscribeTransactions = (
  uid: string,
  callback: (txs: Transaction[]) => void
) => {
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
    callback(txs);
  });
};

// ─── Create Deposit Request ───────────────────────────────────────────────────

export const createDeposit = async (
  uid: string,
  amount: number,
  screenshotUrl: string,
  utrNumber: string
) => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.data();

  await addDoc(collection(db, 'deposits'), {
    uid,
    userName: userData?.name || 'Unknown',
    userEmail: userData?.email || '',
    amount,
    screenshotUrl,
    utrNumber,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};
