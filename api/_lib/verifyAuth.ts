// api/_lib/verifyAuth.ts
import type { VercelResponse } from '@vercel/node';
import { adminAuth } from './firebaseAdmin';

// ── CORS ─────────────────────────────────────────────────────────────────────
export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Rate limiting (in-memory, per instance) ───────────────────────────────────
// NOTE: Resets on cold start. Use Redis/Firestore for multi-instance safety.
const rateLimitMap = new Map<string, number[]>();

export async function verifyToken(
  authHeader: string | undefined,
): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token   = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth.verifyIdToken(token);
  const uid     = decoded.uid;

  // Sliding-window rate limit — 10 requests per 60 s
  const now            = Date.now();
  const userRequests   = rateLimitMap.get(uid) ?? [];
  const recentRequests = userRequests.filter(t => now - t < 60_000);

  if (recentRequests.length >= 10) {
    throw new Error('Too many requests. Please wait.');
  }

  rateLimitMap.set(uid, [...recentRequests, now]);
  return uid;
}

// ── Wallet types ──────────────────────────────────────────────────────────────
export interface WalletData {
  depositBalance:  number;
  winningBalance:  number;
  referralBalance: number;
  bonusBalance:    number;
}

export interface DeductionResult extends WalletData {
  previousTotal: number;
  newTotal:      number;
}

// ── Wallet deduction (priority: deposit → winning → referral → bonus) ─────────
export function calculateDeduction(
  wallet: WalletData,
  amount: number,
): DeductionResult | null {
  const {
    depositBalance  = 0,
    winningBalance  = 0,
    referralBalance = 0,
    bonusBalance    = 0,
  } = wallet;

  const total = depositBalance + winningBalance + referralBalance + bonusBalance;
  if (total < amount) return null;

  let remaining   = amount;
  let newDeposit  = depositBalance;
  let newWinning  = winningBalance;
  let newReferral = referralBalance;
  let newBonus    = bonusBalance;

  if (remaining > 0) { const d = Math.min(remaining, newDeposit);  newDeposit  -= d; remaining -= d; }
  if (remaining > 0) { const d = Math.min(remaining, newWinning);  newWinning  -= d; remaining -= d; }
  if (remaining > 0) { const d = Math.min(remaining, newReferral); newReferral -= d; remaining -= d; }
  if (remaining > 0) { const d = Math.min(remaining, newBonus);    newBonus    -= d; remaining -= d; }

  return {
    depositBalance:  newDeposit,
    winningBalance:  newWinning,
    referralBalance: newReferral,
    bonusBalance:    newBonus,
    previousTotal:   total,
    newTotal:        total - amount,
  };
}
