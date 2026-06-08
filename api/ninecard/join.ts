// api/ninecard/join.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, calculateDeduction } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { tableId, displayName, photoURL } = req.body;

    if (!tableId) return res.status(400).json({ error: 'Table ID required' });

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef = adminDb.collection('nineCardTables').doc(tableId);
      const walletRef = adminDb.collection('wallets').doc(uid);

      const [tableSnap, walletSnap] = await Promise.all([
        tx.get(tableRef),
        tx.get(walletRef),
      ]);

      if (!tableSnap.exists) throw new Error('Table not found');
      if (!walletSnap.exists) throw new Error('Wallet not found');

      const table = tableSnap.data()!;
      const wallet = walletSnap.data()!;

      // Checks
      if (table.status === 'disabled') throw new Error('Table disabled');
      if (table.locked) throw new Error('Table locked');

      const players = table.players || {};
      if (players[uid]) throw new Error('Already at table');

      const playerCount = Object.keys(players).length;
      if (playerCount >= table.maxPlayers) throw new Error('Table full');

      const bootAmount = table.bootAmount;

      // Deduct boot
      const deduction = calculateDeduction(wallet, bootAmount);
      if (!deduction) throw new Error('Insufficient balance');

      // Update wallet
      tx.update(walletRef, {
        depositBalance: deduction.depositBalance,
        winningBalance: deduction.winningBalance,
        referralBalance: deduction.referralBalance,
        bonusBalance: deduction.bonusBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Transaction log
      const txRef = adminDb.collection('transactions').doc();
      tx.set(txRef, {
        uid, type: 'GAME_BET', amount: -bootAmount,
        previousBalance: deduction.previousTotal,
        currentBalance: deduction.newTotal,
        status: 'COMPLETED',
        description: `9 Card boot - "${table.name}"`,
        tableId,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Add player to table
      tx.update(tableRef, {
        [`players.${uid}`]: {
          uid,
          displayName: displayName || 'Player',
          photoURL: photoURL || '',
          status: 'active',
          cards: [],
          isMyTurn: false,
          joinedAt: FieldValue.serverTimestamp(),
        },
        pot: FieldValue.increment(bootAmount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { newBalance: deduction.newTotal };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Nine card join error:', error);
    return res.status(400).json({ error: error.message });
  }
}
