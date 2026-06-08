// api/ninecard/settle.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyToken(req.headers.authorization);

    const { tableId, winnerUid } = req.body;

    if (!tableId || !winnerUid) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef = adminDb.collection('nineCardTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;
      const pot = table.pot || 0;

      // ✅ Commission (10% platform fee)
      const commission = Math.floor(pot * 0.1);
      const payout = pot - commission;

      // Winner ko payout
      const walletRef = adminDb.collection('wallets').doc(winnerUid);
      tx.update(walletRef, {
        winningBalance: FieldValue.increment(payout),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Transaction log
      const txRef = adminDb.collection('transactions').doc();
      tx.set(txRef, {
        uid: winnerUid,
        type: 'GAME_WIN',
        amount: payout,
        previousBalance: 0,
        currentBalance: payout,
        status: 'COMPLETED',
        description: `9 Card win - "${table.name}"`,
        tableId,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Notification
      const notifRef = adminDb.collection('notifications').doc();
      tx.set(notifRef, {
        uid: winnerUid,
        type: 'GAME_WIN',
        title: '🎉 9 Card Win!',
        message: `You won ₹${payout}!`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Reset table for next round
      tx.update(tableRef, {
        pot: 0,
        status: 'waiting',
        round: FieldValue.increment(1),
        currentTurn: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { payout, commission };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Nine card settle error:', error);
    return res.status(400).json({ error: error.message });
  }
}
