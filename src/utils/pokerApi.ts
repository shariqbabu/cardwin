// src/utils/pokerApi.ts
import { getIdToken } from 'firebase/auth';
import { auth } from '../firebase/config';

const BASE = '/api/poker';

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');
  const token = await getIdToken(user, /* forceRefresh */ false);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function post<T = any>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: await authHeader(),
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

// ── Poker actions ─────────────────────────────────────────────────────────────

export const apiPokerStart = (tableId: string) =>
  post('/start', { tableId });

export const apiPokerJoin = (
  tableId: string,
  name: string,
  avatar: string,
  buyIn: number,
) => post('/join', { tableId, name, avatar, buyIn });

export const apiPokerLeave = (tableId: string) =>
  post('/leave', { tableId });

export const apiPokerSettle = (tableId: string) =>
  post('/settle', { tableId });

export const apiPokerAction = (
  tableId: string,
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
  amount?: number,
) => post('/action', { tableId, action, amount });
