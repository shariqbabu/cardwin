import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  photoURL?: string;
  referralCode: string;
  referredBy?: string;
  isAdmin: boolean;
  isOnline: boolean;
  isBanned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp; 
}

export interface Wallet {
  uid: string;
  totalBalance: number;
  winningBalance: number;
  depositBalance: number;
  bonusBalance: number;
  referralBalance: number;
  updatedAt: Timestamp;
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'GAME_WIN'
  | 'GAME_LOSS'
  | 'BONUS'
  | 'REFERRAL'
  | 'REFUND'
  | 'DEDUCATION_WIN'
  | 'DEDUCATION_DEPOSIT';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Transaction {
  id?: string;
  uid: string;
  type: TransactionType;
  amount: number;
  previousBalance: number;
  currentBalance: number;
  status: TransactionStatus;
  description: string;
  createdAt: Timestamp;
}

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Deposit {
  id?: string;
  uid: string;
  userName: string;
  userEmail: string;
  amount: number;
  screenshotUrl: string;
  utrNumber?: string;
  status: DepositStatus;
  adminNote?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Withdrawal {
  id?: string;
  uid: string;
  userName: string;
  userEmail: string;
  amount: number;
  upiId: string;
  status: WithdrawalStatus;
  adminNote?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Game types
export type GameType = 'COLOR_PREDICTION' | 'CARD_GAME' | 'DICE_GAME';
export type GameRoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
export type MatchmakingStatus = 'WAITING' | 'MATCHED' | 'CANCELLED';

export interface GameRoom {
  id?: string;
  roomId: string;
  gameType: GameType;
  entryFee: number;
  status: GameRoomStatus;
  player1: PlayerInfo | null;
  player2: PlayerInfo | null;
  winner?: string;
  winnerName?: string;
  result?: any;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlayerInfo {
  uid: string;
  name: string;
  photoURL?: string;
  card?: number;
  cardSuit?: string;
}

export interface MatchmakingQueue {
  id?: string;
  uid: string;
  userName: string;
  photoURL?: string;
  entryFee: number;
  gameType: GameType;
  status: MatchmakingStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Color prediction game
export type ColorChoice = 'RED' | 'GREEN' | 'VIOLET';
export type ColorGameStatus = 'BETTING' | 'CLOSED' | 'RESULT';

export interface ColorPredictionRound {
  id?: string;
  roundNumber: number;
  status: ColorGameStatus;
  bets: ColorBet[];
  result?: ColorChoice;
  timerEnd: Timestamp;
  endsAt?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ColorBet {
  uid: string;
  userName: string;
  color: ColorChoice;
  amount: number;
  multiplier: number;
  settled: boolean;
  won?: boolean;
  payout?: number;
}

// Notifications
export type NotificationType =
  | 'DEPOSIT_APPROVED'
  | 'DEPOSIT_REJECTED'
  | 'WITHDRAWAL_APPROVED'
  | 'WITHDRAWAL_REJECTED'
  | 'GAME_WIN'
  | 'GAME_LOSS'
  | 'REFERRAL_BONUS'
  | 'GENERAL';

export interface Notification {
  id?: string;
  uid: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
}

// Referral
export interface Referral {
  id?: string;
  referrerId: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  bonusAmount: number;
  createdAt: Timestamp;
}

// Admin log
export interface AdminLog {
  id?: string;
  adminUid: string;
  action: string;
  targetUid?: string;
  details: string;
  createdAt: Timestamp;
}

// Dice game
export interface DiceGame {
  id?: string;
  uid: string;
  bet: number;
  prediction: 'ODD' | 'EVEN';
  dice1?: number;
  dice2?: number;
  sum?: number;
  result?: 'ODD' | 'EVEN';
  won?: boolean;
  payout?: number;
  status: 'ROLLING' | 'SETTLED';
  createdAt: Timestamp;
}

// Auth form types
export interface LoginForm {
  email: string;
  password: string;
}

export interface SignupForm {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  referralCode?: string;
}

export interface DepositForm {
  amount: number;
  utrNumber: string;
}

export interface WithdrawalForm {
  amount: number;
  upiId: string;
}

export interface ProfileForm {
  name: string;
  phone: string;
}
// src/types.ts — Add these fields to your existing PokerTable interface

export interface PokerTable {
  id: string;
  name: string;
  status: 'waiting' | 'playing' | 'finished';
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  minBuyIn: number;
  maxBuyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  players: PokerPlayer[];
  spectators: string[];
  communityCards: Card[];
  pot: number;
  sidePots: number[];
  currentBet: number;
  dealerSeat: number;
  activePlayerUid: string | null;
  deck: Card[];
  handNumber: number;
  createdBy: string;
  autoStart?: boolean;
  lastBrokePlayers?: Array<{ uid: string; name: string }>;
  createdAt: any;
  updatedAt: any;
  lastActionAt: any;
}

// Make sure these also exist in types.ts:
export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
  numericValue: number;
}

export interface PokerPlayer {
  uid: string;
  name: string;
  avatar: string;
  chips: number;
  holeCards: Card[];
  bet: number;
  totalBet: number;
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'left';
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  handRank?: string;
  seatIndex: number;
  joinedAt: any;
}
// Existing types ke NEECHE add karo

export interface Card { 
  suit:'hearts'|'diamonds'|'clubs'|'spades';
  value:'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'
}
export interface ABBet { uid:string; name:string; amount:number;
                        side:'andar'|'bahar'; placedAt:any
                       }
export interface AndarBaharGame { id:string; status:'betting'|'dealing'|'result';
                                 roundNumber:number; jokerCard:Card|null; andarCards:Card[]; baharCards:Card[]; bets:ABBet[];
                                 winner:'andar'|'bahar'|null; pot:number; bettingEndsAt:any; createdAt:any; updatedAt:any;
                                }


// Andar Bahar ke neeche add karo
export interface DiceBet { 
  uid: string; name: string; amount: number; 
  prediction: 'ODD'|'EVEN'; placedAt: any 
}
export interface DiceGame {
  id: string;
  status: 'betting'|'rolling'|'result';
  roundNumber: number;
  dice1: number | null;
  dice2: number | null;
  sum: number | null;
  result: 'ODD'|'EVEN'|null;
  bets: DiceBet[];
  pot: number;
  bettingEndsAt: any;
  createdAt: any;
  updatedAt: any;
}

// ─── LUDO TYPES ──────────────────────────────────────
export type LudoColor = 'red' | 'green';
export type TableStatus = 'waiting' | 'playing' | 'finished';

export interface LudoToken {
  id: number;        // 0,1,2,3
  position: number;  // -1 = base, 0-56 = board, 57 = home
  isHome: boolean;
  isSafe: boolean;
}

export interface LudoPlayer {
  uid: string;
  name: string;
  color: LudoColor;
  score: number;
  tokensHome: number;
  tokens: LudoToken[];
}

export interface LudoGameState {
  diceValue: number;
  activePlayer: string;       // uid
  consecutiveSixes: number;
  lastRollTime: any;
  boardState: Record<string, number[]>; // position -> [tokenIds]
}

export interface LudoTable {
  id: string;
  tableNumber: number;
  status: TableStatus;
  maxPlayers: number;
  players: LudoPlayer[];
  gameState: LudoGameState;
  matchStarted: boolean;
  matchEnded: boolean;
  timer: number;
  timerStartedAt: any;
  winnerId: string | null;
  winnerName: string | null;
  entryFee: number;  // ADD
  pot: number;       // ADD
  createdAt: any;
  updatedAt: any;
}
