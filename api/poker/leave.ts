// api/poker/leave.ts
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

    if (!tableId) {
      return res.status(400).json({ error: 'Table ID required' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef  = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table     = tableSnap.data()!;
      const player    = (table.players ?? []).find((p: any) => p.uid === uid);
      const tableName = table.name ?? 'Poker';

      // ── Case 1: In spectator queue ────────────────────────────────────────
      const inQueue = (table.spectatorQueue ?? []).some((s: any) => s.uid === uid);
      if (inQueue && !player) {
        const updatedQueue = (table.spectatorQueue ?? []).filter(
          (s: any) => s.uid !== uid,
        );
        tx.update(tableRef, {
          spectatorQueue: updatedQueue,
          updatedAt:      FieldValue.serverTimestamp(),
        });
        return { refund: 0, role: 'spectator' };
      }

      // ── Case 2: Not at table ──────────────────────────────────────────────
      if (!player) throw new Error('Not at this table');

      const chips     = player.chips ?? 0;
      const isPlaying = table.status === 'playing';

      // ── Case 3: Game in progress ──────────────────────────────────────────
      if (isPlaying) {
        // Refund leaving player's chips into the pot
        const updatedPot = (table.pot ?? 0) + chips;

        const updatedPlayers = (table.players ?? []).map((p: any) =>
          p.uid === uid
            ? { ...p, status: 'left', isTurn: false, chips: 0 }
            : p,
        );

        const nonFolded = updatedPlayers.filter(
          (p: any) => p.status !== 'folded' && p.status !== 'left',
        );

        // ── Exactly 1 player remaining → instant win ──────────────────────
        if (nonFolded.length === 1) {
          const winnerUid = nonFolded[0].uid;

          const walletRef = adminDb.collection('wallets').doc(winnerUid);
          tx.update(walletRef, {
            winningBalance: FieldValue.increment(updatedPot),
            updatedAt:      FieldValue.serverTimestamp(),
          });

          const txRef = adminDb.collection('transactions').doc();
          tx.set(txRef, {
            uid:             winnerUid,
            type:            'GAME_WIN',
            amount:          updatedPot,
            previousBalance: 0,
            currentBalance:  updatedPot,
            status:          'COMPLETED',
            description:     `Poker win (opponent left) - "${tableName}"`,
            tableId,
            createdAt:       FieldValue.serverTimestamp(),
          });

          const notifRef = adminDb.collection('notifications').doc();
          tx.set(notifRef, {
            uid:       winnerUid,
            type:      'GAME_WIN',
            title:     '🃏 Poker Win!',
            message:   `Opponent left! You won ₹${updatedPot}!`,
            read:      false,
            createdAt: FieldValue.serverTimestamp(),
          });

          tx.update(tableRef, {
            players:           updatedPlayers,
            pot:               0,
            status:            'waiting',
            phase:             'showdown',
            activePlayerUid:   null,
            turnExpiresAt:     null,
            pendingSettlement: [],
            updatedAt:         FieldValue.serverTimestamp(),
          });

          return { refund: 0, role: 'player' };
        }

        // ── Multiple players remain → pass turn if needed ─────────────────
        let activePlayerUid = table.activePlayerUid;
        if (activePlayerUid === uid) {
          const nextPlayer = updatedPlayers.find(
            (p: any) => p.uid !== uid && p.status === 'active',
          );
          activePlayerUid = nextPlayer?.uid ?? null;

          if (nextPlayer) {
            const idx = updatedPlayers.findIndex(
              (p: any) => p.uid === nextPlayer.uid,
            );
            updatedPlayers[idx] = { ...updatedPlayers[idx], isTurn: true };
          }
        }

        tx.update(tableRef, {
          players:         updatedPlayers,
          pot:             updatedPot,
          activePlayerUid,
          updatedAt:       FieldValue.serverTimestamp(),
        });

        return { refund: 0, role: 'player' };
      }

      // ── Case 4: Waiting state → chips refund + spectator promotion ────────
      const updatedPlayers = (table.players ?? [])
        .filter((p: any) => p.uid !== uid)
        .map((p: any, i: number) => ({ ...p, seatIndex: i }));

      // Refund chips to wallet
      if (chips > 0) {
        const walletRef = adminDb.collection('wallets').doc(uid);
        tx.update(walletRef, {
          winningBalance: FieldValue.increment(chips),
          updatedAt:      FieldValue.serverTimestamp(),
        });

        const txRef = adminDb.collection('transactions').doc();
        tx.set(txRef, {
          uid,
          type:            'CASH_OUT',
          amount:          chips,
          previousBalance: 0,
          currentBalance:  chips,
          status:          'COMPLETED',
          description:     `Poker chips refund - "${tableName}"`,
          tableId,
          createdAt:       FieldValue.serverTimestamp(),
        });
      }

      // ── Promote first spectator to player ─────────────────────────────────
      const spectatorQueue   = table.spectatorQueue ?? [];
      const nextSpectator    = spectatorQueue[0] ?? null;
      const remainingQueue   = spectatorQueue.slice(1);
      let finalPlayers       = updatedPlayers;

      if (nextSpectator && updatedPlayers.length < 6) {
        // Assign the freed seat index
        const occupiedSeats = updatedPlayers.map((p: any) => p.seatIndex);
        let freeSeat = 0;
        while (occupiedSeats.includes(freeSeat)) freeSeat++;

        const promotedPlayer = {
          uid:               nextSpectator.uid,
          name:              nextSpectator.name,
          avatar:            nextSpectator.avatar,
          chips:             0,            // No buy-in charged here; handle client-side or separate flow
          holeCards:         [],
          bet:               0,
          totalBet:          0,
          status:            'waiting',
          isDealer:          false,
          isSmallBlind:      false,
          isBigBlind:        false,
          isTurn:            false,
          hasActedThisRound: false,
          seatIndex:         freeSeat,
          joinedAt:          nextSpectator.joinedAt,
        };

        finalPlayers = [...updatedPlayers, promotedPlayer];
      }

      const willBeEmpty = finalPlayers.length === 0;

      tx.update(tableRef, {
        players:        finalPlayers,
        spectatorQueue: remainingQueue,
        status: willBeEmpty || finalPlayers.length < 2 ? 'waiting' : table.status,
        phase:  willBeEmpty || finalPlayers.length < 2 ? 'waiting' : table.phase,
        ...(willBeEmpty && {
          pot:               0,
          sidePots:          [],
          currentBet:        0,
          communityCards:    [],
          deck:              [],
          activePlayerUid:   null,
          turnExpiresAt:     null,
          pendingSettlement: [],
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        refund:           chips,
        role:             'player',
        promotedSpectator: nextSpectator?.uid ?? null,
      };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Poker leave error:', error);
    return res.status(400).json({ error: error.message });
  }
}
