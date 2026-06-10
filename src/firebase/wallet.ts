// src/firebase/wallet.ts
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Wallet, Transaction } from '../types';

// ✅ READ ONLY — yeh client pe safe hain
export const subscribeWallet = (
  uid: string,
  callback: (wallet: Wallet | null) => void
) => {
  return onSnapshot(doc(db, 'wallets', uid), (snap) => {
    callback(snap.exists() ? (snap.data() as Wallet) : null);
  });
};

export const getWallet = async (uid: string): Promise<Wallet | null> => {
  const snap = await getDoc(doc(db, 'wallets', uid));
  return snap.exists() ? (snap.data() as Wallet) : null;
};

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
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
  });
};

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

// ❌ YEH FUNCTIONS HATA DIYE — ab API routes use karo:
// addFunds    → POST /api/wallet/add
// deductFunds → POST /api/wallet/deduct
// withdrawFunds → POST /api/wallet/withdraw
