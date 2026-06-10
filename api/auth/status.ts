import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { isOnline } = req.body as { isOnline: boolean };

    if (typeof isOnline !== 'boolean')
      return res.status(400).json({ error: 'isOnline (boolean) required' });

    await adminDb.collection('users').doc(uid).update({
      isOnline,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    const status = error.message === 'Unauthorized' ? 401 : 400;
    return res.status(status).json({ error: error.message });
  }
}
