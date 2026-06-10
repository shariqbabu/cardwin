// api/auth/updateProfile.ts
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
    const { name, phone, photoURL } = req.body as {
      name?: string; phone?: string; photoURL?: string;
    };

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (name     !== undefined) updates.name     = name;
    if (phone    !== undefined) updates.phone    = phone;
    if (photoURL !== undefined) updates.photoURL = photoURL;

    await adminDb.collection('users').doc(uid).update(updates);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    const status = error.message.startsWith('Unauthorized') ? 401 : 400;
    return res.status(status).json({ error: error.message });
  }
}
