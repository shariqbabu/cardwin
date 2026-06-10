// api/wallet/deduct.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { amount, type, description } = req.body as {
      amount:      number;
      type:        string;
      description: string;
    };

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }
    if (!type)        return res.status(400).json({ error: 'type required' });
    if (!description) return res.status(400).json({ error: 'description required' });

    await adminDb.runTransaction(async (tx) => {
      const walletRef  = adminDb.collection('wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error('Wallet not found');

      const wallet = walletSnap.data()!;

      const depositBalance  = wallet.depositBalance  ?? 0;
      const winningBalance  = wallet.winningBalance  ?? 0;
      const referralBalance = wallet.referralBalance ?? 0;
      const bonusBalance    = wallet.bonusBalance    ?? 0;

      // Usable balance: full deposit + winning + referral, but only 10% of bonus
      const usable =
        depositBalance +
        winningBalance +
        referralBalance +
        bonusBalance * 0.1;

      if (usable < amount) throw new Error('Insufficient balance');

      // Deduction order: deposit → winning → referral → bonus (10% cap)
      let remaining   = amount;
      let newDeposit  = depositBalance;
      let newWinning  = winningBalance;
      let newReferral = referralBalance;
      let newBonus    = bonusBalance;

      const fromDeposit = Math.min(newDeposit, remaining);
      newDeposit -= fromDeposit;
      remaining  -= fromDeposit;

      if (remaining > 0) {
        const fromWinning = Math.min(newWinning, remaining);
        newWinning -= fromWinning;
        remaining  -= fromWinning;
      }

      if (remaining > 0) {
        const fromReferral = Math.min(newReferral, remaining);
        newReferral -= fromReferral;
        remaining   -= fromReferral;
      }

      if (remaining > 0) {
        const maxBonus    = bonusBalance * 0.1;
        const fromBonus   = Math.min(maxBonus, remaining);
        newBonus  -= fromBonus;
        remaining -= fromBonus;
      }

      if (remaining > 0) throw new Error('Insufficient usable balance');

      const previousBalance =
        depositBalance + winningBalance + referralBalance + bonusBalance;
      const currentBalance = previousBalance - amount;

      tx.update(walletRef, {
        depositBalance:  newDeposit,
        winningBalance:  newWinning,
        referralBalance: newReferral,
        bonusBalance:    newBonus,
        updatedAt:       FieldValue.serverTimestamp(),
      });

      const txRef = adminDb.collection('transactions').doc();
      tx.set(txRef, {
        uid,
        type,
        amount:          -amount,
        previousBalance,
        currentBalance,
        status:          'COMPLETED',
        description,
        createdAt:       FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Wallet deduct error:', error);
    return res.status(400).json({ error: error.message });
  }
}
