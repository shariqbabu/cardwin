// firebase/dragonTiger.ts — FULL FIXED VERSION

import {
  doc, collection, setDoc, getDoc, updateDoc,
  onSnapshot, runTransaction, serverTimestamp,
  query, where, getDocs, orderBy, limit, increment,
  arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { addFunds } from './wallet';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

const DT_COLLECTION       = 'dragonTigerGames';
const BETTING_DURATION_MS = 20_000;
const STUCK_THRESHOLD_MS  = 20_000;
const CLEANUP_THRESHOLD   = 45_000; // ✅ Reduced from 90s

// ─── TYPES ────────────────────────────────────────────────────────────────────
export interface DTCard {
  suit:         'hearts' | 'diamonds' | 'clubs' | 'spades';
  value:        string;
  numericValue: number;
}

export type DTSide   = 'dragon' | 'tiger' | 'tie';
export type DTStatus = 'betting' | 'dealing' | 'result';

export interface DTBet {
  uid:       string;
  name:      string;
  amount:    number;
  side:      DTSide;
  placedAt:  any;
}

export interface DragonTigerGame {
  id:            string;
  status:        DTStatus;
  roundNumber:   number;
  dragonCard:    DTCard | null;
  tigerCard:     DTCard | null;
  bets:          DTBet[];
  winner:        DTSide | null;
  pot:           number;
  dealingLock:   string | null;
  bettingEndsAt: any;
  createdAt:     any;
  updatedAt:     any;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── DECK HELPERS ─────────────────────────────────────────────────────────────
const createDeck = (): DTCard[] => {
  const suits: DTCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const numMap: Record<string, number> = {
    A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
    '8':8,'9':9,'10':10,J:11,Q:12,K:13,
  };
  return suits.flatMap((s) =>
    values.map((v) => ({ suit: s, value: v, numericValue: numMap[v] }))
  );
};

const shuffleDeck = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─── CLEANUP: stuck games force-close ────────────────────────────────────────
const cleanup = async () => {
  const snap = await getDocs(
    query(
      collection(db, DT_COLLECTION),
      where('status', 'in', ['betting', 'dealing']),
      orderBy('createdAt', 'desc'),
      limit(10),
    ),
  );
  const now = Date.now();
  for (const d of snap.docs) {
    const g = d.data() as DragonTigerGame;
    const age = now - g.createdAt.toMillis();

    // ✅ Both betting AND dealing get cleaned up faster
    if (age > CLEANUP_THRESHOLD) {
      try {
        // If dragon/tiger cards exist, use them to determine winner
        let winner: DTSide = 'dragon';
        if (g.dragonCard && g.tigerCard) {
          if (g.dragonCard.numericValue > g.tigerCard.numericValue)      winner = 'dragon';
          else if (g.tigerCard.numericValue > g.dragonCard.numericValue) winner = 'tiger';
          else                                                           winner = 'tie';
        }
        await updateDoc(d.ref, {
          status: 'result',
          winner,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Best effort
      }
    }
  }
};

// ─── FORCE RESULT — ensure game always reaches result ─────────────────────────
const forceResult = async (
  ref: any,
  dragonCard: DTCard,
  tigerCard: DTCard,
  winner: DTSide,
) => {
  try {
    await updateDoc(ref, {
      status:     'result',
      dragonCard,
      tigerCard,
      winner,
      updatedAt:  serverTimestamp(),
    });
  } catch (err) {
    console.error('forceResult failed:', err);
    // Last resort — try minimal update
    try {
      await updateDoc(ref, { status: 'result', winner, updatedAt: serverTimestamp() });
    } catch {
      console.error('CRITICAL: Could not set result status');
    }
  }
};

// ─── CREATE ROUND ─────────────────────────────────────────────────────────────
export const createDragonTigerRound = async (): Promise<string> => {
  await cleanup();

  const existing = await getDocs(
    query(
      collection(db, DT_COLLECTION),
      where('status', 'in', ['betting', 'dealing']),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );

  // ✅ If an existing game is stuck in "dealing", try to fix it
  if (!existing.empty) {
    const d = existing.docs[0];
    const g = d.data() as DragonTigerGame;

    if (g.status === 'dealing') {
      const age = Date.now() - (g.updatedAt?.toMillis?.() ?? g.createdAt.toMillis());

      if (age > STUCK_THRESHOLD_MS) {
        // ✅ Force result on stuck dealing game
        let winner: DTSide = 'dragon';
        if (g.dragonCard && g.tigerCard) {
          if (g.dragonCard.numericValue > g.tigerCard.numericValue)      winner = 'dragon';
          else if (g.tigerCard.numericValue > g.dragonCard.numericValue) winner = 'tiger';
          else                                                           winner = 'tie';
        }
        await updateDoc(d.ref, { status: 'result', winner, updatedAt: serverTimestamp() });
        // Don't return this ID — it's done, create new
      } else {
        // Still within threshold, might be actively dealing
        return d.id;
      }
    } else {
      return d.id; // Active betting game
    }
  }

  const ref = doc(collection(db, DT_COLLECTION));
  await setDoc(ref, {
    id:            ref.id,
    status:        'betting',
    roundNumber:   Date.now(),
    dragonCard:    null,
    tigerCard:     null,
    bets:          [],
    winner:        null,
    pot:           0,
    dealingLock:   null,
    bettingEndsAt: Timestamp.fromDate(new Date(Date.now() + BETTING_DURATION_MS)),
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });
  return ref.id;
};

// ─── PLACE BET ────────────────────────────────────────────────────────────────
export const placeDragonTigerBet = async (
  gameId: string,
  uid:    string,
  name:   string,
  amount: number,
  side:   DTSide,
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const gRef = doc(db, DT_COLLECTION, gameId);
    const wRef = doc(db, 'wallets', uid);
    const [g, w] = await Promise.all([tx.get(gRef), tx.get(wRef)]);

    if (!g.exists()) throw new Error('Game not found');
    if (!w.exists()) throw new Error('Wallet not found');

    const game   = g.data() as DragonTigerGame;
    const wallet = w.data() as any;

    if (game.status !== 'betting')                       throw new Error('Betting closed');
    if (game.bets?.some((b: DTBet) => b.uid === uid))   throw new Error('Already bet this round');
    if (calculateUsableBalance(wallet) < amount)         throw new Error('Insufficient balance');

    const newBalances = deductFromWallet(wallet, amount);
    if (!newBalances) throw new Error('Insufficient balance');

    tx.update(wRef, { ...newBalances, updatedAt: serverTimestamp() });
    tx.update(gRef, {
      bets: arrayUnion({ uid, name, amount, side, placedAt: Timestamp.now() }),
      pot:  increment(amount),
    });
  });
};

// ─── DEAL ─────────────────────────────────────────────────────────────────────
export const dealDragonTiger = async (gameId: string): Promise<void> => {
  const ref = doc(db, DT_COLLECTION, gameId);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Compute EVERYTHING synchronously BEFORE touching Firestore
  // ═══════════════════════════════════════════════════════════════════════════
  const deck      = shuffleDeck(createDeck());
  const dragonCard = deck[0];
  const tigerCard  = deck[1];

  let winner: DTSide;
  if (dragonCard.numericValue > tigerCard.numericValue)      winner = 'dragon';
  else if (tigerCard.numericValue > dragonCard.numericValue) winner = 'tiger';
  else                                                        winner = 'tie';

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Atomic lock — only ONE client claims the deal
  // ═══════════════════════════════════════════════════════════════════════════
  let claimed = false;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-game');

      const g = snap.data() as DragonTigerGame;
      if (g.status === 'result') throw new Error('already-done');

      const isStuck =
        g.status === 'dealing' &&
        g.updatedAt &&
        Date.now() - g.updatedAt.toMillis() > STUCK_THRESHOLD_MS;

      if (g.status !== 'betting' && !isStuck) throw new Error('already-dealing');

      // ✅ Set dealing AND dragon card atomically in one transaction
      tx.update(ref, {
        status:      'dealing',
        dragonCard,
        dealingLock: `lock-${Date.now()}`,
        updatedAt:   serverTimestamp(),
      });
      claimed = true;
    });
  } catch (e: any) {
    if (['already-dealing', 'already-done', 'no-game'].includes(e.message)) return;
    throw e;
  }

  if (!claimed) return;

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Animated reveal with FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════
  // Dragon card already set in transaction above → frontend sees it immediately
  let animationCompleted = false;

  try {
    // Wait for reveal animation
    await delay(1000);

    // Show tiger card
    await updateDoc(ref, { tigerCard, updatedAt: serverTimestamp() });
    await delay(800);

    // ✅ Final result update
    await updateDoc(ref, {
      status:    'result',
      winner,
      updatedAt: serverTimestamp(),
    });
    animationCompleted = true;

  } catch (animErr) {
    console.error('Animation update failed, force-writing result:', animErr);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: GUARANTEE result — even if animation failed
  // ═══════════════════════════════════════════════════════════════════════════
  if (!animationCompleted) {
    await forceResult(ref, dragonCard, tigerCard, winner);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: Pay winners
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const finalSnap = (await getDoc(ref)).data() as DragonTigerGame;

    for (const bet of finalSnap.bets ?? []) {
      let payout = 0;

      if (bet.side === winner) {
        if (winner === 'tie') payout = bet.amount * 8;
        else                  payout = Math.floor(bet.amount * 1.95);
      } else if (winner === 'tie' && bet.side !== 'tie') {
        payout = Math.floor(bet.amount * 0.5);
      }

      if (payout > 0) {
        try {
          await addFunds(
            bet.uid,
            payout,
            'winningBalance',
            `Dragon Tiger WIN — ${winner.toUpperCase()} — Round #${finalSnap.roundNumber}`,
          );
        } catch (err) {
          console.error('Payout error:', bet.uid, err);
        }
      }
    }
  } catch (err) {
    console.error('Payout phase error:', err);
  }
};

// ─── FORCE DEAL — frontend can call this for stuck games ──────────────────────
export const forceDealDragonTiger = async (gameId: string): Promise<void> => {
  const ref = doc(db, DT_COLLECTION, gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const g = snap.data() as DragonTigerGame;

  // Only for stuck dealing games
  if (g.status !== 'dealing') return;

  const age = Date.now() - (g.updatedAt?.toMillis?.() ?? 0);
  if (age < STUCK_THRESHOLD_MS) return;

  // Try to deal normally
  try {
    await dealDragonTiger(gameId);
  } catch {
    // If that fails too, just force result
    let winner: DTSide = 'dragon';
    if (g.dragonCard && g.tigerCard) {
      if (g.dragonCard.numericValue > g.tigerCard.numericValue)      winner = 'dragon';
      else if (g.tigerCard.numericValue > g.dragonCard.numericValue) winner = 'tiger';
      else                                                           winner = 'tie';
    }
    await updateDoc(ref, { status: 'result', winner, updatedAt: serverTimestamp() })
      .catch(() => {});
  }
};

// ─── SUBSCRIBE ────────────────────────────────────────────────────────────────
export const subscribeLatestDragonTiger = (
  cb: (id: string, game: DragonTigerGame) => void,
) => {
  return onSnapshot(
    query(
      collection(db, DT_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
    (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        cb(d.id, { id: d.id, ...d.data() } as DragonTigerGame);
      }
    },
  );
};

export const subscribeDragonTigerById = (
  gameId: string,
  cb: (game: DragonTigerGame) => void,
) => {
  return onSnapshot(doc(db, DT_COLLECTION, gameId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() } as DragonTigerGame);
  });
};
