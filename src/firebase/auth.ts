
// src/firebase/auth.ts

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';

import { auth } from './config';

export const signUp = async (
  email: string,
  password: string,
  name: string,
  phone: string,
  referralCode?: string
) => {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = credential.user;

  await updateProfile(user, {
    displayName: name,
  });

  const token = await user.getIdToken(true);

  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      phone,
      referralCode,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Registration failed');
  }

  return user;
};

export const signIn = async (
  email: string,
  password: string
) => {
  const credential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  try {
    const token = await credential.user.getIdToken(true);

    await fetch('/api/auth/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        isOnline: true,
      }),
    });
  } catch (error) {
    console.error('Status update failed:', error);
  }

  return credential.user;
};

export const logOut = async () => {
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);

      await fetch('/api/auth/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isOnline: false,
        }),
      });
    }
  } catch (error) {
    console.error('Logout status update failed:', error);
  }

  await signOut(auth);
};

export const resetPassword = async (
  email: string
) => {
  await sendPasswordResetEmail(auth, email);
};

export const getProfile = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return null;
  }

  const token = await currentUser.getIdToken(true);

  const response = await fetch('/api/auth/getProfile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Failed to fetch profile'
    );
  }

  return data;
};

export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};
