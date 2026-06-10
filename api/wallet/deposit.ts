// api/wallet/deposit.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { amount, screenshotUrl, utrNumber } = req.body as {
      amount:        number;
      screenshotUrl: string;
      utrNumber:     string;
    };

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }
    if (!screenshotUrl?.trim()) {
      return res.status(400).json({ error: 'screenshotUrl required' });
    }
    if (!utrNumber?.trim()) {
      return res.status(400).json({ error: 'utrNumber required' });
    }

    // Read user info
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data()! : {};

    // Just create deposit request — admin will approve & call /api/wallet/add
    const depositRef = adminDb.collection('deposits').doc();
    await depositRef.set({
      uid,
      userName:      userData.name  ?? 'Unknown',
      userEmail:     userData.email ?? '',
      amount,
      screenshotUrl: screenshotUrl.trim(),
      utrNumber:     utrNumber.trim(),
      status:        'PENDING',
      createdAt:     FieldValue.serverTimestamp(),
      updatedAt:     FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, depositId: depositRef.id });
  } catch (error: any) {
    console.error('Wallet deposit error:', error);
    return res.status(400).json({ error: error.message });
  }
}
