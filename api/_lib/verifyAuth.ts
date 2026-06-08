// api/_lib/verifyAuth.ts
import { adminAuth } from './firebaseAdmin';

export async function verifyToken(authHeader?: string): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

// Wallet deduction helper (deposit → winning → referral → bonus)
export function calculateDeduction(wallet: any, amount: number) {
  const total =
    (wallet.depositBalance || 0) +
    (wallet.winningBalance || 0) +
    (wallet.bonusBalance || 0) +
    (wallet.referralBalance || 0);

  if (total < amount) return null;

  let remaining = amount;
  let deposit = wallet.depositBalance || 0;
  let winning = wallet.winningBalance || 0;
  let referral = wallet.referralBalance || 0;
  let bonus = wallet.bonusBalance || 0;

  const fromDeposit = Math.min(deposit, remaining);
  deposit -= fromDeposit;
  remaining -= fromDeposit;

  if (remaining > 0) {
    const fromWinning = Math.min(winning, remaining);
    winning -= fromWinning;
    remaining -= fromWinning;
  }
  if (remaining > 0) {
    const fromReferral = Math.min(referral, remaining);
    referral -= fromReferral;
    remaining -= fromReferral;
  }
  if (remaining > 0) {
    bonus -= remaining;
    remaining = 0;
  }

  return {
    depositBalance: deposit,
    winningBalance: winning,
    referralBalance: referral,
    bonusBalance: bonus,
    previousTotal: total,
    newTotal: total - amount,
  };
}
