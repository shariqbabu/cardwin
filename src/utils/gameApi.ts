// src/utils/gameApi.ts
import { auth } from '../firebase/config';

// ✅ Fix - Token refresh + better errors
async function callApi(endpoint: string, data: any) {
  const user = auth.currentUser;
  if (!user) throw new Error('Login required');

  try {
    // forceRefresh: true → expired token auto refresh hoga
    const token = await user.getIdToken(true);

    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.status === 401) throw new Error('Session expired. Please login again.');
    if (res.status === 403) throw new Error('Access denied.');
    if (res.status === 429) throw new Error('Too many requests. Please wait.');
    if (!res.ok) throw new Error(result.error || 'Server error');

    return result;

  } catch (error: any) {
    // Network error
    if (error.name === 'TypeError') {
      throw new Error('Network error. Check your connection.');
    }
    throw error;
  }
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
