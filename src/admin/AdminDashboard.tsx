// src/admin/AdminDashboard.tsx
// ─────────────────────────────────────────────────────────
// Admin Dashboard — Poker Tables + Nine Card Tables + Wallet
// Sirf admins collection ke logged-in admin dekh sakte hain
// ─────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, TrendingUp, TrendingDown, DollarSign,
  CheckCircle, XCircle, Clock, Eye, Loader2, Ban, UserCheck,
  Settings, BarChart3, AlertTriangle, Table, Plus, Trash2,
  Copy, LogOut, Layers, ToggleLeft, ToggleRight, Lock, Unlock,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminLogout } from '../firebase/adminAuth';
import {
  subscribeDeposits, subscribeWithdrawals, approveDeposit,
  rejectDeposit, approveWithdrawal, rejectWithdrawal,
  subscribeAllUsers, banUser, adjustWallet, getAdminStats,
} from '../firebase/admin';
import { subscribePokerTables, createPokerTable } from '../firebase/games';
import {
  adminCreateTable as createNineCardTable,
  adminToggleTable, adminToggleLock, subscribeLobby,
} from '../firebase/NineCard';
import { Deposit, Withdrawal, PokerTable } from '../types';
import type { NineCardTable } from '../firebase/NineCard';
import { formatCurrency, formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';

// ─── Badge Component ─────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    APPROVED: 'bg-green-500/20 text-green-400 border-green-500/30',
    REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
    waiting: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    playing: 'bg-green-500/20 text-green-400 border-green-500/30',
    finished: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    disabled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] || 'bg-white/10 text-gray-400 border-white/20'}`}>
      {status}
    </span>
  );
};

// ─── Tab Type ─────────────────────────────────────────────
type Tab = 'overview' | 'deposits' | 'withdrawals' | 'users' | 'poker' | 'ninecard' | 'wallet';

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export const AdminDashboard: React.FC = () => {
  const { admin } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('overview');

  // Data states
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [pokerTables, setPokerTables] = useState<PokerTable[]>([]);
  const [nineCardTables, setNineCardTables] = useState<NineCardTable[]>([]);

  // Processing state
  const [processing, setProcessing] = useState<string | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<{ id: string; type: 'deposit' | 'withdrawal' } | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Wallet adjust modal
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const [adjustNote, setAdjustNote] = useState('');

  // Poker table create modal
  const [showPokerModal, setShowPokerModal] = useState(false);
  const [creatingPoker, setCreatingPoker] = useState(false);
  const [pokerName, setPokerName] = useState('');
  const [pokerSB, setPokerSB] = useState(10);
  const [pokerBB, setPokerBB] = useState(20);
  const [pokerMin, setPokerMin] = useState(100);
  const [pokerMax, setPokerMax] = useState(1000);

  // Nine Card table create modal
  const [showNineModal, setShowNineModal] = useState(false);
  const [creatingNine, setCreatingNine] = useState(false);
  const [nineName, setNineName] = useState('');
  const [nineBoot, setNineBoot] = useState(10);
  const [nineMax, setNineMax] = useState<2 | 3 | 4>(2);

  // ─── Subscriptions ──────────────────────────────────────
  useEffect(() => {
    const u1 = subscribeDeposits(setDeposits);
    const u2 = subscribeWithdrawals(setWithdrawals);
    const u3 = subscribeAllUsers(setUsers);
    const u4 = subscribePokerTables(setPokerTables);
    const u5 = subscribeLobby(setNineCardTables);
    getAdminStats().then(setStats);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  const pendingDeposits = deposits.filter(d => d.status === 'PENDING');
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'PENDING');

  // ─── Handlers ───────────────────────────────────────────

  const handleApproveDeposit = async (id: string) => {
    if (!admin) return;
    setProcessing(id);
    try {
      await approveDeposit(id, admin.uid);
      toast.success('Deposit approved!');
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const handleReject = async () => {
    if (!rejectTarget || !admin) return;
    setProcessing(rejectTarget.id);
    try {
      if (rejectTarget.type === 'deposit') {
        await rejectDeposit(rejectTarget.id, admin.uid, rejectNote || 'Rejected by admin');
      } else {
        await rejectWithdrawal(rejectTarget.id, admin.uid, rejectNote || 'Rejected by admin');
      }
      toast.success('Rejected');
      setRejectTarget(null);
      setRejectNote('');
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const handleApproveWithdrawal = async (id: string) => {
    if (!admin) return;
    setProcessing(id);
    try {
      await approveWithdrawal(id, admin.uid);
      toast.success('Withdrawal approved!');
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const handleBan = async (uid: string, banned: boolean) => {
    if (!admin) return;
    try {
      await banUser(uid, banned, admin.uid);
      toast.success(banned ? 'User banned' : 'User unbanned');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAdjust = async () => {
    if (!admin || !adjustTarget || !adjustAmount) return;
    try {
      await adjustWallet(
        adjustTarget.uid || adjustTarget.id,
        parseFloat(adjustAmount),
        adjustType,
        admin.uid,
        adjustNote || 'Manual adjustment'
      );
      toast.success('Wallet updated!');
      setAdjustTarget(null);
      setAdjustAmount('');
      setAdjustNote('');
    } catch (e: any) { toast.error(e.message); }
  };

  // ─── Poker Table Create ─────────────────────────────────
  const handleCreatePoker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin || !pokerName.trim()) return;
    if (pokerSB >= pokerBB) { toast.error('Big blind > small blind hona chahiye'); return; }
    if (pokerMin > pokerMax) { toast.error('Max buy-in >= min buy-in hona chahiye'); return; }
    setCreatingPoker(true);
    try {
      await createPokerTable(admin.uid, pokerName.trim(), pokerSB, pokerBB, pokerMin, pokerMax);
      toast.success('Poker table created!');
      setShowPokerModal(false);
      setPokerName(''); setPokerSB(10); setPokerBB(20); setPokerMin(100); setPokerMax(1000);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingPoker(false); }
  };

  // ─── Nine Card Table Create ─────────────────────────────
  const handleCreateNineCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin || !nineName.trim()) return;
    if (nineBoot < 1) { toast.error('Boot amount valid hona chahiye'); return; }
    setCreatingNine(true);
    try {
      await createNineCardTable(admin.uid, nineName.trim(), nineBoot, nineMax);
      toast.success('Nine Card table created!');
      setShowNineModal(false);
      setNineName(''); setNineBoot(10); setNineMax(2);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingNine(false); }
  };

  const handleToggleNineCard = async (tableId: string, currentStatus: string) => {
    try {
      const disable = currentStatus !== 'disabled';
      await adminToggleTable(tableId, disable);
      toast.success(disable ? 'Table disabled' : 'Table enabled');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleLock = async (tableId: string, locked: boolean) => {
    try {
      await adminToggleLock(tableId, !locked);
      toast.success(!locked ? 'Table locked' : 'Table unlocked');
    } catch (e: any) { toast.error(e.message); }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('ID copied!');
  };

  // ─── Tabs Config ─────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'deposits', label: 'Deposits', icon: TrendingUp, badge: pendingDeposits.length },
    { id: 'withdrawals', label: 'Withdrawals', icon: TrendingDown, badge: pendingWithdrawals.length },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'poker', label: 'Poker', icon: Table },
    { id: 'ninecard', label: '9 Card', icon: Layers },
    { id: 'wallet', label: 'Wallet', icon: Settings },
  ];

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0614]">
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-red-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Admin Dashboard</h2>
              <p className="text-xs text-gray-400">{admin?.name} · {admin?.role}</p>
            </div>
          </div>
          <button
            onClick={adminLogout}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl text-xs transition-all"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 border ${
                tab === t.id
                  ? 'bg-red-500/20 border-red-500/30 text-red-400'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {(t.badge || 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ══════════════════════════════════════════
              OVERVIEW TAB
          ══════════════════════════════════════════ */}
          {tab === 'overview' && stats && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Deposited', value: formatCurrency(stats.totalDeposited), icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
                  { label: 'Withdrawn', value: formatCurrency(stats.totalWithdrawn), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
                  { label: 'Revenue', value: formatCurrency(stats.revenue), icon: DollarSign, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                  { label: 'Pending Deposits', value: stats.pendingDeposits, icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                  { label: 'Pending Withdrawals', value: stats.pendingWithdrawals, icon: AlertTriangle, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`${bg} border border-white/10 rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Quick stats for games */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-500/10 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Table className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-gray-400">Poker Tables</span>
                  </div>
                  <p className="text-xl font-bold text-purple-400">{pokerTables.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{pokerTables.filter(t => t.status === 'playing').length} active</p>
                </div>
                <div className="bg-cyan-500/10 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-gray-400">9 Card Tables</span>
                  </div>
                  <p className="text-xl font-bold text-cyan-400">{nineCardTables.filter(t => t.status !== 'disabled').length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{nineCardTables.filter(t => t.status === 'playing').length} active</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              DEPOSITS TAB
          ══════════════════════════════════════════ */}
          {tab === 'deposits' && (
            <motion.div key="deposits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-xs text-gray-400">Pending: {pendingDeposits.length} · Total shown: {deposits.length}</p>
              {deposits.length === 0 && <p className="text-center text-gray-500 py-10">No deposits</p>}
              {deposits.map(deposit => (
                <div key={deposit.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white text-sm">{deposit.userName}</p>
                      <p className="text-xs text-gray-400">{deposit.userEmail}</p>
                      <p className="text-xs text-gray-500">{formatDate(deposit.createdAt)}</p>
                      {deposit.utrNumber && <p className="text-xs text-blue-400">UTR: {deposit.utrNumber}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-400">{formatCurrency(deposit.amount)}</p>
                      <StatusBadge status={deposit.status} />
                    </div>
                  </div>
                  {deposit.screenshotUrl && (
                    <a href={deposit.screenshotUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:underline mb-3">
                      <Eye className="w-3 h-3" /> Screenshot dekho
                    </a>
                  )}
                  {deposit.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveDeposit(deposit.id!)} disabled={processing === deposit.id}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 py-2 rounded-lg text-xs hover:bg-green-500/30 transition-all disabled:opacity-50">
                        {processing === deposit.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button onClick={() => setRejectTarget({ id: deposit.id!, type: 'deposit' })}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 py-2 rounded-lg text-xs hover:bg-red-500/30 transition-all">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                  {deposit.adminNote && <p className="text-xs text-yellow-400 mt-2">Note: {deposit.adminNote}</p>}
                </div>
              ))}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              WITHDRAWALS TAB
          ══════════════════════════════════════════ */}
          {tab === 'withdrawals' && (
            <motion.div key="withdrawals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {withdrawals.length === 0 && <p className="text-center text-gray-500 py-10">No withdrawals</p>}
              {withdrawals.map(w => (
                <div key={w.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white text-sm">{w.userName}</p>
                      <p className="text-xs text-gray-400">{w.userEmail}</p>
                      <p className="text-xs text-blue-400">UPI: {w.upiId}</p>
                      <p className="text-xs text-gray-500">{formatDate(w.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-400">-{formatCurrency(w.amount)}</p>
                      <StatusBadge status={w.status} />
                    </div>
                  </div>
                  {w.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveWithdrawal(w.id!)} disabled={processing === w.id}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 py-2 rounded-lg text-xs hover:bg-green-500/30 transition-all disabled:opacity-50">
                        {processing === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button onClick={() => setRejectTarget({ id: w.id!, type: 'withdrawal' })}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 py-2 rounded-lg text-xs hover:bg-red-500/30 transition-all">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              USERS TAB
          ══════════════════════════════════════════ */}
          {tab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-xs text-gray-400">Total users: {users.length}</p>
              {users.map(u => (
                <div key={u.uid || u.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-white text-sm truncate">{u.name}</p>
                        {u.isAdmin && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Admin</span>}
                        {u.isBanned && <span className="text-[10px] bg-red-800/40 text-red-300 px-1.5 py-0.5 rounded">Banned</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-green-400' : 'bg-gray-500'}`} />
                        <span className="text-[10px] text-gray-500">{u.isOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setAdjustTarget(u)}
                      className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all" title="Wallet Adjust">
                      <DollarSign className="w-3.5 h-3.5" />
                    </button>
                    {!u.isAdmin && (
                      <button onClick={() => handleBan(u.uid, !u.isBanned)}
                        className={`p-2 rounded-lg transition-all ${u.isBanned ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                        title={u.isBanned ? 'Unban' : 'Ban'}>
                        {u.isBanned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              POKER TABLES TAB
          ══════════════════════════════════════════ */}
          {tab === 'poker' && (
            <motion.div key="poker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Table className="w-5 h-5 text-purple-400" /> Poker Tables
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {pokerTables.length} total · {pokerTables.filter(t => t.status === 'playing').length} active
                  </p>
                </div>
                <button onClick={() => setShowPokerModal(true)}
                  className="flex items-center gap-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 px-3 py-2 rounded-xl text-xs font-medium hover:bg-purple-500/30 transition-all">
                  <Plus className="w-3.5 h-3.5" /> New Table
                </button>
              </div>

              {pokerTables.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                  <Table className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Koi poker table nahi hai abhi</p>
                  <button onClick={() => setShowPokerModal(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 px-4 py-2 rounded-xl text-xs hover:bg-purple-500/30">
                    <Plus className="w-3.5 h-3.5" /> Pehli table banao
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {pokerTables.map(table => (
                    <div key={table.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-white">{table.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={table.status} />
                            <span className="text-xs text-gray-500 font-mono">{table.id.slice(0, 10)}...</span>
                          </div>
                        </div>
                        <button onClick={() => copyId(table.id)}
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all" title="Copy ID">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          { label: 'SB', value: formatCurrency(table.smallBlind) },
                          { label: 'BB', value: formatCurrency(table.bigBlind) },
                          { label: 'Min', value: formatCurrency(table.minBuyIn) },
                          { label: 'Max', value: formatCurrency(table.maxBuyIn) },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white/5 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-gray-400">{label}</p>
                            <p className="text-xs font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {table.players?.length || 0}/6
                        </span>
                        <span>Phase: <span className="text-white capitalize">{table.phase}</span></span>
                        <span>Pot: <span className="text-yellow-400">{formatCurrency(table.pot || 0)}</span></span>
                        <span>Hand #{table.handNumber || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              NINE CARD TABLES TAB
          ══════════════════════════════════════════ */}
          {tab === 'ninecard' && (
            <motion.div key="ninecard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-cyan-400" /> Nine Card Tables
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {nineCardTables.filter(t => t.status !== 'disabled').length} active · {nineCardTables.filter(t => t.status === 'playing').length} playing
                  </p>
                </div>
                <button onClick={() => setShowNineModal(true)}
                  className="flex items-center gap-1.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-3 py-2 rounded-xl text-xs font-medium hover:bg-cyan-500/30 transition-all">
                  <Plus className="w-3.5 h-3.5" /> New Table
                </button>
              </div>

              {nineCardTables.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                  <Layers className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Koi nine card table nahi hai abhi</p>
                  <button onClick={() => setShowNineModal(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-xl text-xs hover:bg-cyan-500/30">
                    <Plus className="w-3.5 h-3.5" /> Pehli table banao
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {nineCardTables.map(table => (
                    <div key={table.id} className={`bg-white/5 border rounded-xl p-4 transition-all ${table.status === 'disabled' ? 'border-red-500/20 opacity-60' : 'border-white/10'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-white">{table.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={table.status} />
                            {table.locked && (
                              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                                🔒 Locked
                              </span>
                            )}
                            <span className="text-xs text-gray-500 font-mono">{table.id.slice(0, 10)}...</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => copyId(table.id)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all" title="Copy ID">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {/* Lock/Unlock toggle */}
                          {table.status !== 'disabled' && (
                            <button onClick={() => handleToggleLock(table.id, table.locked)}
                              className={`p-1.5 rounded-lg transition-all ${table.locked ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                              title={table.locked ? 'Unlock table' : 'Lock table'}>
                              {table.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {/* Enable/Disable toggle */}
                          <button
                            onClick={() => handleToggleNineCard(table.id, table.status)}
                            className={`p-1.5 rounded-lg transition-all ${table.status === 'disabled' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                            title={table.status === 'disabled' ? 'Enable table' : 'Disable table'}>
                            {table.status === 'disabled' ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white/5 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-gray-400">Boot</p>
                          <p className="text-xs font-semibold text-white">{formatCurrency(table.bootAmount)}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-gray-400">Max Players</p>
                          <p className="text-xs font-semibold text-white">{table.maxPlayers}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-gray-400">Pot</p>
                          <p className="text-xs font-semibold text-yellow-400">{formatCurrency(table.pot || 0)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {Object.keys(table.players || {}).length}/{table.maxPlayers}
                        </span>
                        <span>Round: <span className="text-white">#{table.round || 0}</span></span>
                        {table.currentTurn && (
                          <span>Turn: <span className="text-cyan-400">{table.players?.[table.currentTurn]?.displayName || '...'}</span></span>
                        )}
                      </div>

                      {/* Players list */}
                      {Object.keys(table.players || {}).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="flex flex-wrap gap-1.5">
                            {Object.values(table.players).map((p: any) => (
                              <span key={p.uid}
                                className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                                  p.status === 'packed' ? 'bg-gray-500/20 text-gray-400' :
                                  p.isMyTurn ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-cyan-500/20 text-cyan-400'
                                }`}>
                                {p.isMyTurn ? '▶ ' : ''}{p.displayName}
                                {p.status === 'packed' ? ' (packed)' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              WALLET ADJUST TAB
          ══════════════════════════════════════════ */}
          {tab === 'wallet' && (
            <motion.div key="wallet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-400" /> Manual Wallet Adjustment
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  Kisi user ka wallet adjust karne ke liye, <span className="text-white">Users tab</span> mein jaayein aur
                  <span className="text-blue-400"> ₹ icon</span> press karein.
                </p>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-xs text-blue-400 leading-relaxed">
                    💡 Users tab → user ke samne ₹ button → amount enter karo → Add/Deduct choose karo → Apply dabao.
                    Yeh directly Firebase wallet update karta hai aur transaction log bhi banata hai.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════ */}

      {/* ── Poker Create Modal ── */}
      <AnimatePresence>
        {showPokerModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => setShowPokerModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Table className="w-5 h-5 text-purple-400" /> New Poker Table
                </h3>
                <button onClick={() => setShowPokerModal(false)} className="text-gray-400 hover:text-white">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePoker} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Table Name *</label>
                  <input type="text" value={pokerName} onChange={e => setPokerName(e.target.value)}
                    placeholder="e.g., High Rollers Table"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50" required maxLength={50} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Small Blind (₹)</label>
                    <input type="number" value={pokerSB} onChange={e => setPokerSB(Number(e.target.value))} min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Big Blind (₹)</label>
                    <input type="number" value={pokerBB} onChange={e => setPokerBB(Number(e.target.value))} min={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Min Buy-in (₹)</label>
                    <input type="number" value={pokerMin} onChange={e => setPokerMin(Number(e.target.value))} min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Buy-in (₹)</label>
                    <input type="number" value={pokerMax} onChange={e => setPokerMax(Number(e.target.value))} min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none" required />
                  </div>
                </div>

                {pokerSB >= pokerBB && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Big blind must be greater than small blind
                  </p>
                )}

                {/* Quick presets */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-xs text-gray-400 mb-2">Quick Presets:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'Micro', sb: 1, bb: 2, min: 20, max: 200 },
                      { name: 'Low', sb: 5, bb: 10, min: 50, max: 500 },
                      { name: 'Medium', sb: 10, bb: 20, min: 100, max: 1000 },
                      { name: 'High', sb: 50, bb: 100, min: 500, max: 5000 },
                    ].map(p => (
                      <button type="button" key={p.name}
                        onClick={() => { setPokerSB(p.sb); setPokerBB(p.bb); setPokerMin(p.min); setPokerMax(p.max); }}
                        className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/20 transition-all">
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowPokerModal(false)}
                    className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/15 text-sm font-medium">
                    Cancel
                  </button>
                  <button type="submit" disabled={creatingPoker || pokerSB >= pokerBB || pokerMin > pokerMax || !pokerName.trim()}
                    className="flex-1 py-2.5 bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-xl font-medium hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                    {creatingPoker ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Table
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nine Card Create Modal ── */}
      <AnimatePresence>
        {showNineModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => setShowNineModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" /> New 9 Card Table
                </h3>
                <button onClick={() => setShowNineModal(false)} className="text-gray-400 hover:text-white">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateNineCard} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Table Name *</label>
                  <input type="text" value={nineName} onChange={e => setNineName(e.target.value)}
                    placeholder="e.g., Beginner Table 1"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50" required maxLength={50} />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Boot Amount (₹) *</label>
                  <input type="number" value={nineBoot} onChange={e => setNineBoot(Number(e.target.value))} min={1}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-cyan-500/50" required />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2">Max Players *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([2, 3, 4] as const).map(n => (
                      <button type="button" key={n} onClick={() => setNineMax(n)}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          nineMax === n
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}>
                        {n} Players
                      </button>
                    ))}
                  </div>
                </div>

                {/* Boot presets */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-xs text-gray-400 mb-2">Boot Presets:</p>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 25, 50, 100, 500].map(amt => (
                      <button type="button" key={amt} onClick={() => setNineBoot(amt)}
                        className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg text-xs hover:bg-cyan-500/20 transition-all">
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowNineModal(false)}
                    className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/15 text-sm font-medium">
                    Cancel
                  </button>
                  <button type="submit" disabled={creatingNine || !nineName.trim() || nineBoot < 1}
                    className="flex-1 py-2.5 bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl font-medium hover:bg-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                    {creatingNine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Table
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reject Modal ── */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-sm">
              <h3 className="font-bold text-white mb-3">
                Reject {rejectTarget.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
              </h3>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                placeholder="Reason (optional)..." rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none resize-none mb-4" />
              <div className="flex gap-3">
                <button onClick={() => setRejectTarget(null)}
                  className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/15 text-sm">Cancel</button>
                <button onClick={handleReject} disabled={!!processing}
                  className="flex-1 py-2.5 bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/40 disabled:opacity-50">
                  {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reject'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Wallet Adjust Modal ── */}
      <AnimatePresence>
        {adjustTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-sm">
              <h3 className="font-bold text-white mb-1">Wallet Adjust</h3>
              <p className="text-sm text-gray-400 mb-4">{adjustTarget.name} · {adjustTarget.email}</p>

              <div className="flex gap-2 mb-3">
                <button onClick={() => setAdjustType('add')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${adjustType === 'add' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  + Add
                </button>
                <button onClick={() => setAdjustType('deduct')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${adjustType === 'deduct' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  − Deduct
                </button>
              </div>
              <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                placeholder="Amount (₹)" min={1}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none mb-3" />
              <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                placeholder="Reason / Note"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none mb-4" />
              <div className="flex gap-3">
                <button onClick={() => { setAdjustTarget(null); setAdjustAmount(''); setAdjustNote(''); }}
                  className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl text-sm">Cancel</button>
                <button onClick={handleAdjust} disabled={!adjustAmount || parseFloat(adjustAmount) <= 0}
                  className="flex-1 py-2.5 bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-xl text-sm hover:bg-blue-500/40 disabled:opacity-50">
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
