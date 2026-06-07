import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, TrendingUp, TrendingDown, DollarSign, CheckCircle,
  XCircle, Clock, Eye, Loader2, Ban, UserCheck, Settings,
  BarChart3, AlertTriangle, Table, Plus, Edit, Trash2, 
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Copy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeDeposits, subscribeWithdrawals, approveDeposit, rejectDeposit,
  approveWithdrawal, rejectWithdrawal, subscribeAllUsers, banUser, adjustWallet, getAdminStats,
} from '../firebase/admin';
import {
  subscribePokerTables, createPokerTable,
} from '../firebase/games';
import { Deposit, Withdrawal, PokerTable } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge } from '../components/ui/Badge';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'deposits' | 'withdrawals' | 'users' | 'adjust' | 'tables';

export const AdminDashboard: React.FC = () => {
  const { firebaseUser } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<{ id: string; type: 'deposit' | 'withdrawal' } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const [adjustNote, setAdjustNote] = useState('');

  // ===== NEW: Tables State =====
  const [pokerTables, setPokerTables] = useState<PokerTable[]>([]);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [editingTable, setEditingTable] = useState<PokerTable | null>(null);
  
  // Create Table Form State
  const [tableName, setTableName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [minBuyIn, setMinBuyIn] = useState(100);
  const [maxBuyIn, setMaxBuyIn] = useState(1000);

  useEffect(() => {
    const unsub1 = subscribeDeposits(setDeposits);
    const unsub2 = subscribeWithdrawals(setWithdrawals);
    const unsub3 = subscribeAllUsers(setUsers);
    const unsub4 = subscribePokerTables(setPokerTables); // NEW: Subscribe to poker tables
    getAdminStats().then(setStats);

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  // ===== EXISTING HANDLERS (unchanged) =====
  const handleApproveDeposit = async (id: string) => {
    if (!firebaseUser) return;
    setProcessing(id);
    try {
      await approveDeposit(id, firebaseUser.uid);
      toast.success('Deposit approved!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectDeposit = async () => {
    if (!rejectTarget || !firebaseUser) return;
    setProcessing(rejectTarget.id);
    try {
      if (rejectTarget.type === 'deposit') {
        await rejectDeposit(rejectTarget.id, firebaseUser.uid, rejectNote || 'Rejected by admin');
      } else {
        await rejectWithdrawal(rejectTarget.id, firebaseUser.uid, rejectNote || 'Rejected by admin');
      }
      toast.success('Rejected successfully');
      setRejectTarget(null);
      setRejectNote('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveWithdrawal = async (id: string) => {
    if (!firebaseUser) return;
    setProcessing(id);
    try {
      await approveWithdrawal(id, firebaseUser.uid);
      toast.success('Withdrawal approved!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleBan = async (uid: string, banned: boolean) => {
    if (!firebaseUser) return;
    try {
      await banUser(uid, banned, firebaseUser.uid);
      toast.success(banned ? 'User banned' : 'User unbanned');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAdjust = async () => {
    if (!firebaseUser || !adjustTarget || !adjustAmount) return;
    try {
      await adjustWallet(adjustTarget.uid, parseFloat(adjustAmount), adjustType, firebaseUser.uid, adjustNote);
      toast.success('Wallet adjusted!');
      setAdjustTarget(null);
      setAdjustAmount('');
      setAdjustNote('');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ===== NEW: TABLE HANDLERS =====
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!tableName.trim()) { toast.error('Table name is required'); return; }
    if (smallBlind >= bigBlind) { toast.error('Big blind must be greater than small blind'); return; }
    if (minBuyIn > maxBuyIn) { toast.error('Max buy-in must be >= min buy-in'); return; }

    setCreatingTable(true);
    try {
      await createPokerTable(
        firebaseUser.uid,
        tableName.trim(),
        Number(smallBlind),
        Number(bigBlind),
        Number(minBuyIn),
        Number(maxBuyIn)
      );
      toast.success('Poker table created successfully!');
      resetTableForm();
      setShowCreateTable(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create table');
    } finally {
      setCreatingTable(false);
    }
  };

  const resetTableForm = () => {
    setTableName('');
    setSmallBlind(10);
    setBigBlind(20);
    setMinBuyIn(100);
    setMaxBuyIn(1000);
    setEditingTable(null);
  };

  const handleEditTable = (table: PokerTable) => {
    setEditingTable(table);
    setTableName(table.name);
    setSmallBlind(table.smallBlind);
    setBigBlind(table.bigBlind);
    setMinBuyIn(table.minBuyIn);
    setMaxBuyIn(table.maxBuyIn);
    setShowCreateTable(true);
  };

  const handleUpdateTable = async () => {
    if (!editingTable || !firebaseUser) return;
    // Note: You'd need an updatePokerTable function in games.ts
    // For now, we'll show a toast
    toast.info('Update functionality requires backend update function');
    setEditingTable(null);
    setShowCreateTable(false);
    resetTableForm();
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!window.confirm('Delete this table permanently?')) return;
    // Note: You'd need a deletePokerTable function in games.ts
    toast.info('Delete functionality requires backend delete function');
  };

  const copyTableId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('Table ID copied!');
  };

  const pendingDeposits = deposits.filter(d => d.status === 'PENDING');
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'PENDING');
  const activeTables = pokerTables.filter(t => t.status === 'playing').length;
  const waitingTables = pokerTables.filter(t => t.status === 'waiting').length;

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'deposits', label: 'Deposits', icon: TrendingUp, badge: pendingDeposits.length },
    { id: 'withdrawals', label: 'Withdrawals', icon: TrendingDown, badge: pendingWithdrawals.length },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'tables', label: 'Tables', icon: Table, badge: activeTables }, // NEW TAB
    { id: 'adjust', label: 'Adjust', icon: Settings },
  ];

  // ===== RENDER =====
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4"
      >
        <Shield className="w-8 h-8 text-red-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-xs text-gray-400">Full platform control & management</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all relative flex-shrink-0 border ${
              tab === t.id
                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {(t.badge || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Overview */}
        {tab === 'overview' && stats && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { label: 'Total Deposited', value: formatCurrency(stats.totalDeposited), icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
                { label: 'Total Withdrawn', value: formatCurrency(stats.totalWithdrawn), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
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
          </motion.div>
        )}

        {/* Deposits */}
        {tab === 'deposits' && (
          <motion.div key="deposits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-400">Pending: {pendingDeposits.length}</span>
            </div>
            {deposits.length === 0 ? (
              <p className="text-center text-gray-500 py-10">No deposits</p>
            ) : deposits.map(deposit => (
              <motion.div
                key={deposit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">{deposit.userName}</p>
                    <p className="text-xs text-gray-400">{deposit.userEmail}</p>
                    <p className="text-xs text-gray-500">{formatDate(deposit.createdAt)}</p>
                    {deposit.utrNumber && (
                      <p className="text-xs text-blue-400">UTR: {deposit.utrNumber}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-400">{formatCurrency(deposit.amount)}</p>
                    <Badge status={deposit.status} />
                  </div>
                </div>

                {deposit.screenshotUrl && (
                  <a href={deposit.screenshotUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline mb-3">
                    <Eye className="w-3 h-3" /> View Screenshot
                  </a>
                )}

                {deposit.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveDeposit(deposit.id!)}
                      disabled={processing === deposit.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 py-2 rounded-lg text-sm hover:bg-green-500/30 transition-all disabled:opacity-50"
                    >
                      {processing === deposit.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget({ id: deposit.id!, type: 'deposit' })}
                      className="flex-1 flex items-center justify-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 py-2 rounded-lg text-sm hover:bg-red-500/30 transition-all"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
                {deposit.adminNote && (
                  <p className="text-xs text-yellow-400 mt-2">Note: {deposit.adminNote}</p>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Withdrawals */}
        {tab === 'withdrawals' && (
          <motion.div key="withdrawals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {withdrawals.length === 0 ? (
              <p className="text-center text-gray-500 py-10">No withdrawals</p>
            ) : withdrawals.map(w => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">{w.userName}</p>
                    <p className="text-xs text-gray-400">{w.userEmail}</p>
                    <p className="text-xs text-blue-400">UPI: {w.upiId}</p>
                    <p className="text-xs text-gray-500">{formatDate(w.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-orange-400">-{formatCurrency(w.amount)}</p>
                    <Badge status={w.status} />
                  </div>
                </div>

                {w.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveWithdrawal(w.id!)}
                      disabled={processing === w.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 py-2 rounded-lg text-sm hover:bg-green-500/30 transition-all disabled:opacity-50"
                    >
                      {processing === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget({ id: w.id!, type: 'withdrawal' })}
                      className="flex-1 flex items-center justify-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 py-2 rounded-lg text-sm hover:bg-red-500/30 transition-all"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {users.map(u => (
              <div key={u.uid || u.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm">{u.name}</p>
                      {u.isAdmin && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Admin</span>}
                      {u.isBanned && <span className="text-xs bg-red-800/40 text-red-300 px-1.5 py-0.5 rounded">Banned</span>}
                    </div>
                    <p className="text-xs text-gray-400">{u.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-green-400' : 'bg-gray-500'}`} />
                      <span className="text-xs text-gray-500">{u.isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdjustTarget(u)}
                    className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all"
                    title="Adjust Wallet"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {!u.isAdmin && (
                    <button
                      onClick={() => handleBan(u.uid, !u.isBanned)}
                      className={`p-2 rounded-lg transition-all ${
                        u.isBanned
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                      title={u.isBanned ? 'Unban' : 'Ban'}
                    >
                      {u.isBanned ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ===== NEW: TABLES TAB ===== */}
        {tab === 'tables' && (
          <motion.div key="tables" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            
            {/* Header with Stats & Create Button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <Table className="w-6 h-6 text-purple-400" />
                <div>
                  <h3 className="font-bold text-white">Poker Tables Management</h3>
                  <p className="text-xs text-gray-400">Create & manage poker tables</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Quick Stats */}
                <div className="hidden sm:flex gap-4 text-xs">
                  <span className="text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Active: {activeTables}
                  </span>
                  <span className="text-yellow-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Waiting: {waitingTables}
                  </span>
                  <span className="text-gray-400">Total: {pokerTables.length}</span>
                </div>
                <button
                  onClick={() => { resetTableForm(); setShowCreateTable(true); }}
                  className="flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 text-purple-400 px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-500/30 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Create Table
                </button>
              </div>
            </div>

            {/* Tables List */}
            {pokerTables.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                <Table className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 mb-2">No poker tables created yet</p>
                <p className="text-xs text-gray-500 mb-4">Click "Create Table" to add your first table</p>
                <button
                  onClick={() => { resetTableForm(); setShowCreateTable(true); }}
                  className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 text-purple-400 px-4 py-2 rounded-xl text-sm hover:bg-purple-500/30"
                >
                  <Plus className="w-4 h-4" /> Create First Table
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {pokerTables.map(table => (
                  <motion.div
                    key={table.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 border border-white/10 rounded-xl p-4"
                  >
                    {/* Table Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                          <Table className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white">{table.name}</h4>
                            <Badge 
                              status={table.status === 'playing' ? 'COMPLETED' : table.status === 'waiting' ? 'PENDING' : 'FAILED'} 
                            />
                          </div>
                          <p className="text-xs text-gray-400 font-mono">{table.id.slice(0, 12)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyTableId(table.id)}
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                          title="Copy Table ID"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditTable(table)}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 transition-all"
                          title="Edit Table"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTable(table.id)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-all"
                          title="Delete Table"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Table Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Small Blind</p>
                        <p className="font-semibold text-white">{formatCurrency(table.smallBlind)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Big Blind</p>
                        <p className="font-semibold text-white">{formatCurrency(table.bigBlind)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Min Buy-in</p>
                        <p className="font-semibold text-white">{formatCurrency(table.minBuyIn)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Max Buy-in</p>
                        <p className="font-semibold text-white">{formatCurrency(table.maxBuyIn)}</p>
                      </div>
                    </div>

                    {/* Players & Game Info */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-1 text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        <span>Players: <span className="text-white font-medium">{table.players?.length || 0}/6</span></span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400">
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Phase: <span className="text-white font-medium capitalize">{table.phase}</span></span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Pot: <span className="text-yellow-400 font-medium">{formatCurrency(table.pot || 0)}</span></span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Hand: <span className="text-white font-medium">#{table.handNumber || 0}</span></span>
                      </div>
                      {table.createdBy && (
                        <div className="flex items-center gap-1 text-gray-400">
                          <Shield className="w-3.5 h-3.5" />
                          <span>Created by: <span className="text-white font-medium text-xs">{table.createdBy.slice(0, 8)}...</span></span>
                        </div>
                      )}
                    </div>

                    {/* Current Players List */}
                    {table.players && table.players.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-400 mb-2">Seated Players:</p>
                        <div className="flex flex-wrap gap-2">
                          {table.players.map((player, idx) => (
                            <span
                              key={player.uid}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                                player.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                player.status === 'allin' ? 'bg-yellow-500/20 text-yellow-400' :
                                player.status === 'folded' ? 'bg-gray-500/20 text-gray-400' :
                                'bg-blue-500/20 text-blue-400'
                              }`}
                            >
                              {player.isDealer && <span className="text-yellow-400" title="Dealer">D</span>}
                              {player.isSmallBlind && <span className="text-orange-400" title="Small Blind">SB</span>}
                              {player.isBigBlind && <span className="text-red-400" title="Big Blind">BB</span>}
                              {player.name}
                              <span className="text-gray-400">{formatCurrency(player.chips)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Community Cards Preview */}
                    {table.communityCards && table.communityCards.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-400 mb-2">Community Cards:</p>
                        <div className="flex gap-1">
                          {table.communityCards.map((card: any, idx: number) => (
                            <div
                              key={idx}
                              className="w-8 h-10 bg-white rounded border text-black flex items-center justify-center text-xs font-bold"
                            >
                              {card.value}{card.suit}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-3 flex gap-2">
                      {table.status === 'waiting' && table.players && table.players.length >= 2 && (
                        <button
                          className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 py-2 rounded-lg text-sm hover:bg-green-500/30 transition-all"
                        >
                          <BarChart3 className="w-4 h-4" /> Start Game
                        </button>
                      )}
                      {table.status === 'playing' && (
                        <button className="flex-1 flex items-center justify-center gap-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 py-2 rounded-lg text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" /> In Progress
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Adjust Wallet */}
        {tab === 'adjust' && (
          <motion.div key="adjust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" />
                Manual Wallet Adjustment
              </h3>
              <p className="text-sm text-gray-400 mb-4">Select a user from the Users tab to adjust their wallet.</p>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <p className="text-xs text-yellow-400">Click the ⚙️ icon next to a user in the Users tab to adjust their wallet.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== CREATE/EDIT TABLE MODAL ===== */}
      <AnimatePresence>
        {showCreateTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => { resetTableForm(); setShowCreateTable(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Table className="w-5 h-5 text-purple-400" />
                  {editingTable ? 'Edit Poker Table' : 'Create New Poker Table'}
                </h3>
                <button
                  onClick={() => { resetTableForm(); setShowCreateTable(false); }}
                  className="p-1 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={editingTable ? handleUpdateTable : handleCreateTable} className="space-y-4">
                {/* Table Name */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Table Name *</label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={e => setTableName(e.target.value)}
                    placeholder="e.g., High Rollers Table, Beginner's Table"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50"
                    required
                    maxLength={50}
                  />
                </div>

                {/* Blinds Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Small Blind (₹) *</label>
                    <input
                      type="number"
                      value={smallBlind}
                      onChange={e => setSmallBlind(Number(e.target.value) || 0)}
                      min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Big Blind (₹) *</label>
                    <input
                      type="number"
                      value={bigBlind}
                      onChange={e => setBigBlind(Number(e.target.value) || 0)}
                      min={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Buy-in Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Min Buy-in (₹) *</label>
                    <input
                      type="number"
                      value={minBuyIn}
                      onChange={e => setMinBuyIn(Number(e.target.value) || 0)}
                      min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Buy-in (₹) *</label>
                    <input
                      type="number"
                      value={maxBuyIn}
                      onChange={e => setMaxBuyIn(Number(e.target.value) || 0)}
                      min={1}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Validation Messages */}
                {(smallBlind >= bigBlind) && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Big blind must be greater than small blind
                  </p>
                )}
                {(minBuyIn > maxBuyIn) && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Max buy-in must be ≥ min buy-in
                  </p>
                )}

                {/* Quick Presets */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-xs text-gray-400 mb-2">Quick Presets:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'Micro', sb: 1, bb: 2, min: 20, max: 200 },
                      { name: 'Low', sb: 5, bb: 10, min: 50, max: 500 },
                      { name: 'Medium', sb: 10, bb: 20, min: 100, max: 1000 },
                      { name: 'High', sb: 50, bb: 100, min: 500, max: 5000 },
                      { name: 'VIP', sb: 100, bb: 200, min: 2000, max: 20000 },
                    ].map(preset => (
                      <button
                        type="button"
                        key={preset.name}
                        onClick={() => {
                          setSmallBlind(preset.sb);
                          setBigBlind(preset.bb);
                          setMinBuyIn(preset.min);
                          setMaxBuyIn(preset.max);
                        }}
                        className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/20 transition-all"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { resetTableForm(); setShowCreateTable(false); }}
                    className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/20 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTable || (smallBlind >= bigBlind) || (minBuyIn > maxBuyIn) || !tableName.trim()}
                    className="flex-1 py-2.5 bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded-xl font-medium hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creatingTable ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {editingTable ? 'Update Table' : 'Create Table'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Modal (Existing) */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-sm"
            >
              <h3 className="font-bold text-white mb-3">Reject {rejectTarget.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</h3>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Reason for rejection..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => setRejectTarget(null)} className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/20">Cancel</button>
                <button onClick={handleRejectDeposit} className="flex-1 py-2.5 bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/40">Reject</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Adjust Wallet Modal (Existing) */}
      <AnimatePresence>
        {adjustTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[#1a0f2e] border border-white/20 rounded-2xl p-6 w-full max-w-sm"
            >
              <h3 className="font-bold text-white mb-1">Adjust Wallet</h3>
              <p className="text-sm text-gray-400 mb-4">{adjustTarget.name} ({adjustTarget.email})</p>

              <div className="flex gap-2 mb-3">
                <button onClick={() => setAdjustType('add')} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${adjustType === 'add' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>+ Add</button>
                <button onClick={() => setAdjustType('deduct')} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${adjustType === 'deduct' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>- Deduct</button>
              </div>
              <input
                type="number"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none mb-3"
              />
              <input
                type="text"
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="Reason / Note"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 text-sm focus:outline-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => setAdjustTarget(null)} className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl">Cancel</button>
                <button onClick={handleAdjust} className="flex-1 py-2.5 bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl">Apply</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
