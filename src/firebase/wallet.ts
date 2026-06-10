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

import { auth, db } from './config';
import { Wallet, Transaction } from '../types';

// =====================================================
// WALLET
// =====================================================

export const subscribeWallet = (
  uid: string,
  callback: (wallet: Wallet | null) => void
) => {
  return onSnapshot(doc(db, 'wallets', uid), (snap) => {
    callback(
      snap.exists()
        ? (snap.data() as Wallet)
        : null
    );
  });
};

export const getWallet = async (
  uid: string
): Promise<Wallet | null> => {
  const snap = await getDoc(doc(db, 'wallets', uid));

  return snap.exists()
    ? (snap.data() as Wallet)
    : null;
};

// =====================================================
// TRANSACTIONS
// =====================================================

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
    callback(
      snap.docs.map(
        (d) =>
          ({
            id: d.id,
            ...d.data(),
          }) as Transaction
      )
    );
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

  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
      }) as Transaction
  );
};

// =====================================================
// DEPOSIT REQUEST
// =====================================================

export const createDeposit = async (
  uid: string,
  amount: number,
  screenshotUrl: string,
  utrNumber: string
) => {
  const userSnap = await getDoc(
    doc(db, 'users', uid)
  );

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

// =====================================================
// ADD FUNDS API
// =====================================================

export const addFunds = async (
  uid: string,
  amount: number,
  type:
    | 'depositBalance'
    | 'winningBalance'
    | 'bonusBalance'
    | 'referralBalance',
  description?: string,
  overrideTxType?: string
) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Not authenticated');
  }

  const token =
    await currentUser.getIdToken();

  const response = await fetch(
    '/api/wallet/add',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount,
        type,
        description,
        overrideTxType,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Add funds failed'
    );
  }

  return data;
};

// =====================================================
// DEDUCT FUNDS API
// =====================================================

export const deductFunds = async (
  uid: string,
  amount: number,
  txType = 'GAME_LOSS',
  description = 'Balance deduction'
) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Not authenticated');
  }

  const token =
    await currentUser.getIdToken();

  const response = await fetch(
    '/api/wallet/deduct',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount,
        txType,
        description,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Deduction failed'
    );
  }

  return data;
};

// =====================================================
// WITHDRAW
// =====================================================

export const withdrawFunds = async (
  uid: string,
  amount: number,
  upiId: string
) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Not authenticated');
  }

  const token =
    await currentUser.getIdToken();

  const response = await fetch(
    '/api/wallet/withdraw',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount,
        upiId,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Withdrawal failed'
    );
  }

  return data;
};
