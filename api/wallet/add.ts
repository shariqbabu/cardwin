// api/wallet/add.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

type BalanceType = 'depositBalance' | 'winningBalance' | 'bonusBalance' | 'referralBalance';

const TX_TYPE_MAP: Record<BalanceType, string> = {
  depositBalance:  'DEPOSIT',
  winningBalance:  'GAME_WIN',
  bonusBalance:    'BONUS',
  referralBalance: 'REFERRAL',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const {
      amount,
      type = 'depositBalance',
      description = 'Deposit approved',
      overrideTxType,
    } = req.body as {
      amount:          number;
      type?:           BalanceType;
      description?:    string;
      overrideTxType?: string;
    };

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const validTypes: BalanceType[] = [
      'depositBalance', 'winningBalance', 'bonusBalance', 'referralBalance',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid balance type' });
    }

    await adminDb.runTransaction(async (tx) => {
      const walletRef  = adminDb.collection('wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error('Wallet not found');

      const wallet         = walletSnap.data()!;
      const previousBalance =
        (wallet.depositBalance  ?? 0) +
        (wallet.winningBalance  ?? 0) +
        (wallet.referralBalance ?? 0) +
        (wallet.bonusBalance    ?? 0);
      const currentBalance  = previousBalance + amount;
      const txType          = overrideTxType ?? TX_TYPE_MAP[type];

      tx.update(walletRef, {
        [type]:    FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const txRef = adminDb.collection('transactions').doc();
      tx.set(txRef, {
        uid,
        type:            txType,
        amount,
        previousBalance,
        currentBalance,
        status:          'COMPLETED',
        description,
        createdAt:       FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Wallet add error:', error);
    return res.status(400).json({ error: error.message });
  }
}
