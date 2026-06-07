// src/utils/ludoHelpers.ts
import { LudoToken, LudoColor } from '../types';

export const MATCH_DURATION = 180; // 3 min

// Safe cells (board positions)
export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

// Starting positions on main board
export const START_POSITIONS: Record<LudoColor, number> = {
  red: 1,
  green: 27,
};

// Home stretch start
export const HOME_ENTRY: Record<LudoColor, number> = {
  red: 51,
  green: 25,
};

// Initial tokens for a player
export const createTokens = (): LudoToken[] =>
  [0, 1, 2, 3].map(id => ({
    id,
    position: -1,
    isHome: false,
    isSafe: false,
  }));

// Check if position is safe
export const isSafeCell = (pos: number): boolean =>
  SAFE_CELLS.includes(pos);

// Calculate new position after dice roll
export const calculateNewPosition = (
  current: number,
  dice: number,
  color: LudoColor
): number | null => {
  if (current === -1) return null; // still in base
  if (current === 57) return null; // already home

  const newPos = current + dice;

  // Home entry
  if (newPos > 57) return null; // overshoots home
  if (newPos === 57) return 57; // exact home

  return newPos % 52; // wrap around board
};

// Check if token can move
export const canMove = (
  token: LudoToken,
  dice: number,
  color: LudoColor
): boolean => {
  if (token.isHome) return false;
  if (token.position === -1 && dice !== 6) return false;
  if (token.position === -1 && dice === 6) return true;

  const newPos = calculateNewPosition(token.position, dice, color);
  return newPos !== null;
};
