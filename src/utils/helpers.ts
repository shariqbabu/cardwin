// =====================================================
// HELPERS / WALLET UTILITIES
// FULL FIXED VERSION
// =====================================================

export const generateReferralCode = (uid: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let code = '';

  for (let i = 0; i < 8; i++) {
    const charIndex =
      uid.charCodeAt(i % uid.length) % chars.length;

    code += chars[charIndex];
  }

  return code;
};

// =====================================================
// FORMAT CURRENCY
// =====================================================

export const formatCurrency = (
  amount: number
): string => {

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

// =====================================================
// FORMAT DATE
// =====================================================

export const formatDate = (
  timestamp: any
): string => {

  if (!timestamp) return 'N/A';

  const date =
    timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// =====================================================
// FORMAT SHORT DATE
// =====================================================

export const formatShortDate = (
  timestamp: any
): string => {

  if (!timestamp) return 'N/A';

  const date =
    timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

// =====================================================
// TRUNCATE ADDRESS
// =====================================================

export const truncateAddress = (
  str: string,
  maxLength = 20
): string => {

  if (str.length <= maxLength) return str;

  return str.substring(0, maxLength) + '...';
};

// =====================================================
// GAME COLOR CLASS
// =====================================================

export const getColorClass = (
  color: string
): string => {

  switch (color) {

    case 'RED':
      return 'bg-red-500';

    case 'GREEN':
      return 'bg-green-500';

    case 'VIOLET':
      return 'bg-violet-500';

    default:
      return 'bg-gray-500';
  }
};

// =====================================================
// STATUS TEXT COLOR
// =====================================================

export const getStatusColor = (
  status: string
): string => {

  switch (status) {

    case 'APPROVED':
    case 'COMPLETED':
    case 'MATCHED':
      return 'text-green-400';

    case 'PENDING':
    case 'WAITING':
      return 'text-yellow-400';

    case 'REJECTED':
    case 'FAILED':
    case 'CANCELLED':
      return 'text-red-400';

    default:
      return 'text-gray-400';
  }
};

// =====================================================
// STATUS BACKGROUND
// =====================================================

export const getStatusBg = (
  status: string
): string => {

  switch (status) {

    case 'APPROVED':
    case 'COMPLETED':
    case 'MATCHED':
      return 'bg-green-500/20 text-green-400 border-green-500/30';

    case 'PENDING':
    case 'WAITING':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';

    case 'REJECTED':
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-red-500/20 text-red-400 border-red-500/30';

    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

// =====================================================
// SLEEP
// =====================================================

export const sleep = (
  ms: number
) => new Promise(resolve => setTimeout(resolve, ms));

// =====================================================
// CARD SUIT
// =====================================================

export const getCardSuit = (
  index: number
): string => {

  const suits = ['♠', '♥', '♦', '♣'];

  return suits[index % 4];
};

// =====================================================
// CARD NAME
// =====================================================

export const getCardName = (
  value: number
): string => {

  if (value === 1) return 'A';

  if (value === 11) return 'J';

  if (value === 12) return 'Q';

  if (value === 13) return 'K';

  return value.toString();
};

// =====================================================
// CALCULATE USABLE BALANCE
// =====================================================

export const calculateUsableBalance = (
  wallet: {
    winningBalance: number;
    depositBalance: number;
    bonusBalance: number;
    referralBalance: number;
  }
): number => {

  if (!wallet) return 0;

  const depositBalance =
    wallet.depositBalance || 0;

  const winningBalance =
    wallet.winningBalance || 0;

  const referralBalance =
    wallet.referralBalance || 0;

  // ONLY 10% BONUS USABLE
  const usableBonus =
    Math.floor(
      (wallet.bonusBalance || 0) * 0.1
    );

  return (
    depositBalance +
    winningBalance +
    referralBalance +
    usableBonus
  );
};

// =====================================================
// DEDUCT BALANCE FOR GAMEPLAY
//
// PRIORITY:
//
// 1. Deposit Balance
// 2. Winning Balance
// 3. Referral Balance
// 4. Bonus Balance (10% MAX)
//
// =====================================================

export const deductFromWallet = (
  wallet: {
    winningBalance: number;
    depositBalance: number;
    bonusBalance: number;
    referralBalance: number;
  },
  amount: number
): {
  winningBalance: number;
  depositBalance: number;
  bonusBalance: number;
  referralBalance: number;
} | null => {

  // INVALID BET
  if (amount <= 0) {
    return null;
  }

  let remainingAmount = amount;

  let depositBalance =
    wallet.depositBalance || 0;

  let winningBalance =
    wallet.winningBalance || 0;

  let referralBalance =
    wallet.referralBalance || 0;

  let bonusBalance =
    wallet.bonusBalance || 0;

  // =====================================================
  // MAX BONUS USABLE = 10%
  // =====================================================

  const maxBonusUsable =
    Math.floor(
      Math.min(
        bonusBalance * 0.1,
        amount
      )
    );

  // =====================================================
  // TOTAL AVAILABLE
  // =====================================================

  const totalAvailable =
    depositBalance +
    winningBalance +
    referralBalance +
    maxBonusUsable;

  // INSUFFICIENT BALANCE
  if (totalAvailable < amount) {
    return null;
  }

  // =====================================================
  // STEP 1 — USE DEPOSIT BALANCE
  // =====================================================

  const depositUsed =
    Math.min(
      depositBalance,
      remainingAmount
    );

  depositBalance -= depositUsed;

  remainingAmount -= depositUsed;

  // =====================================================
  // STEP 2 — USE WINNING BALANCE
  // =====================================================

  const winningUsed =
    Math.min(
      winningBalance,
      remainingAmount
    );

  winningBalance -= winningUsed;

  remainingAmount -= winningUsed;

  // =====================================================
  // STEP 3 — USE REFERRAL BALANCE
  // =====================================================

  const referralUsed =
    Math.min(
      referralBalance,
      remainingAmount
    );

  referralBalance -= referralUsed;

  remainingAmount -= referralUsed;

  // =====================================================
  // STEP 4 — USE BONUS BALANCE
  // =====================================================

  const bonusUsed =
    Math.min(
      maxBonusUsable,
      remainingAmount
    );

  bonusBalance -= bonusUsed;

  remainingAmount -= bonusUsed;

  // =====================================================
  // SAFETY CHECK
  // =====================================================

  if (remainingAmount > 0) {
    return null;
  }

  return {
    winningBalance,
    depositBalance,
    bonusBalance,
    referralBalance,
  };
};

// =====================================================
// TOTAL BALANCE
// =====================================================

export const calculateTotalBalance = (
  wallet: {
    winningBalance: number;
    depositBalance: number;
    bonusBalance: number;
    referralBalance: number;
  }
): number => {

  return (
    (wallet.winningBalance || 0) +
    (wallet.depositBalance || 0) +
    (wallet.bonusBalance || 0) +
    (wallet.referralBalance || 0)
  );
};

// =====================================================
// WITHDRAWABLE BALANCE
// ONLY WINNING BALANCE
// =====================================================

export const calculateWithdrawableBalance = (
  wallet: {
    winningBalance: number;
  }
): number => {

  return wallet?.winningBalance || 0;
};

// =====================================================
// MINIMUM WITHDRAWAL VALIDATION
// =====================================================

export const canWithdraw = (
  wallet: {
    winningBalance: number;
  },
  amount: number
): boolean => {

  if (amount < 100) {
    return false;
  }

  return (
    (wallet?.winningBalance || 0) >= amount
  );
};

// =====================================================
// GAME BALANCE CHECK
// =====================================================

export const canPlayGame = (
  wallet: {
    winningBalance: number;
    depositBalance: number;
    bonusBalance: number;
    referralBalance: number;
  },
  amount: number
): boolean => {

  return (
    calculateUsableBalance(wallet) >= amount
  );
};
