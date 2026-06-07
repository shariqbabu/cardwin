
import {
  doc, collection, setDoc, getDoc, updateDoc,
  onSnapshot, runTransaction, serverTimestamp,
  query, where, getDocs, orderBy, limit, increment,
  arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { AndarBaharGame, ABBet, Card } from '../types';
import { addFunds } from './wallet';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

const AB_COLLECTION = 'andarBaharGames';
const BETTING_DURATION_MS = 20_000;
const STUCK_THRESHOLD_MS  = 20_000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── DECK HELPERS ─────────────────────────────────────────────────────────────
const createDeck = (): Card[] => {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const vals: Card['value'][]  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  return suits.flatMap((s) => vals.map((v) => ({ suit: s, value: v })));
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
      collection(db, AB_COLLECTION),
      where('status', 'in', ['betting', 'dealing']),
      orderBy('createdAt', 'desc'),
      limit(5),
    ),
  );
  const now = Date.now();
  for (const d of snap.docs) {
    const g = d.data() as AndarBaharGame;
    if (now - g.createdAt.toMillis() > 90_000) {
      await updateDoc(d.ref, {
        status: 'result', winner: 'andar', updatedAt: serverTimestamp(),
      });
    }
  }
};

// ─── CREATE NEW ROUND ─────────────────────────────────────────────────────────
export const createAndarBaharRound = async (): Promise<string> => {
  await cleanup();

  const existing = await getDocs(
    query(
      collection(db, AB_COLLECTION),
      where('status', 'in', ['betting', 'dealing']),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );
  if (!existing.empty) return existing.docs[0].id;

  const ref = doc(collection(db, AB_COLLECTION));
  await setDoc(ref, {
    id:            ref.id,
    status:        'betting',
    roundNumber:   Date.now(),
    jokerCard:     null,
    andarCards:    [],
    baharCards:    [],
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
// Unlimited users bet kar sakte hain — har user sirf ek baar
export const placeAndarBaharBet = async (
  gameId: string,
  uid:    string,
  name:   string,
  amount: number,
  side:   'andar' | 'bahar',
): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const gRef = doc(db, AB_COLLECTION, gameId);
    const wRef = doc(db, 'wallets', uid);
    const [g, w] = await Promise.all([tx.get(gRef), tx.get(wRef)]);

    if (!g.exists()) throw new Error('Game not found');
    if (!w.exists()) throw new Error('Wallet not found');

    const game   = g.data() as AndarBaharGame;
    const wallet = w.data() as any;

    if (game.status !== 'betting')                     throw new Error('Betting closed');
    if (game.bets?.some((b: ABBet) => b.uid === uid)) throw new Error('Already bet this round');
    if (calculateUsableBalance(wallet) < amount)       throw new Error('Insufficient balance');

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
export const dealAndarBahar = async (gameId: string): Promise<void> => {
  const ref = doc(db, AB_COLLECTION, gameId);

  let claimed = false;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-game');

      const g = snap.data() as AndarBaharGame;
      if (g.status === 'result') throw new Error('already-done');

      const isStuck =
        g.status === 'dealing' &&
        g.updatedAt &&
        Date.now() - g.updatedAt.toMillis() > STUCK_THRESHOLD_MS;

      if (g.status !== 'betting' && !isStuck) throw new Error('already-dealing');

      tx.update(ref, {
        status:      'dealing',
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

  // Step 2: Joker pick karo
  let game = (await getDoc(ref)).data() as AndarBaharGame;
  let joker = game.jokerCard;

  if (!joker) {
    const fullDeck = shuffleDeck(createDeck());
    joker = fullDeck[0]; // Pehla card joker
    await updateDoc(ref, { jokerCard: joker, updatedAt: serverTimestamp() });
    await delay(800);
  }

  // ✅ FIX: Joker card ko hata do (sirf woh ek specific card)
  // Baaki same VALUE ke cards deck mein REHNE CHAHIYE — unhe hi dhundna hai
  const fullDeck = shuffleDeck(createDeck());
  
  // Joker ke exact card ko pehle skip karo, baaki sab rakho
  // Ek joker card already "table pe" hai, remaining 51 cards se deal hoga
  let jokerSkipped = false;
  const deck = fullDeck.filter((c) => {
    if (!jokerSkipped && c.suit === joker!.suit && c.value === joker!.value) {
      jokerSkipped = true;
      return false; // Sirf ek baar skip karo
    }
    return true; // ✅ Same value ke doosre cards REHNE CHAHIYE
  });

  // Step 4: Cards deal karo
  // Pehla card Bahar ko (standard Andar Bahar rule)
  let andar:  Card[] = [];
  let bahar:  Card[] = [];
  let side:   'andar' | 'bahar' = 'bahar';
  let winner: 'andar' | 'bahar' | null = null;

  for (const card of deck) {
    if (side === 'bahar') {
      bahar = [...bahar, card];
      await updateDoc(ref, { baharCards: bahar, updatedAt: serverTimestamp() });
    } else {
      andar = [...andar, card];
      await updateDoc(ref, { andarCards: andar, updatedAt: serverTimestamp() });
    }

    await delay(700);

    // ✅ Ab yeh match HOGA — same value ke cards deck mein hain
    if (card.value === joker!.value) {
      winner = side;
      break;
    }

    side = side === 'bahar' ? 'andar' : 'bahar';
  }

  // ✅ Safety fallback — practically kabhi nahi aayega ab
  // Agar kisi edge case mein na mile toh random choose karo
  const finalWinner: 'andar' | 'bahar' = winner ?? (Math.random() < 0.5 ? 'andar' : 'bahar');

  // Step 5: Result save karo
  await updateDoc(ref, {
    status:     'result',
    winner:     finalWinner,
    andarCards: andar,
    baharCards: bahar,
    updatedAt:  serverTimestamp(),
  });

  // Step 6: Winners ko payout karo
  const finalSnap = (await getDoc(ref)).data() as AndarBaharGame;
  for (const b of finalSnap.bets ?? []) {
    if (b.side === finalWinner) {
      try {
        await addFunds(
          b.uid,
          Math.floor(b.amount * 1.9),
          'winningBalance',
          `Andar Bahar Win — Round #${finalSnap.roundNumber}`,
        );
      } catch (err) {
        console.error('Payout error:', b.uid, err);
      }
    }
  }
};

// ─── SUBSCRIBE: latest game realtime ─────────────────────────────────────────
// Sabko same Firestore data milega → same cards dikhenge
export const subscribeLatestAndarBahar = (
  cb: (id: string, game: AndarBaharGame) => void,
) => {
  return onSnapshot(
    query(
      collection(db, AB_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
    (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        cb(d.id, { id: d.id, ...d.data() } as AndarBaharGame);
      }
    },
  );
};
