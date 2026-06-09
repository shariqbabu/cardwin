// src/utils/gameApi.ts
import { auth } from '../firebase/config';

async function callApi(endpoint: string, data: any) {
  const user = auth.currentUser;
  if (!user) throw new Error('Login required');

  const token = await user.getIdToken();

  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Server error');
  return result;
}

// ── POKER ──
export const pokerJoin = (tableId: string, name: string, avatar: string, buyIn: number) =>
  callApi('poker/join', { tableId, name, avatar, buyIn });

export const pokerSettle = (tableId: string) =>
  callApi('poker/settle', { tableId });

export const pokerLeave = (tableId: string) =>
  callApi('poker/leave', { tableId });

// ── NINE CARD ──
export const nineCardJoin = (tableId: string, displayName: string, photoURL: string) =>
  callApi('ninecard/join', { tableId, displayName, photoURL });

export const nineCardSettle = (tableId: string, winnerUid: string) =>
  callApi('ninecard/settle', { tableId, winnerUid });
