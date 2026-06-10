// api/auth/updateProfile.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb } from '../_lib/firebaseAdmin';
import { verifyToken, setCorsHeaders } from '../_lib/verifyAuth';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  try {
    const uid = await verifyToken(req.headers.authorization);

    const {
      name,
      phone,
      photoURL,
    }: {
      name?: string;
      phone?: string;
      photoURL?: string;
    } = req.body;

    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    let hasChanges = false;

    if (name !== undefined) {
      const trimmedName = name.trim();

      if (!trimmedName) {
        return res.status(400).json({
          error: 'Name cannot be empty',
        });
      }

      if (trimmedName.length > 50) {
        return res.status(400).json({
          error: 'Name must be less than 50 characters',
        });
      }

      updates.name = trimmedName;
      hasChanges = true;
    }

    if (phone !== undefined) {
      const trimmedPhone = phone.trim();

      if (!/^[0-9]{10,15}$/.test(trimmedPhone)) {
        return res.status(400).json({
          error: 'Invalid phone number',
        });
      }

      updates.phone = trimmedPhone;
      hasChanges = true;
    }

    if (photoURL !== undefined) {
      const trimmedPhotoURL = photoURL.trim();

      if (trimmedPhotoURL.length > 500) {
        return res.status(400).json({
          error: 'Photo URL too long',
        });
      }

      updates.photoURL = trimmedPhotoURL;
      hasChanges = true;
    }

    if (!hasChanges) {
      return res.status(400).json({
        error: 'No fields provided to update',
      });
    }

    await userRef.update(updates);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    console.error('Update profile error:', error);

    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message.includes('Too many requests')
        ? 429
        : 400;

    return res.status(status).json({
      error: error.message || 'Failed to update profile',
    });
  }
}
