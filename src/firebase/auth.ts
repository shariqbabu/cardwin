import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from './config';
import { generateReferralCode } from '../utils/helpers';

export const signUp = async (
  email: string,
  password: string,
  name: string,
  phone: string,
  referralCode?: string
) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  await updateProfile(user, { displayName: name });

  // Generate referral code for new user
  const userReferralCode = generateReferralCode();

  // Resolve referredBy UID from referralCode (if provided)
  let referredBy: string | null = null;
  if (referralCode) {
    const token = await user.getIdToken();
    try {
      const res = await fetch('/api/auth/resolve-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ referralCode }),
      });
      if (res.ok) {
        const data = await res.json();
        referredBy = data.uid ?? null;
      }
    } catch (_e) {
      // ignore referral resolution errors
    }
  }

  // Register user via server API (Admin SDK write)
  const token = await user.getIdToken();
  await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uid: user.uid, name, email, phone, referralCode }),
  });

  // Use transaction to create user + wallet atomically
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', user.uid);
    const walletRef = doc(db, 'wallets', user.uid);

    tx.set(userRef, {
      uid: user.uid,
      name,
      email,
      phone,
      photoURL: '',
      referralCode: userReferralCode,
      referredBy: referredBy || null,
      isAdmin: false,
      isOnline: true,
      isBanned: false,
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(walletRef, {
      uid: user.uid,
      winningBalance: 0,
      depositBalance: 0,
      bonusBalance: referredBy ? 50 : 0, // Signup bonus if referred
      referralBalance: 0,
      updatedAt: serverTimestamp(),
    });
  });

  // Handle referral reward
  if (referredBy) {
    try {
      await runTransaction(db, async (tx) => {
        const referrerWalletRef = doc(db, 'wallets', referredBy!);
        const referrerWalletSnap = await tx.get(referrerWalletRef);
        if (referrerWalletSnap.exists()) {
          const w = referrerWalletSnap.data();
          const newReferralBalance = (w.referralBalance || 0) + 50;
          const newTotalBalance = (w.totalBalance || 0) + 50;
          tx.update(referrerWalletRef, {
            referralBalance: newReferralBalance,
            totalBalance: newTotalBalance,
            updatedAt: serverTimestamp(),
          });
        }

        // Create referral record
        const referralRef = doc(collection(db, 'referrals'));
        tx.set(referralRef, {
          referrerId: referredBy,
          referredId: user.uid,
          referredName: name,
          referredEmail: email,
          bonusAmount: 50,
          createdAt: serverTimestamp(),
        });
      });
    } catch (_e) {
      // ignore referral reward errors
    }
  }

  return user;
};

export const signIn = async (email: string, password: string) => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();

  // Update online status via server
  fetch('/api/auth/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isOnline: true }),
  }).catch(() => {});

  return credential.user;
};

export const logOut = async () => {
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch('/api/auth/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isOnline: false }),
      });
    } catch (_e) {}
  }
  await signOut(auth);
};

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

export const getUserDoc = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
};

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
