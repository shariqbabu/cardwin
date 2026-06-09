// api/poker/settle.ts
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
    const { tableId } = req.body;

    // ✅ Client se sirf tableId aayega
    // Winners Firestore se padhenge — client pe trust nahi
    if (!tableId) {
      return res.status(400).json({ error: 'tableId required' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef  = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);

      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;

      // ✅ Winners Firestore se padho — client se nahi
      const pending = (table.pendingSettlement || []) as Array<{
        uid: string;
        amount: number;
        handRank?: string;
      }>;

      if (pending.length === 0) {
        throw new Error('No pending settlement');
      }

      // ✅ Caller table mein hona chahiye
      const isPlayer = (table.players || []).some(
        (p: any) => p.uid === uid
      );
      if (!isPlayer) throw new Error('Not a player at this table');

      // ✅ Duplicate call guard
      if (table.settlementProcessed === true) {
        throw new Error('Already settled');
      }

      const tableName = table.name || 'Poker';

      // Pehle flag set karo — race condition se bacho
      tx.update(tableRef, {
        settlementProcessed: true,
      });

      // Har winner ko credit karo
      for (const winner of pending) {
        if (!winner.uid || winner.amount <= 0) continue;

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
          description: `Poker win${winner.handRank
            ? ` (${winner.handRank})`
            : ''} - "${tableName}"`,
          tableId,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Notification
        const notifRef = adminDb.collection('notifications').doc();
        tx.set(notifRef, {
          uid: winner.uid,
          type: 'GAME_WIN',
          title: '🃏 Poker Win!',
          message: `You won ₹${winner.amount}!`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // pendingSettlement clear karo
      tx.update(tableRef, {
        pendingSettlement: [],
        settlementProcessed: false, // next hand ke liye reset
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        settled: pending.map(w => ({
          uid: w.uid,
          amount: w.amount,
        })),
      };
    });

    return res.status(200).json({ success: true, ...result });

  } catch (error: any) {
    console.error('Poker settle error:', error);

    // No pending settlement — not an error for client
    if (error.message === 'No pending settlement') {
      return res.status(200).json({ success: true, settled: [] });
    }
    if (error.message === 'Already settled') {
      return res.status(200).json({ success: true, settled: [] });
    }

    return res.status(400).json({ error: error.message });
  }
}
