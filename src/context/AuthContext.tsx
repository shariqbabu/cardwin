// src/context/AuthContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

import { User as FirebaseUser } from 'firebase/auth';
import { User, Wallet } from '../types';
import { onAuthChange, getProfile } from '../firebase/auth';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  wallet: Wallet | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  wallet: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] =
    useState<FirebaseUser | null>(null);

  const [user, setUser] =
    useState<User | null>(null);

  const [wallet, setWallet] =
    useState<Wallet | null>(null);

  const [loading, setLoading] =
    useState(true);

  const loadProfile = async () => {
    try {
      const data = await getProfile();

      if (!data) {
        setUser(null);
        setWallet(null);
        return;
      }

      setUser(data.user ?? null);
      setWallet(data.wallet ?? null);
    } catch (error) {
      console.error('Profile load error:', error);

      setUser(null);
      setWallet(null);
    }
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  useEffect(() => {
    const unsubscribe = onAuthChange(
      async (fbUser) => {
        setLoading(true);

        if (!fbUser) {
          setFirebaseUser(null);
          setUser(null);
          setWallet(null);
          setLoading(false);
          return;
        }

        setFirebaseUser(fbUser);

        try {
          await loadProfile();
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        wallet,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
