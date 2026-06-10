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

    // Only tableId from client — winners are read from Firestore, never trusted from client
    if (!tableId) {
      return res.status(400).json({ error: 'tableId required' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef  = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;

      // ── Read winners from Firestore — never from client ───────────────────
      const pending = (table.pendingSettlement ?? []) as Array<{
        uid:       string;
        amount:    number;
        handRank?: string;
      }>;

      if (pending.length === 0) throw new Error('No pending settlement');

      // ── Caller must be a player at this table ─────────────────────────────
      const isPlayer = (table.players ?? []).some((p: any) => p.uid === uid);
      if (!isPlayer) throw new Error('Not a player at this table');

      // ── Idempotency guard (checked on the snapshot read, before any write) ─
      if (table.settlementProcessed === true) throw new Error('Already settled');

      const tableName = table.name ?? 'Poker';

      // ── Credit each winner ────────────────────────────────────────────────
      for (const winner of pending) {
        if (!winner.uid || winner.amount <= 0) continue;

        const walletRef = adminDb.collection('wallets').doc(winner.uid);
        tx.update(walletRef, {
          winningBalance: FieldValue.increment(winner.amount),
          updatedAt:      FieldValue.serverTimestamp(),
        });

        const txRef = adminDb.collection('transactions').doc();
        tx.set(txRef, {
          uid:             winner.uid,
          type:            'GAME_WIN',
          amount:          winner.amount,
          previousBalance: 0,
          currentBalance:  winner.amount,
          status:          'COMPLETED',
          description:     `Poker win${winner.handRank ? ` (${winner.handRank})` : ''} - "${tableName}"`,
          tableId,
          createdAt:       FieldValue.serverTimestamp(),
        });

        const notifRef = adminDb.collection('notifications').doc();
        tx.set(notifRef, {
          uid:       winner.uid,
          type:      'GAME_WIN',
          title:     '🃏 Poker Win!',
          message:   `You won ₹${winner.amount}!`,
          read:      false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // ── Clear settlement state ─────────────────────────────────────────────
      tx.update(tableRef, {
        pendingSettlement:   [],
        settlementProcessed: false, // reset for next hand
        updatedAt:           FieldValue.serverTimestamp(),
      });

      return {
        settled: pending.map(w => ({ uid: w.uid, amount: w.amount })),
      };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Poker settle error:', error);

    // These are non-error states for the client
    if (
      error.message === 'No pending settlement' ||
      error.message === 'Already settled'
    ) {
      return res.status(200).json({ success: true, settled: [] });
    }

    return res.status(400).json({ error: error.message });
  }
}
