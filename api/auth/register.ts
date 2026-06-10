import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb, adminAuth } from '../_lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

function generateReferralCode(uid: string): string {
  return uid.substring(0, 8).toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { uid, name, email, phone, referralCode } = req.body as {
      uid: string; name: string; email: string;
      phone: string; referralCode?: string;
    };

    if (!uid || !name || !email || !phone)
      return res.status(400).json({ error: 'Missing fields' });

    const userReferralCode = generateReferralCode(uid);
    let referredBy: string | undefined;

    // Check referral code
    if (referralCode) {
      const snap = await adminDb.collection('users')
        .where('referralCode', '==', referralCode)
        .limit(1).get();
      if (!snap.empty && snap.docs[0].id !== uid) {
        referredBy = snap.docs[0].id;
      }
    }

    // Create user + wallet atomically
    await adminDb.runTransaction(async (tx) => {
      const userRef   = adminDb.collection('users').doc(uid);
      const walletRef = adminDb.collection('wallets').doc(uid);

      tx.set(userRef, {
        uid, name, email, phone,
        photoURL: '',
        referralCode: userReferralCode,
        referredBy: referredBy || null,
        isOnline: true,
        isBanned: false,
        role: 'user',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(walletRef, {
        uid,
        winningBalance:  0,
        depositBalance:  0,
        bonusBalance:    referredBy ? 50 : 0,
        referralBalance: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Referral reward
    if (referredBy) {
      try {
        await adminDb.runTransaction(async (tx) => {
          const referrerWalletRef  = adminDb.collection('wallets').doc(referredBy!);
          const referrerWalletSnap = await tx.get(referrerWalletRef);
          if (referrerWalletSnap.exists) {
            tx.update(referrerWalletRef, {
              referralBalance: FieldValue.increment(50),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          const referralRef = adminDb.collection('referrals').doc();
          tx.set(referralRef, {
            referrerId: referredBy,
            referredId: uid,
            referredName: name,
            referredEmail: email,
            bonusAmount: 50,
            createdAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (_e) {}
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Register error:', error);
    return res.status(400).json({ error: error.message });
  }
}
