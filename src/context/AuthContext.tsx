import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { onAuthChange } from '../firebase/auth';
import { User, Wallet } from '../types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  wallet: Wallet | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  wallet: null,
  loading: true,
  isAdmin: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs to store unsubscribe functions
  const unsubUserRef = useRef<(() => void) | null>(null);
  const unsubWalletRef = useRef<(() => void) | null>(null);

  // Cleanup function — snapshots band karo
  const cleanupSnapshots = () => {
    if (unsubUserRef.current) {
      unsubUserRef.current();
      unsubUserRef.current = null;
    }
    if (unsubWalletRef.current) {
      unsubWalletRef.current();
      unsubWalletRef.current = null;
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthChange((fbUser) => {

      // Pehle purane snapshots band karo
      cleanupSnapshots();

      if (!fbUser) {
        // User logged out / deleted
        setFirebaseUser(null);
        setUser(null);
        setWallet(null);
        setLoading(false);
        return;
      }

      // User logged in — state set karo
      setFirebaseUser(fbUser);

      // Users snapshot
      unsubUserRef.current = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          if (snap.exists()) {
            setUser({ id: snap.id, ...snap.data() } as any);
          } else {
            setUser(null);
          }
          setLoading(false);
        },
        (error) => {
          // Permission denied quietly handle karo
          console.warn('User snapshot error:', error.code);
          setLoading(false);
        }
      );

      // Wallet snapshot
      unsubWalletRef.current = onSnapshot(
        doc(db, 'wallets', fbUser.uid),
        (snap) => {
          if (snap.exists()) {
            setWallet(snap.data() as Wallet);
          } else {
            setWallet(null);
          }
        },
        (error) => {
          // Permission denied quietly handle karo
          console.warn('Wallet snapshot error:', error.code);
        }
      );
    });

    // Component unmount pe sab cleanup
    return () => {
      unsubAuth();
      cleanupSnapshots();
    };
  }, []); // Sirf ek baar run ho

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        wallet,
        loading,
        isAdmin: user?.isAdmin || false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
