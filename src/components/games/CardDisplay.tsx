import React from 'react';
import { motion } from 'framer-motion';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
  numericValue: number;
}

interface CardDisplayProps {
  card?: Card | string | null; // ✅ Accept both object & string format
  faceDown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  animate?: boolean;
  delay?: number;
  isJoker?: boolean;
  isWinner?: boolean;
}

const suitSymbols: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const suitColors: Record<string, string> = {
  hearts: 'text-red-500',
  diamonds: 'text-red-500',
  clubs: 'text-black',
  spades: 'text-black',
};

const valueDisplay: Record<string, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K'
};

const sizeClasses = {
  xs: 'w-[32px] h-[44px] text-[10px]',
  sm: 'w-[40px] h-[56px] text-xs',
  md: 'w-[50px] h-[70px] text-sm',
  lg: 'w-[60px] h-[84px] text-base',
};

// ✅ Safe parser for "As", "Kd", "10h", etc.
const parseCard = (input: string | Card | null | undefined): Card | null => {
  if (!input) return null;
  if (typeof input === 'object' && 'suit' in input) return input as Card;

  const str = input.toString().toLowerCase().trim();
  // Matches: "As", "kD", "10h", "qc"
  const match = str.match(/^(\d+|[a-k])\s*([hdcsp])$/);
  if (!match) return null;

  let value = match[1];
  const suitChar = match[2];

  if (value === '10') value = '10';
  else if (value === 'a') value = 'A';
  else if (value === 'j') value = 'J';
  else if (value === 'q') value = 'Q';
  else if (value === 'k') value = 'K';

  let suit: Card['suit'] = 'spades';
  if (suitChar === 'h') suit = 'hearts';
  else if (suitChar === 'd') suit = 'diamonds';
  else if (suitChar === 'c') suit = 'clubs';
  else if (suitChar === 's') suit = 'spades';

  const numericValueMap: Record<string, number> = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
  };

  return { suit, value, numericValue: numericValueMap[value] || 1 };
};

export const CardDisplay: React.FC<CardDisplayProps> = ({
  card,
  faceDown = false,
  size = 'sm',
  animate = false,
  delay = 0,
  isJoker = false,
  isWinner = false,
}) => {
  const parsedCard = parseCard(card);

  // Fallback for empty placeholder
  if (!parsedCard && !faceDown) {
    return (
      <div className={`bg-white rounded-lg shadow-md border border-gray-200 ${sizeClasses[size] || sizeClasses.sm}`} />
    );
  }

  // Face down render
  if (faceDown) {
    return (
      <motion.div
        initial={animate ? { opacity: 0, y: -20 } : false}
        animate={animate ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: delay / 1000, duration: 0.3 }}
        className={`bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg shadow-md ${sizeClasses[size] || sizeClasses.sm} flex items-center justify-center`}
      >
        <span className="text-white text-2xl font-black">🂡</span>
      </motion.div>
    );
  }

  // Safe access after parsing
  const symbol = suitSymbols[parsedCard!.suit];
  const displayValue = valueDisplay[parsedCard!.value] || parsedCard!.value;

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: -20 } : false}
      animate={animate ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: delay / 1000, duration: 0.3 }}
      className={`
        bg-white rounded-lg shadow-md border border-gray-200
        ${sizeClasses[size] || sizeClasses.sm}
        ${isJoker ? 'ring-2 ring-red-500 ring-opacity-50' : ''}
        ${isWinner ? 'ring-2 ring-green-500 ring-opacity-50' : ''}
        flex flex-col items-center justify-center
        ${parsedCard!.suit === 'hearts' || parsedCard!.suit === 'diamonds' ? 'text-red-500' : 'text-black'}
      `}
    >
      <span className="font-bold text-left w-full pl-1">{displayValue}</span>
      <span className="text-xl">{symbol}</span>
    </motion.div>
  );
};

export default CardDisplay;
