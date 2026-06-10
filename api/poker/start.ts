// api/poker/start.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ── Card types ────────────────────────────────────────────────────────────────
interface Card {
  suit:         'hearts' | 'diamonds' | 'clubs' | 'spades';
  value:        string;
  numericValue: number;
}

// ── Deck helpers ──────────────────────────────────────────────────────────────
function createDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const numericMap: Record<string, number> = {
    A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
  };
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value, numericValue: numericMap[value] });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { tableId } = req.body;

    if (!tableId) {
      return res.status(400).json({ error: 'tableId required' });
    }

    await adminDb.runTransaction(async (tx) => {
      const tableRef  = adminDb.collection('pokerTables').doc(tableId);
      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error('Table not found');

      const table = tableSnap.data()!;

      // ── Guards ──────────────────────────────────────────────────────────────
      if (table.status === 'playing') throw new Error('Already playing');

      const players: any[] = (table.players ?? []).map((p: any) => ({ ...p }));
      const activePlayers  = players.filter((p) => p.chips > 0);

      if (activePlayers.length < 2) {
        throw new Error('Need at least 2 players with chips');
      }

      // ── Caller must be at the table ─────────────────────────────────────────
      const isAtTable = players.some((p) => p.uid === uid);
      if (!isAtTable) throw new Error('Not at this table');

      // ── Hand setup ──────────────────────────────────────────────────────────
      const handNumber = (table.handNumber ?? 0) + 1;
      const numPlayers = activePlayers.length;
      const dealerIdx  = handNumber % numPlayers;
      const sbIdx      = (dealerIdx + 1) % numPlayers;
      const bbIdx      = (dealerIdx + 2) % numPlayers;

      // Reset all players for new hand
      activePlayers.forEach((p, i) => {
        p.holeCards          = [];
        p.bet                = 0;
        p.totalBet           = 0;
        p.status             = 'active';
        p.isTurn             = false;
        p.hasActedThisRound  = false;
        p.handRank           = '';
        p.isDealer           = i === dealerIdx;
        p.isSmallBlind       = i === sbIdx;
        p.isBigBlind         = i === bbIdx;
      });

      // ── Shuffle & deal 2 hole cards per player ──────────────────────────────
      const deck = shuffleDeck(createDeck());
      activePlayers.forEach((p) => {
        p.holeCards = [deck.pop()!, deck.pop()!];
      });

      // ── Post blinds ─────────────────────────────────────────────────────────
      const smallBlind = table.smallBlind ?? 10;
      const bigBlind   = table.bigBlind   ?? 20;

      const sbAmount = Math.min(smallBlind, activePlayers[sbIdx].chips);
      activePlayers[sbIdx].chips   -= sbAmount;
      activePlayers[sbIdx].bet      = sbAmount;
      activePlayers[sbIdx].totalBet = sbAmount;
      activePlayers[sbIdx].hasActedThisRound = true;
      if (activePlayers[sbIdx].chips === 0) activePlayers[sbIdx].status = 'allin';

      const bbAmount = Math.min(bigBlind, activePlayers[bbIdx].chips);
      activePlayers[bbIdx].chips   -= bbAmount;
      activePlayers[bbIdx].bet      = bbAmount;
      activePlayers[bbIdx].totalBet = bbAmount;
      activePlayers[bbIdx].hasActedThisRound = true;
      if (activePlayers[bbIdx].chips === 0) activePlayers[bbIdx].status = 'allin';

      const pot        = sbAmount + bbAmount;
      const currentBet = Math.max(sbAmount, bbAmount, bigBlind);

      // ── First to act: left of BB ─────────────────────────────────────────────
      let firstToActIdx = (bbIdx + 1) % numPlayers;
      let attempts      = 0;
      while (
        activePlayers[firstToActIdx].status !== 'active' &&
        attempts < numPlayers
      ) {
        firstToActIdx = (firstToActIdx + 1) % numPlayers;
        attempts++;
      }
      if (activePlayers[firstToActIdx].status === 'active') {
        activePlayers[firstToActIdx].isTurn = true;
      }

      const turnExpiresAt = Timestamp.fromDate(new Date(Date.now() + 30_000));

      // ── Merge back: replace active players, keep broke/left players out ──────
      // (activePlayers already filtered, use them as the full players array)
      tx.update(tableRef, {
        status:          'playing',
        phase:           'preflop',
        players:         activePlayers,
        deck,
        pot,
        sidePots:        [],
        currentBet,
        dealerSeat:      dealerIdx,
        activePlayerUid: activePlayers[firstToActIdx]?.uid ?? null,
        turnExpiresAt,
        communityCards:  [],
        handNumber,
        lastBrokePlayers:  [],
        pendingSettlement: [],
        settlementProcessed: false,
        phaseComplete:   false,
        updatedAt:       FieldValue.serverTimestamp(),
        lastActionAt:    FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Poker start error:', error);
    if (error.message === 'Already playing') {
      return res.status(200).json({ success: true }); // idempotent
    }
    return res.status(400).json({ error: error.message });
  }
}
