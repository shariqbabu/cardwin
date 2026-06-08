// api/poker/settle.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyToken(req.headers.authorization); // requester verify

    const { tableId, winners } = req.body;
    // winners: [{ uid, amount, handRank }]

    if (!tableId || !winners?.length) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    await adminDb.runTransaction(async (tx) => {
      const tableRef = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      // ✅ Server-side: winners ko paisa do
      for (const winner of winners) {
        if (winner.amount <= 0) continue;

        const walletRef = adminDb.collection('wallets').doc(winner.uid);
        tx.update(walletRef, {
          winningBalance: FieldValue.increment(winner.amount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Transaction log
        const txRef = adminDb.collection('transactions').doc();
        tx.set(txRef, {
          uid: winner.uid,
          type: 'GAME_WIN',
          amount: winner.amount,
          previousBalance: 0,
          currentBalance: winner.amount,
          status: 'COMPLETED',
          description: `Poker win${winner.handRank ? ` (${winner.handRank})` : ''}`,
          tableId,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Notification
        const notifRef = adminDb.collection('notifications').doc();
        tx.set(notifRef, {
          uid: winner.uid,
          type: 'GAME_WIN',
          title: '🎉 Poker Win!',
          message: `You won ₹${winner.amount}!`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Poker settle error:', error);
    return res.status(400).json({ error: error.message });
  }
}
