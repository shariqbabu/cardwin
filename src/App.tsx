import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, AdminRoute, PublicRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/Layout/MainLayout';
import { AdminApp } from './admin/AdminApp';

import DragonTigerPage from './pages/games/DragonTiger';
import AndarBaharPage from './pages/games/AndarBahar';
import PokerGamePage from './pages/games/PokerGame';
import PokerLobbyPage from './pages/games/PokerLobby';
import { ColorPrediction } from './pages/games/ColorPrediction';
import LudoLobby from './pages/games/LudoLobby';
import LudoGame from './pages/games/LudoGame';
import NineCardGame from './pages/games/NineCardGame';
import NineCardGameLobby from './pages/games/NineCardGameLobby';


// Pages
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Wallet } from './pages/Wallet';
import { AddMoney } from './pages/AddMoney';
import { Withdrawal } from './pages/Withdrawal';
import { WithdrawalHistory } from './pages/WithdrawalHistory';
import { TransactionHistory } from './pages/TransactionHistory';
import { Referral } from './pages/Referral';
import { Profile } from './pages/Profile';
import { Notifications } from './pages/Notifications';
import { AdminDashboard } from './pages/AdminDashboard';
import { Matchmaking } from './pages/Matchmaking';
import { GameRoom } from './pages/GameRoom';
import { DiceGame } from './pages/games/DiceGame';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Route>

            {/* Protected routes — WITH MainLayout (Header + Sidebar) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/add-money" element={<AddMoney />} />
                <Route path="/withdrawal" element={<Withdrawal />} />
                <Route path="/withdrawal-history" element={<WithdrawalHistory />} />
                <Route path="/transactions" element={<TransactionHistory />} />
                <Route path="/referral" element={<Referral />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/matchmaking" element={<Matchmaking />} />
                <Route path="/game-room/:roomId" element={<GameRoom />} />
                <Route path="/games/poker" element={<PokerLobbyPage />} />
                <Route path="/games/andar-bahar" element={<AndarBaharPage />} />
                <Route path="/games/dice" element={<DiceGame />} />
                <Route path="/games/color-prediction" element={<ColorPrediction />} />
                <Route path="/games/DragonTiger" element={<DragonTigerPage />} />
                <Route path="/games/ludo" element={<LudoLobby />} />
                <Route path="/games/ninecard" element={<NineCardGameLobby />} />
                <Route path="/admin" element={<AdminApp />} />
                <Route path="/admin/*" element={<AdminApp />} />
                

                
                {/* Admin routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                </Route>
              </Route>

              {/* Game pages — WITHOUT MainLayout (no Header/Sidebar) */}
              <Route path="/game-room/:roomId" element={<GameRoom />} />
              <Route path="/games/poker/:tableId" element={<PokerGamePage />} />
              <Route path="/games/ludo/:tableId" element={<LudoGame />} />
              <Route path="/games/nine-card/:tableId" element={<NineCardGame />} />
            </Route>

            {/* Default redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a0f2e',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#22c55e', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
