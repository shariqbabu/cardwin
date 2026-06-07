import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  addDoc,
  limit,
  getDoc,
} from 'firebase/firestore';
import { db } from './config';
import { Deposit, Withdrawal } from '../types';
// wallet operations handled inline

export const subscribeDeposits = (callback: (deposits: Deposit[]) => void) => {
  const q = query(
    collection(db, 'deposits'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)));
  });
};

export const subscribeWithdrawals = (callback: (withdrawals: Withdrawal[]) => void) => {
  const q = query(
    collection(db, 'withdrawals'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Withdrawal)));
  });
};

export const approveDeposit = async (depositId: string, adminUid: string) => {
  await runTransaction(db, async (tx) => {
    const depositRef = doc(db, 'deposits', depositId);
    const depositSnap = await tx.get(depositRef);

    if (!depositSnap.exists()) throw new Error('Deposit not found');
    const deposit = depositSnap.data() as Deposit;

    if (deposit.status !== 'PENDING') throw new Error('Deposit already processed');

    tx.update(depositRef, {
      status: 'APPROVED',
      updatedAt: serverTimestamp(),
    });

    const walletRef = doc(db, 'wallets', deposit.uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const wallet = walletSnap.data();
    const newDeposit = (wallet.depositBalance || 0) + deposit.amount;
    const newTotal = (wallet.totalBalance || 0) + deposit.amount;

    tx.update(walletRef, {
      depositBalance: newDeposit,
      totalBalance: newTotal,
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid: deposit.uid,
      type: 'DEPOSIT',
      amount: deposit.amount,
      previousBalance: wallet.totalBalance || 0,
      currentBalance: newTotal,
      status: 'COMPLETED',
      description: `Deposit approved by admin`,
      createdAt: serverTimestamp(),
    });

    // Notification
    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      uid: deposit.uid,
      type: 'DEPOSIT_APPROVED',
      title: '✅ Deposit Approved',
      message: `Your deposit of ₹${deposit.amount} has been approved!`,
      read: false,
      createdAt: serverTimestamp(),
    });

    // Admin log
    const logRef = doc(collection(db, 'adminLogs'));
    tx.set(logRef, {
      adminUid,
      action: 'APPROVE_DEPOSIT',
      targetUid: deposit.uid,
      details: `Approved deposit of ₹${deposit.amount}`,
      createdAt: serverTimestamp(),
    });
  });
};

export const rejectDeposit = async (depositId: string, adminUid: string, note: string) => {
  const depositRef = doc(db, 'deposits', depositId);
  const depositSnap = await getDoc(depositRef);
  if (!depositSnap.exists()) throw new Error('Deposit not found');
  const deposit = depositSnap.data() as Deposit;

  await updateDoc(depositRef, {
    status: 'REJECTED',
    adminNote: note,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'notifications'), {
    uid: deposit.uid,
    type: 'DEPOSIT_REJECTED',
    title: '❌ Deposit Rejected',
    message: `Your deposit of ₹${deposit.amount} was rejected. Reason: ${note}`,
    read: false,
    createdAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'adminLogs'), {
    adminUid,
    action: 'REJECT_DEPOSIT',
    targetUid: deposit.uid,
    details: `Rejected deposit of ₹${deposit.amount}. Note: ${note}`,
    createdAt: serverTimestamp(),
  });
};

export const approveWithdrawal = async (withdrawalId: string, adminUid: string) => {
  await runTransaction(db, async (tx) => {
    const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
    const withdrawalSnap = await tx.get(withdrawalRef);

    if (!withdrawalSnap.exists()) throw new Error('Withdrawal not found');
    const withdrawal = withdrawalSnap.data() as Withdrawal;

    if (withdrawal.status !== 'PENDING') throw new Error('Withdrawal already processed');

    tx.update(withdrawalRef, {
      status: 'APPROVED',
      updatedAt: serverTimestamp(),
    });

    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      uid: withdrawal.uid,
      type: 'WITHDRAWAL_APPROVED',
      title: '✅ Withdrawal Approved',
      message: `Your withdrawal of ₹${withdrawal.amount} to ${withdrawal.upiId} has been approved!`,
      read: false,
      createdAt: serverTimestamp(),
    });

    const logRef = doc(collection(db, 'adminLogs'));
    tx.set(logRef, {
      adminUid,
      action: 'APPROVE_WITHDRAWAL',
      targetUid: withdrawal.uid,
      details: `Approved withdrawal of ₹${withdrawal.amount} to ${withdrawal.upiId}`,
      createdAt: serverTimestamp(),
    });
  });
};

