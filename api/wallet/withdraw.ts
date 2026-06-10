// api/wallet/withdraw.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { amount, upiId } = req.body as {
      amount: number;
      upiId:  string;
    };

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum withdrawal is ₹100' });
    }
    if (!upiId?.trim()) {
      return res.status(400).json({ error: 'UPI ID required' });
    }

    await adminDb.runTransaction(async (tx) => {
      const walletRef  = adminDb.collection('wallets').doc(uid);
      const userRef    = adminDb.collection('users').doc(uid);

      const [walletSnap, userSnap] = await Promise.all([
        tx.get(walletRef),
        tx.get(userRef),
      ]);

      if (!walletSnap.exists) throw new Error('Wallet not found');

      const wallet   = walletSnap.data()!;
      const userData = userSnap.exists ? userSnap.data()! : {};

      if ((wallet.winningBalance ?? 0) < amount) {
        throw new Error('Insufficient winning balance for withdrawal');
      }

      const previousBalance =
        (wallet.depositBalance  ?? 0) +
        (wallet.winningBalance  ?? 0) +
        (wallet.referralBalance ?? 0) +
        (wallet.bonusBalance    ?? 0);
      const currentBalance = previousBalance - amount;

      // Deduct from winning balance
      tx.update(walletRef, {
        winningBalance: FieldValue.increment(-amount),
        updatedAt:      FieldValue.serverTimestamp(),
      });

      // Withdrawal request
      const withdrawalRef = adminDb.collection('withdrawals').doc();
      tx.set(withdrawalRef, {
        uid,
        userName:  userData.name  ?? 'Unknown',
        userEmail: userData.email ?? '',
        amount,
        upiId:     upiId.trim(),
        status:    'PENDING',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Transaction log
      const txRef = adminDb.collection('transactions').doc();
      tx.set(txRef, {
        uid,
        type:            'WITHDRAWAL',
        amount:          -amount,
        previousBalance,
        currentBalance,
        status:          'PENDING',
        description:     `Withdrawal to ${upiId.trim()}`,
        createdAt:       FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Wallet withdraw error:', error);
    return res.status(400).json({ error: error.message });
  }
}
