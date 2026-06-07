import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { User, Phone, Camera, Save, Loader2, Shield, LogOut } from 'lucide-react';
import { formatDate } from '../utils/helpers';
import { logOut } from '../firebase/auth';
import toast from 'react-hot-toast';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

const schema = z.object({
  name: z.string().min(2, 'Name too short'),
  phone: z.string().min(10, 'Invalid phone'),
});

type FormData = z.infer<typeof schema>;

export const Profile: React.FC = () => {
  const { user, firebaseUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { name: user?.name || '', phone: user?.phone || '' },
  });

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', 'avatars');

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (data.secure_url && firebaseUser) {
        await updateProfile(firebaseUser, { photoURL: data.secure_url });
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          photoURL: data.secure_url,
          updatedAt: serverTimestamp(),
        });
        toast.success('Avatar updated!');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await updateProfile(firebaseUser, { displayName: data.name });
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        name: data.name,
        phone: data.phone,
        updatedAt: serverTimestamp(),
      });
      toast.success('Profile updated!');
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    toast.success('Logged out');
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Avatar */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <div className="relative inline-block mb-4">
            {user?.photoURL || firebaseUser?.photoURL ? (
              <img
                src={user?.photoURL || firebaseUser?.photoURL || ''}
                alt="avatar"
                className="w-24 h-24 rounded-2xl object-cover border-2 border-yellow-500/30"
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center text-4xl font-bold text-white">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-2 -right-2 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-black hover:bg-yellow-400 transition-colors shadow-lg"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
            />
          </div>
          <h2 className="text-xl font-bold text-white">{user?.name}</h2>
          <p className="text-gray-400 text-sm">{user?.email}</p>
          {user?.isAdmin && (
            <span className="mt-2 inline-flex items-center gap-1 bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full border border-red-500/30">
              <Shield className="w-3 h-3" />
              Admin
            </span>
          )}
          <div className="mt-3 text-xs text-gray-500">
            Member since {formatDate(user?.createdAt)}
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-yellow-400" />
            Edit Profile
          </h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  {...register('name')}
                  type="text"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-all"
                />
              </div>
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  {...register('phone')}
                  type="tel"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-all"
                />
              </div>
              {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Email</label>
              <input
                value={user?.email || ''}
                disabled
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </motion.button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <h3 className="font-bold text-red-400 mb-3">Account Actions</h3>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 py-3 rounded-xl transition-all font-medium"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </motion.div>
    </div>
  );
};
