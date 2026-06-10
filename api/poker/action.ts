// api/poker/action.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

interface Player {
  uid:               string;
  chips:             number;
  bet:               number;
  totalBet:          number;
  status:            string;
  isTurn:            boolean;
  hasActedThisRound: boolean;
  seatIndex:         number;
  isDealer:          boolean;
  isSmallBlind:      boolean;
  isBigBlind:        boolean;
  holeCards:         any[];
  name:              string;
  avatar:            string;
  joinedAt:          any;
}

interface SidePot {
  amount:      number;
  eligibleIds: string[];
}

// ── Helper: next active player after current seat ────────────────────────────
function getNextActivePlayer(players: Player[], currentUid: string): Player | null {
  const active = players.filter(
    (p) => p.status === 'active' || p.status === 'allin',
  );
  if (active.length === 0) return null;

  const currentIdx = players.findIndex((p) => p.uid === currentUid);
  // Go around the table clockwise from current seat
  for (let i = 1; i <= players.length; i++) {
    const next = players[(currentIdx + i) % players.length];
    if (next.status === 'active') return next; // allin players skip turn
  }
  return null;
}

// ── Helper: check if betting round is complete ───────────────────────────────
function isBettingRoundComplete(players: Player[], currentBet: number): boolean {
  const activePlayers = players.filter((p) => p.status === 'active');
  if (activePlayers.length === 0) return true;

  return activePlayers.every(
    (p) => p.hasActedThisRound && p.bet === currentBet,
  );
}

