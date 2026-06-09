// api/_lib/verifyAuth.ts
import { adminAuth } from './firebaseAdmin';

// Token verify karo
export async function verifyToken(
  authHeader: string | undefined
): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token   = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

// Wallet deduction logic
interface WalletData {
  depositBalance:  number;
  winningBalance:  number;
  referralBalance: number;
  bonusBalance:    number;
}

interface DeductionResult extends WalletData {
  previousTotal: number;
  newTotal:      number;
}

export function calculateDeduction(
  wallet: WalletData,
  amount: number
): DeductionResult | null {
  const {
    depositBalance  = 0,
    winningBalance  = 0,
    referralBalance = 0,
    bonusBalance    = 0,
  } = wallet;

  const total = depositBalance + winningBalance + referralBalance + bonusBalance;
  if (total < amount) return null;

  let remaining = amount;
  let newDeposit  = depositBalance;
  let newWinning  = winningBalance;
  let newReferral = referralBalance;
  let newBonus    = bonusBalance;

  // Priority: deposit → winning → referral → bonus
  if (remaining > 0) {
    const d = Math.min(remaining, newDeposit);
    newDeposit -= d; remaining -= d;
  }
  if (remaining > 0) {
    const d = Math.min(remaining, newWinning);
    newWinning -= d; remaining -= d;
  }
  if (remaining > 0) {
    const d = Math.min(remaining, newReferral);
    newReferral -= d; remaining -= d;
  }
  if (remaining > 0) {
    const d = Math.min(remaining, newBonus);
    newBonus -= d; remaining -= d;
  }

  if (remaining > 0) return null;

  return {
    depositBalance:  newDeposit,
    winningBalance:  newWinning,
    referralBalance: newReferral,
    bonusBalance:    newBonus,
    previousTotal:   total,
    newTotal:        total - amount,
  };
}
