import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Loader2, Trophy, TrendingDown, TrendingUp, Gift, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeNotifications, markNotificationRead } from '../firebase/games';
import { formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';

const getNotifIcon = (type: string) => {
  switch (type) {
    case 'GAME_WIN': return { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    case 'GAME_LOSS': return { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' };
    case 'DEPOSIT_APPROVED': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'DEPOSIT_REJECTED': return { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' };
    case 'WITHDRAWAL_APPROVED': return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'WITHDRAWAL_REJECTED': return { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' };
    case 'REFERRAL_BONUS': return { icon: Gift, color: 'text-pink-400', bg: 'bg-pink-500/10' };
    default: return { icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/10' };
  }
};

export const Notifications: React.FC = () => {
  const { firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsub = subscribeNotifications(firebaseUser.uid, (notifs) => {
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsub();
  }, [firebaseUser]);

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => markNotificationRead(n.id)));
    toast.success('All marked as read');
  };

  const markRead = async (id: string) => {
    await markNotificationRead(id);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Notifications</h2>
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </div>
          {notifications.some(n => !n.read) && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-sm text-yellow-400 hover:text-yellow-300"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {notifications.map((notif, i) => {
                const { icon: Icon, color, bg } = getNotifIcon(notif.type);
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => !notif.read && markRead(notif.id)}
                    className={`relative bg-white/5 border rounded-xl p-4 cursor-pointer transition-all ${
                      notif.read
                        ? 'border-white/10 opacity-70'
                        : 'border-yellow-500/20 hover:border-yellow-500/40'
                    }`}
                  >
                    {!notif.read && (
                      <div className="absolute top-4 right-4 w-2 h-2 bg-yellow-400 rounded-full" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{notif.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{notif.message}</p>
                        <p className="text-xs text-gray-600 mt-1">{formatDate(notif.createdAt)}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
};
