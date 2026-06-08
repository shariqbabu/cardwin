// api/poker/join.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, calculateDeduction } from '../_lib/verifyAuth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { tableId, name, avatar, buyIn } = req.body;

    if (!tableId || !buyIn || buyIn <= 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef = adminDb.collection('pokerTables').doc(tableId);
      const walletRef = adminDb.collection('wallets').doc(uid);

      const [tableSnap, walletSnap] = await Promise.all([
        tx.get(tableRef),
        tx.get(walletRef),
      ]);

      if (!tableSnap.exists) throw new Error('Table not found');
      if (!walletSnap.exists) throw new Error('Wallet not found');

      const table = tableSnap.data()!;
      const wallet = walletSnap.data()!;

      // Duplicate check
      const alreadyPlayer = table.players?.some((p: any) => p.uid === uid);
      const alreadySpec = table.spectatorQueue?.some((s: any) => s.uid === uid);
      if (alreadyPlayer || alreadySpec) throw new Error('Already at table');

      const isFull = (table.players?.length || 0) >= 6;
      const isPlaying = table.status === 'playing';

      // Spectator queue mein daalo
      if (isFull || isPlaying) {
        const entry = { uid, name, avatar, joinedAt: Timestamp.now() };
        tx.update(tableRef, {
          spectatorQueue: FieldValue.arrayUnion(entry),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { role: 'spectator' };
      }

      // Validate buy-in
      if (buyIn < table.minBuyIn) throw new Error(`Min buy-in ₹${table.minBuyIn}`);
      if (buyIn > table.maxBuyIn) throw new Error(`Max buy-in ₹${table.maxBuyIn}`);

      // Deduct
      const deduction = calculateDeduction(wallet, buyIn);
      if (!deduction) throw new Error('Insufficient balance');

      // Empty seat dhundo
      const occupied = table.players?.map((p: any) => p.seatIndex) || [];
      let seat = 0;
      while (occupied.includes(seat)) seat++;

      const newPlayer = {
        uid, name, avatar,
        chips: buyIn,
        holeCards: [],
        bet: 0, totalBet: 0,
        status: 'waiting',
        isDealer: false, isSmallBlind: false, isBigBlind: false,
        isTurn: false, hasActedThisRound: false,
        seatIndex: seat,
        joinedAt: Timestamp.now(),
      };

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
        uid, type: 'GAME_BET', amount: -buyIn,
        previousBalance: deduction.previousTotal,
        currentBalance: deduction.newTotal,
        status: 'COMPLETED',
        description: `Poker buy-in at "${table.name}"`,
        tableId,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Add player
      tx.update(tableRef, {
        players: FieldValue.arrayUnion(newPlayer),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { role: 'player' };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Poker join error:', error);
    return res.status(400).json({ error: error.message });
  }
}
