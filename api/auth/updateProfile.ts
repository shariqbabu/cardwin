import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await verifyToken(req.headers.authorization);
    const { name, phone, photoURL } = req.body as {
      name?: string; phone?: string; photoURL?: string;
    };

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (name)     updates.name     = name;
    if (phone)    updates.phone    = phone;
    if (photoURL) updates.photoURL = photoURL;

    await adminDb.collection('users').doc(uid).update(updates);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}