// ── Helper: calculate side pots when all-in players exist ────────────────────
function calculateSidePots(players: Player[]): SidePot[] {
  const contributed = players
    .filter((p) => p.totalBet > 0)
    .map((p) => ({ uid: p.uid, totalBet: p.totalBet, status: p.status }))
    .sort((a, b) => a.totalBet - b.totalBet);

  const sidePots: SidePot[] = [];
  let previousLevel = 0;

  const allInLevels = [
    ...new Set(
      contributed
        .filter((p) => p.status === 'allin')
        .map((p) => p.totalBet),
    ),
  ].sort((a, b) => a - b);

  for (const level of allInLevels) {
    const cap       = level - previousLevel;
    const eligible  = contributed.filter((p) => p.totalBet >= level);
    const potAmount = cap * eligible.length;

    if (potAmount > 0) {
      sidePots.push({
        amount:      potAmount,
        eligibleIds: eligible.map((p) => p.uid),
      });
    }
    previousLevel = level;
  }

  // Remaining pot (active players only)
  const remaining = contributed
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + (p.totalBet - previousLevel), 0);

  if (remaining > 0) {
    sidePots.push({
      amount:      remaining,
      eligibleIds: contributed
        .filter((p) => p.status === 'active')
        .map((p) => p.uid),
    });
  }

  return sidePots;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { tableId, action, amount } = req.body as {
      tableId: string;
      action:  ActionType;
      amount?: number;
    };

    if (!tableId)  return res.status(400).json({ error: 'tableId required' });
    if (!action)   return res.status(400).json({ error: 'action required' });
    if (!['fold', 'check', 'call', 'raise', 'allin'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const tableRef  = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;

      // ── Basic guards ───────────────────────────────────────────────────────
      if (table.status !== 'playing') throw new Error('Game is not in progress');
      if (table.activePlayerUid !== uid) throw new Error('Not your turn');

      const players: Player[] = table.players ?? [];
      const playerIdx = players.findIndex((p) => p.uid === uid);
      if (playerIdx === -1) throw new Error('Player not found');

      const player     = players[playerIdx];
      const currentBet = table.currentBet ?? 0;
      const callAmount = currentBet - (player.bet ?? 0); // how much to match

      if (player.status === 'folded' || player.status === 'left') {
        throw new Error('You are not active');
      }

      // ── Make a mutable copy ────────────────────────────────────────────────
      let updatedPlayers: Player[] = players.map((p) => ({ ...p }));
      let newPot        = table.pot ?? 0;
      let newCurrentBet = currentBet;

      // ── FOLD ───────────────────────────────────────────────────────────────
      if (action === 'fold') {
        updatedPlayers[playerIdx] = {
          ...player,
          status:            'folded',
          isTurn:            false,
          hasActedThisRound: true,
        };
      }

      // ── CHECK ──────────────────────────────────────────────────────────────
      else if (action === 'check') {
        if (callAmount > 0) throw new Error(`Cannot check — must call ₹${callAmount}`);
        updatedPlayers[playerIdx] = {
          ...player,
          isTurn:            false,
          hasActedThisRound: true,
        };
      }

      // ── CALL ───────────────────────────────────────────────────────────────
      else if (action === 'call') {
        if (callAmount <= 0) throw new Error('Nothing to call — use check');
        const actualCall = Math.min(callAmount, player.chips); // handle short-call (all-in)
        const isAllIn    = actualCall === player.chips;

        updatedPlayers[playerIdx] = {
          ...player,
          chips:             player.chips - actualCall,
          bet:               (player.bet ?? 0) + actualCall,
          totalBet:          (player.totalBet ?? 0) + actualCall,
          status:            isAllIn ? 'allin' : 'active',
          isTurn:            false,
          hasActedThisRound: true,
        };
        newPot += actualCall;
      }

      // ── RAISE ──────────────────────────────────────────────────────────────
      else if (action === 'raise') {
        if (!amount || amount <= 0) throw new Error('raise amount required');
        const minRaise = currentBet * 2 || table.bigBlind || 20;
        if (amount < minRaise) throw new Error(`Minimum raise is ₹${minRaise}`);
        if (amount > player.chips + (player.bet ?? 0)) {
          throw new Error('Raise exceeds your chips — use all-in');
        }

        const chipsNeeded = amount - (player.bet ?? 0); // extra chips from stack
        updatedPlayers[playerIdx] = {
          ...player,
          chips:             player.chips - chipsNeeded,
          bet:               amount,
          totalBet:          (player.totalBet ?? 0) + chipsNeeded,
          status:            'active',
          isTurn:            false,
          hasActedThisRound: true,
        };
        newPot        += chipsNeeded;
        newCurrentBet  = amount;

        // Reset hasActedThisRound for all other active players (they must re-act)
        updatedPlayers = updatedPlayers.map((p, i) =>
          i !== playerIdx && p.status === 'active'
            ? { ...p, hasActedThisRound: false }
            : p,
        );
      }

      // ── ALL-IN ─────────────────────────────────────────────────────────────
      else if (action === 'allin') {
        if (player.chips <= 0) throw new Error('No chips left');

        const allInAmount    = player.chips;
        const newTotalBet    = (player.totalBet ?? 0) + allInAmount;
        const newBet         = (player.bet ?? 0) + allInAmount;
        const raisesCurrentBet = newBet > currentBet;

        updatedPlayers[playerIdx] = {
          ...player,
          chips:             0,
          bet:               newBet,
          totalBet:          newTotalBet,
          status:            'allin',
          isTurn:            false,
          hasActedThisRound: true,
        };
        newPot += allInAmount;

        if (raisesCurrentBet) {
          newCurrentBet = newBet;
          // Others must re-act
          updatedPlayers = updatedPlayers.map((p, i) =>
            i !== playerIdx && p.status === 'active'
              ? { ...p, hasActedThisRound: false }
              : p,
          );
        }
      }

      // ── Check if only 1 active/allin player remains → instant win ─────────
      const stillIn = updatedPlayers.filter(
        (p) => p.status === 'active' || p.status === 'allin',
      );
      const activePlayers = updatedPlayers.filter((p) => p.status === 'active');

      if (stillIn.length === 1) {
        // Everyone else folded → instant win
        const winnerUid = stillIn[0].uid;

        const walletRef = adminDb.collection('wallets').doc(winnerUid);
        tx.update(walletRef, {
          winningBalance: FieldValue.increment(newPot),
          updatedAt:      FieldValue.serverTimestamp(),
        });

        const txRef = adminDb.collection('transactions').doc();
        tx.set(txRef, {
          uid:             winnerUid,
          type:            'GAME_WIN',
          amount:          newPot,
          previousBalance: 0,
          currentBalance:  newPot,
          status:          'COMPLETED',
          description:     `Poker win (all folded) - "${table.name ?? 'Poker'}"`,
          tableId,
          createdAt:       FieldValue.serverTimestamp(),
        });

        const notifRef = adminDb.collection('notifications').doc();
        tx.set(notifRef, {
          uid:       winnerUid,
          type:      'GAME_WIN',
          title:     '🃏 Poker Win!',
          message:   `Everyone folded! You won ₹${newPot}!`,
          read:      false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Reset players for next hand
        const resetPlayers = updatedPlayers.map((p) => ({
          ...p,
          bet:               0,
          totalBet:          0,
          holeCards:         [],
          status:            p.status === 'left' ? 'left' : 'waiting',
          isTurn:            false,
          hasActedThisRound: false,
          isDealer:          false,
          isSmallBlind:      false,
          isBigBlind:        false,
        }));

        tx.update(tableRef, {
          players:           resetPlayers,
          pot:               0,
          currentBet:        0,
          sidePots:          [],
          status:            'waiting',
          phase:             'waiting',
          activePlayerUid:   null,
          turnExpiresAt:     null,
          communityCards:    [],
          deck:              [],
          pendingSettlement: [],
          updatedAt:         FieldValue.serverTimestamp(),
        });

        return { action, roundOver: true, winner: winnerUid, pot: newPot };
      }

      // ── Check if betting round is complete ─────────────────────────────────
      const roundComplete = isBettingRoundComplete(updatedPlayers, newCurrentBet);

      if (roundComplete) {
        // Reset bets for next phase, sidePots update
        const sidePots = calculateSidePots(updatedPlayers);

        const resetBetPlayers = updatedPlayers.map((p) => ({
          ...p,
          bet:               0,
          hasActedThisRound: false,
        }));

        tx.update(tableRef, {
          players:         resetBetPlayers,
          pot:             newPot,
          currentBet:      0,
          sidePots,
          activePlayerUid: null,   // nextPhase.ts will set this
          updatedAt:       FieldValue.serverTimestamp(),
          phaseComplete:   true,   // frontend / nextPhase.ts listens to this
        });

        return { action, phaseComplete: true, pot: newPot };
      }

      // ── Pass turn to next player ───────────────────────────────────────────
      const nextPlayer = getNextActivePlayer(updatedPlayers, uid);
      if (!nextPlayer) {
        throw new Error('No next player found — unexpected state');
      }

      const nextIdx = updatedPlayers.findIndex((p) => p.uid === nextPlayer.uid);
      updatedPlayers[nextIdx] = { ...updatedPlayers[nextIdx], isTurn: true };

      // Turn timer — 30 seconds
      const turnExpiresAt = new Date(Date.now() + 30_000);

      tx.update(tableRef, {
        players:         updatedPlayers,
        pot:             newPot,
        currentBet:      newCurrentBet,
        activePlayerUid: nextPlayer.uid,
        turnExpiresAt,
        updatedAt:       FieldValue.serverTimestamp(),
      });

      return { action, nextPlayerUid: nextPlayer.uid, pot: newPot };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Poker action error:', error);
    return res.status(400).json({ error: error.message });
  }
}
