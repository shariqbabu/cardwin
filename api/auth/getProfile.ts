import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);

    const [userSnap, walletSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('wallets').doc(uid).get(),
    ]);

    if (!userSnap.exists) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const userData = userSnap.data() || {};

    const walletData = walletSnap.exists
      ? walletSnap.data()
      : {
          depositBalance: 0,
          winningBalance: 0,
          referralBalance: 0,
          bonusBalance: 0,
        };

    const totalBalance =
      (walletData.depositBalance || 0) +
      (walletData.winningBalance || 0) +
      (walletData.referralBalance || 0) +
      (walletData.bonusBalance || 0);

    return res.status(200).json({
      success: true,

      user: {
        uid: userData.uid,
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        photoURL: userData.photoURL || '',
        referralCode: userData.referralCode || '',
        referredBy: userData.referredBy || null,
        isOnline: userData.isOnline || false,
        isBanned: userData.isBanned || false,
      },

      wallet: {
        depositBalance: walletData.depositBalance || 0,
        winningBalance: walletData.winningBalance || 0,
        referralBalance: walletData.referralBalance || 0,
        bonusBalance: walletData.bonusBalance || 0,
        totalBalance,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);

    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message.includes('Too many requests')
        ? 429
        : 400;

    return res.status(status).json({
      error: error.message || 'Failed to fetch profile',
    });
  }
}
