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

  const userReferralCode = generateReferralCode(user.uid);
  let referredBy: string | undefined;

  // Check referral code
  if (referralCode) {
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), where('referralCode', '==', referralCode));
      const snap = await getDocs(q);
      if (!snap.empty && snap.docs[0].id !== user.uid) {
        referredBy = snap.docs[0].id;
      }
    } catch (_e) {
      // ignore referral errors
    }
  }

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
        const { collection } = await import('firebase/firestore');
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
  // Update online status
  try {
    await setDoc(
      doc(db, 'users', credential.user.uid),
      { isOnline: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (_e) {
    // ignore
  }
  return credential.user;
};

export const logOut = async () => {
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        { isOnline: false, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (_e) {
      // ignore
    }
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
