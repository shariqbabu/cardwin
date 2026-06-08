// src/firebase/adminAuth.ts
// ─────────────────────────────────────────────────────────
// Alag admins collection use karta hai — users collection se
// bilkul alag. Admin ka data sirf yahan hoga.
// ─────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from './config';

// ─── Types ───────────────────────────────────────────────

export interface AdminProfile {
  uid: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'moderator';
  createdAt: any;
}

// ─── Admin Login ─────────────────────────────────────────

/**
 * Email/password se login karo.
 * Uske baad check karo ke `admins` collection mein entry hai ya nahi.
 * Agar nahi hai → logout karke error throw karo.
 */
export const adminLogin = async (
  email: string,
  password: string
): Promise<AdminProfile> => {
  // Step 1: Firebase Auth login
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  // Step 2: admins collection mein check karo
  const adminRef = doc(db, 'admins', uid);
  const adminSnap = await getDoc(adminRef);

  if (!adminSnap.exists()) {
    // Ye user admin nahi hai — logout karo
    await signOut(auth);
    throw new Error('Access denied. You are not an admin.');
  }

  const data = adminSnap.data();
  return {
    uid,
    email: data.email || email,
    name: data.name || 'Admin',
    role: data.role || 'admin',
    createdAt: data.createdAt,
  };
};

// ─── Admin Logout ─────────────────────────────────────────

export const adminLogout = async (): Promise<void> => {
  await signOut(auth);
};

// ─── Check if current Firebase user is admin ─────────────

export const checkAdminAccess = async (
  uid: string
): Promise<AdminProfile | null> => {
  const adminRef = doc(db, 'admins', uid);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists()) return null;
  const data = adminSnap.data();
  return {
    uid,
    email: data.email || '',
    name: data.name || 'Admin',
    role: data.role || 'admin',
    createdAt: data.createdAt,
  };
};

// ─── Auth state listener ──────────────────────────────────

export const onAdminAuthChange = (
  callback: (admin: AdminProfile | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (!user) {
      callback(null);
      return;
    }
    const profile = await checkAdminAccess(user.uid);
    callback(profile);
  });
};

// ─── Admin Log ────────────────────────────────────────────

export const logAdminAction = async (
  adminUid: string,
  action: string,
  details: string,
  targetUid?: string
): Promise<void> => {
  await addDoc(collection(db, 'adminLogs'), {
    adminUid,
    action,
    targetUid: targetUid || null,
    details,
    createdAt: serverTimestamp(),
  });
};
