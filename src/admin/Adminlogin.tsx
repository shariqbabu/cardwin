import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Mail, Lock, Loader2, Eye, EyeOff,
  AlertCircle, KeyRound, RefreshCw, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import emailjs from '@emailjs/browser';
import { adminLogin } from '../firebase/adminAuth';

// ─── EmailJS config — .env se aata hai ───────────────────
const EJ_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string;
const EJ_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string;
const EJ_KEY      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string;

// OTP kitni der valid rahega (seconds)
const OTP_EXPIRY_SECONDS = 120;

// ─── OTP helpers ─────────────────────────────────────────
const generateOTP = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ─────────────────────────────────────────────────────────
type Step = 'credentials' | 'otp';

export const AdminLogin: React.FC = () => {
  // ── Step 1 state ──
  const [step, setStep]           = useState<Step>('credentials');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // ── Step 2 state ──
  const [otp, setOtp]             = useState(['', '', '', '', '', '']);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpExpiry, setOtpExpiry] = useState(0);       // timestamp ms
  const [timeLeft, setTimeLeft]   = useState(0);       // seconds
  const [verifying, setVerifying] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false); // sent tick
  const [adminName, setAdminName] = useState('');      // from adminLogin

  // OTP input refs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Timer countdown ──────────────────────────────────
  useEffect(() => {
    if (!otpExpiry) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((otpExpiry - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpExpiry]);

  // ── Step 1: Credentials verify → OTP bhejo ───────────
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email aur password dono bharein.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Firebase auth + admins collection check
      const profile = await adminLogin(email.trim(), password);
      setAdminName(profile.name);

      // OTP generate + send
      await sendOtp(email.trim(), profile.name);
      setStep('otp');
    } catch (err: any) {
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        setError('Email ya password galat hai.');
      } else if (err.message?.includes('not an admin')) {
        setError('Aapko admin access nahi hai.');
      } else {
        setError(err.message || 'Login mein problem aayi.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP generate + EmailJS se bhejo ──────────────────
  const sendOtp = async (toEmail: string, name: string) => {
    setOtpSending(true);
    setOtpSuccess(false);
    const code = generateOTP();
    setGeneratedOtp(code);
    const expiry = Date.now() + OTP_EXPIRY_SECONDS * 1000;
    setOtpExpiry(expiry);
    setTimeLeft(OTP_EXPIRY_SECONDS);
    setOtp(['', '', '', '', '', '']);

    try {
      await emailjs.send(
        EJ_SERVICE,
        EJ_TEMPLATE,
        {
          to_email:   toEmail,
          admin_name: name || 'Admin',
          otp:        code,
          expiry_min: Math.ceil(OTP_EXPIRY_SECONDS / 60),
        },
        EJ_KEY
      );
      setOtpSuccess(true);
      // Focus first OTP box
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      throw new Error('OTP email bhejne mein problem aayi. EmailJS config check karein.');
    } finally {
      setOtpSending(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────
  const handleResend = async () => {
    if (timeLeft > 0) return;
    setError('');
    setLoading(true);
    try {
      await sendOtp(email, adminName);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handlers ────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    // Sirf digits allow
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify jab 6th digit fill ho
    if (digit && index === 5) {
      const fullOtp = [...newOtp.slice(0, 5), digit].join('');
      if (fullOtp.length === 6) verifyOtp(fullOtp);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const full = otp.join('');
      if (full.length === 6) verifyOtp(full);
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      verifyOtp(pasted);
    }
  };

  // ── OTP verify ───────────────────────────────────────
  const verifyOtp = async (code: string) => {
    if (verifying) return;

    if (timeLeft === 0) {
      setError('OTP expire ho gaya. Resend karein.');
      return;
    }

    if (code !== generatedOtp) {
      setError('Galat OTP. Dobara try karein.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      return;
    }

    // OTP sahi — AdminAuthContext automatically update ho
    // adminLogin already call ho chuka hai Step 1 mein
    // Firebase user already logged in hai — bas context update hoga
    setVerifying(true);
    // Small delay for UX
    await new Promise(r => setTimeout(r, 600));
    setVerifying(false);
    // AdminAuthContext ka onAdminAuthChange listener
    // automatically fire karega aur admin set ho jaayega
    // AdminApp.tsx mein 'admin' truthy hoga → Dashboard render
  };

  const handleVerifyClick = () => {
    const full = otp.join('');
    if (full.length === 6) verifyOtp(full);
  };

  // ── Format timer ─────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0614] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* ── Step indicator ── */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`w-2 h-2 rounded-full transition-all ${step === 'credentials' ? 'bg-red-400 w-6' : 'bg-green-400'}`} />
            <div className={`w-2 h-2 rounded-full transition-all ${step === 'otp' ? 'bg-red-400 w-6' : 'bg-white/20'}`} />
          </div>

          <AnimatePresence mode="wait">

            {/* ════════════════════════════════════════
                STEP 1 — Credentials
            ════════════════════════════════════════ */}
            {step === 'credentials' && (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {/* Header */}
                <div className="text-center mb-7">
                  <div className="w-14 h-14 bg-red-500/15 border border-red-500/25 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-7 h-7 text-red-400" />
                  </div>
                  <h1 className="text-xl font-bold text-white">Admin Login</h1>
                  <p className="text-xs text-gray-500 mt-1">Step 1 of 2 — Credentials</p>
                </div>

                <form onSubmit={handleCredentials} className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 ml-1">Admin Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError(''); }}
                        placeholder="admin@example.com"
                        autoComplete="email"
                        disabled={loading}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-500/50 transition-all"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        disabled={loading}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-500/50 transition-all"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-xs text-red-400">{error}</p>
                    </motion.div>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-1">
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                    ) : (
                      <><Shield className="w-4 h-4" /> Continue</>
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-gray-600 mt-5">
                  OTP aapke registered email pe aayega
                </p>
              </motion.div>
            )}

            {/* ════════════════════════════════════════
                STEP 2 — OTP Verify
            ════════════════════════════════════════ */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
              >
                {/* Header */}
                <div className="text-center mb-7">
                  <div className="w-14 h-14 bg-blue-500/15 border border-blue-500/25 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-7 h-7 text-blue-400" />
                  </div>
                  <h1 className="text-xl font-bold text-white">Enter OTP</h1>
                  <p className="text-xs text-gray-500 mt-1">Step 2 of 2 — Verification</p>

                  {/* Email sent to */}
                  <div className="mt-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    {otpSending ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                        <span className="text-xs text-gray-400">OTP bheja ja raha hai...</span>
                      </div>
                    ) : otpSuccess ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs text-gray-300">
                          OTP bheja: <span className="text-white font-medium">{email}</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 6-digit OTP input */}
                <div className="flex justify-center gap-2 mb-5">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      disabled={verifying || otpSending}
                      className={`w-11 h-13 text-center text-lg font-bold rounded-xl border transition-all focus:outline-none
                        ${digit ? 'border-blue-500/60 bg-blue-500/10 text-white' : 'border-white/15 bg-white/5 text-white'}
                        focus:border-blue-500/80 focus:bg-blue-500/15
                        disabled:opacity-50`}
                      style={{ height: '52px' }}
                    />
                  ))}
                </div>

                {/* Timer */}
                <div className="text-center mb-4">
                  {timeLeft > 0 ? (
                    <p className="text-xs text-gray-400">
                      OTP expire hoga:{' '}
                      <span className={`font-mono font-bold ${timeLeft <= 30 ? 'text-red-400' : 'text-blue-400'}`}>
                        {formatTime(timeLeft)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-red-400">OTP expire ho gaya</p>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                  </motion.div>
                )}

                {/* Verify button */}
                <button
                  onClick={handleVerifyClick}
                  disabled={otp.join('').length < 6 || verifying || otpSending || timeLeft === 0}
                  className="w-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed mb-3"
                >
                  {verifying ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Verify OTP</>
                  )}
                </button>

                {/* Bottom row: Back + Resend */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setStep('credentials'); setError(''); setOtp(['','','','','','']); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl text-xs transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={handleResend}
                    disabled={timeLeft > 0 || loading || otpSending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {timeLeft > 0 ? `Resend (${formatTime(timeLeft)})` : 'Resend OTP'}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
