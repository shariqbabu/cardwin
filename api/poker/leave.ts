// api/poker/leave.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { tableId } = req.body;

    if (!tableId) return res.status(400).json({ error: 'Table ID required' });

    await adminDb.runTransaction(async (tx) => {
      const tableRef = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;
      const player = table.players?.find((p: any) => p.uid === uid);

      // Spectator queue se nikalo
      const inQueue = table.spectatorQueue?.some((s: any) => s.uid === uid);
      if (inQueue && !player) {
        const updatedQueue = table.spectatorQueue.filter((s: any) => s.uid !== uid);
        tx.update(tableRef, {
          spectatorQueue: updatedQueue,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      if (!player) return;

      const isPlaying = table.status === 'playing';

      // Game chal raha hai → mark left (chips baad mein settle)
      if (isPlaying) {
        const updatedPlayers = table.players.map((p: any) =>
          p.uid === uid ? { ...p, status: 'left', isTurn: false } : p
        );
        tx.update(tableRef, {
          players: updatedPlayers,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      // Waiting state → chips refund + remove
      const chips = player.chips || 0;
      const updatedPlayers = table.players
        .filter((p: any) => p.uid !== uid)
        .map((p: any, i: number) => ({ ...p, seatIndex: i }));

      // Chips wapas
      if (chips > 0) {
        const walletRef = adminDb.collection('wallets').doc(uid);
        tx.update(walletRef, {
          winningBalance: FieldValue.increment(chips),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const txRef = adminDb.collection('transactions').doc();
        tx.set(txRef, {
          uid, type: 'CASH_OUT', amount: chips,
          previousBalance: 0, currentBalance: chips,
          status: 'COMPLETED',
          description: `Poker cashout - "${table.name}"`,
          tableId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Table update
      const willBeEmpty = updatedPlayers.length === 0;
      tx.update(tableRef, {
        players: updatedPlayers,
        status: willBeEmpty ? 'waiting' : (updatedPlayers.length < 2 ? 'waiting' : table.status),
        phase: willBeEmpty ? 'waiting' : table.phase,
        ...(willBeEmpty && {
          pot: 0, sidePots: [], currentBet: 0,
          communityCards: [], deck: [], activePlayerUid: null,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Poker leave error:', error);
    return res.status(400).json({ error: error.message });
  }
}