export const rejectWithdrawal = async (
  withdrawalId: string,
  adminUid: string,
  note: string
) => {
  await runTransaction(db, async (tx) => {
    const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
    const withdrawalSnap = await tx.get(withdrawalRef);

    if (!withdrawalSnap.exists()) throw new Error('Withdrawal not found');
    const withdrawal = withdrawalSnap.data() as Withdrawal;

    if (withdrawal.status !== 'PENDING') throw new Error('Withdrawal already processed');

    tx.update(withdrawalRef, {
      status: 'REJECTED',
      adminNote: note,
      updatedAt: serverTimestamp(),
    });

    // Refund to winning balance
    const walletRef = doc(db, 'wallets', withdrawal.uid);
    const walletSnap = await tx.get(walletRef);
    if (walletSnap.exists()) {
      const wallet = walletSnap.data();
      tx.update(walletRef, {
        winningBalance: (wallet.winningBalance || 0) + withdrawal.amount,
        totalBalance: (wallet.totalBalance || 0) + withdrawal.amount,
        updatedAt: serverTimestamp(),
      });
    }

    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      uid: withdrawal.uid,
      type: 'WITHDRAWAL_REJECTED',
      title: '❌ Withdrawal Rejected',
      message: `Your withdrawal of ₹${withdrawal.amount} was rejected. Amount refunded. Reason: ${note}`,
      read: false,
      createdAt: serverTimestamp(),
    });

    const logRef = doc(collection(db, 'adminLogs'));
    tx.set(logRef, {
      adminUid,
      action: 'REJECT_WITHDRAWAL',
      targetUid: withdrawal.uid,
      details: `Rejected withdrawal of ₹${withdrawal.amount}. Note: ${note}. Amount refunded.`,
      createdAt: serverTimestamp(),
    });
  });
};

export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const subscribeAllUsers = (callback: (users: any[]) => void) => {
  return onSnapshot(collection(db, 'users'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const adjustWallet = async (
  targetUid: string,
  amount: number,
  type: 'add' | 'deduct',
  adminUid: string,
  note: string
) => {
  await runTransaction(db, async (tx) => {
    const walletRef = doc(db, 'wallets', targetUid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const wallet = walletSnap.data();
    const previousBalance = wallet.totalBalance || 0;

    if (type === 'deduct' && previousBalance < amount) {
      throw new Error('Insufficient balance');
    }

    const newTotal = type === 'add' ? previousBalance + amount : previousBalance - amount;
    const newBonus = type === 'add'
      ? (wallet.bonusBalance || 0) + amount
      : Math.max(0, (wallet.bonusBalance || 0) - amount);

    tx.update(walletRef, {
      bonusBalance: newBonus,
      totalBalance: newTotal,
      updatedAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'transactions'));
    tx.set(txRef, {
      uid: targetUid,
      type: 'BONUS',
      amount: type === 'add' ? amount : -amount,
      previousBalance,
      currentBalance: newTotal,
      status: 'COMPLETED',
      description: `Admin adjustment: ${note}`,
      createdAt: serverTimestamp(),
    });

    const logRef = doc(collection(db, 'adminLogs'));
    tx.set(logRef, {
      adminUid,
      action: type === 'add' ? 'ADD_BALANCE' : 'DEDUCT_BALANCE',
      targetUid,
      details: `${type === 'add' ? 'Added' : 'Deducted'} ₹${amount}. Note: ${note}`,
      createdAt: serverTimestamp(),
    });
  });
};

export const banUser = async (targetUid: string, banned: boolean, adminUid: string) => {
  await updateDoc(doc(db, 'users', targetUid), {
    isBanned: banned,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'adminLogs'), {
    adminUid,
    action: banned ? 'BAN_USER' : 'UNBAN_USER',
    targetUid,
    details: `User ${banned ? 'banned' : 'unbanned'}`,
    createdAt: serverTimestamp(),
  });
};

export const getPendingDeposits = async () => {
  const q = query(
    collection(db, 'deposits'),
    where('status', '==', 'PENDING'),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Deposit));
};

export const getAdminStats = async () => {
  const [usersSnap, depositsSnap, withdrawalsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'deposits')),
    getDocs(collection(db, 'withdrawals')),
  ]);

  const deposits = depositsSnap.docs.map(d => d.data());
  const withdrawals = withdrawalsSnap.docs.map(d => d.data());

  const totalDeposited = deposits
    .filter(d => d.status === 'APPROVED')
    .reduce((sum, d) => sum + d.amount, 0);

  const totalWithdrawn = withdrawals
    .filter(w => w.status === 'APPROVED')
    .reduce((sum, w) => sum + w.amount, 0);

  const pendingDeposits = deposits.filter(d => d.status === 'PENDING').length;
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'PENDING').length;

  return {
    totalUsers: usersSnap.size,
    totalDeposited,
    totalWithdrawn,
    revenue: totalDeposited - totalWithdrawn,
    pendingDeposits,
    pendingWithdrawals,
  };
};
