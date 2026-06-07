import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, QrCode, CheckCircle, Loader2, AlertTriangle, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createDeposit } from '../firebase/wallet';
import toast from 'react-hot-toast';

const schema = z.object({
  amount: z.number().min(100, 'Minimum deposit is ₹100').max(50000, 'Maximum deposit is ₹50,000'),
  utrNumber: z.string().min(6, 'Enter valid UTR/Transaction ID'),
});

type FormData = z.infer<typeof schema>;

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default';
const ADMIN_UPI = import.meta.env.VITE_ADMIN_UPI_ID || 'admin@royalbet';
const ADMIN_QR = import.meta.env.VITE_ADMIN_QR_IMAGE;

const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

export const AddMoney: React.FC = () => {
  const { firebaseUser, user } = useAuth();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const amount = watch('amount');

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', 'payment-screenshots');

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (data.secure_url) {
        setScreenshot(data.secure_url);
        toast.success('Screenshot uploaded!');
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      toast.error('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!screenshot) { toast.error('Please upload payment screenshot'); return; }
    if (!firebaseUser) return;

    setSubmitting(true);
    try {
      await createDeposit(firebaseUser.uid, data.amount, screenshot, data.utrNumber);
      setSubmitted(true);
      toast.success('Deposit request submitted! Admin will approve shortly.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const copyUpi = () => {
    navigator.clipboard.writeText(ADMIN_UPI);
    toast.success('UPI ID copied!');
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-gray-400 mb-6">Your deposit of ₹{amount} is under review. Admin will approve within 30 minutes.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold px-6 py-3 rounded-xl"
          >
            Add Another
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Step 1: Amount */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-4">
            <span className="bg-yellow-500 text-black rounded-full w-6 h-6 inline-flex items-center justify-center text-sm mr-2">1</span>
            Select Amount
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {quickAmounts.map(amt => (
              <motion.button
                key={amt}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => setValue('amount', amt)}
                className={`py-2 rounded-xl text-sm font-semibold transition-all border ${
                  amount === amt
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                }`}
              >
                ₹{amt}
              </motion.button>
            ))}
          </div>
          <input
            {...register('amount', { valueAsNumber: true })}
            type="number"
            placeholder="Enter custom amount"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-all"
          />
          {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
        </div>

        {/* Step 2: Pay */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-4">
            <span className="bg-yellow-500 text-black rounded-full w-6 h-6 inline-flex items-center justify-center text-sm mr-2">2</span>
            Pay via UPI
          </h3>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {ADMIN_QR ? (
              <img
                src={ADMIN_QR}
                alt="QR Code"
                className="w-36 h-36 rounded-xl border border-white/20 bg-white object-contain"
              />
            ) : (
              <div className="w-36 h-36 rounded-xl border border-white/20 bg-white/10 flex flex-col items-center justify-center text-gray-400">
                <QrCode className="w-10 h-10 mb-2" />
                <span className="text-xs">QR Code</span>
              </div>
            )}

            <div className="flex-1">
              <p className="text-sm text-gray-400 mb-2">Pay to UPI ID:</p>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-white font-mono text-sm flex-1">{ADMIN_UPI}</span>
                <button onClick={copyUpi} className="text-yellow-400 hover:text-yellow-300">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {amount && (
                <div className="mt-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2">
                  <p className="text-sm text-yellow-400">Amount: <strong>₹{amount}</strong></p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-yellow-500/80">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs">Pay exact amount to UPI. Wrong amount may cause delays.</p>
          </div>
        </div>

        {/* Step 3: Upload Screenshot */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-4">
            <span className="bg-yellow-500 text-black rounded-full w-6 h-6 inline-flex items-center justify-center text-sm mr-2">3</span>
            Upload Screenshot
          </h3>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />

          {screenshot ? (
            <div className="relative">
              <img
                src={screenshot}
                alt="Payment screenshot"
                className="w-full rounded-xl max-h-48 object-cover"
              />
              <button
                onClick={() => setScreenshot(null)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ) : (
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-yellow-500/50 hover:bg-white/5 transition-all"
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mx-auto mb-2" />
              ) : (
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              )}
              <p className="text-sm text-gray-400">
                {uploading ? 'Uploading...' : 'Click to upload payment screenshot'}
              </p>
              <p className="text-xs text-gray-600 mt-1">PNG, JPG up to 10MB</p>
            </motion.div>
          )}
        </div>

        {/* Step 4: UTR */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-4">
            <span className="bg-yellow-500 text-black rounded-full w-6 h-6 inline-flex items-center justify-center text-sm mr-2">4</span>
            Enter UTR / Transaction ID
          </h3>
          <input
            {...register('utrNumber')}
            type="text"
            placeholder="e.g., 423578965412"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-all"
          />
          {errors.utrNumber && <p className="text-red-400 text-xs mt-1">{errors.utrNumber.message}</p>}
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit(onSubmit)}
          disabled={submitting || uploading}
          className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
          Submit Deposit Request
        </motion.button>
      </motion.div>
    </div>
  );
};
