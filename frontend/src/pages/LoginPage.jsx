import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Mail,
  KeyRound,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Building2,
  Sparkles,
} from 'lucide-react';
import { api, setStoredToken, setStoredUser } from '../api/client';
import { PORTALS } from '../config/portals';

function PortalArtwork({ portal }) {
  // Bespoke non-blue geometric artwork unique to each portal
  const stroke = portal.accent;
  const muted = portal.isLightPanel ? 'rgba(28,25,23,0.12)' : 'rgba(255,255,255,0.08)';

  if (portal.key === 'admin') {
    return (
      <svg viewBox="0 0 360 360" fill="none" style={{ position: 'absolute', right: -40, bottom: -40, width: 320, height: 320, pointerEvents: 'none', opacity: 0.7 }}>
        <circle cx="180" cy="180" r="150" stroke={stroke} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="6 6" />
        <circle cx="180" cy="180" r="110" stroke={muted} strokeWidth="1.2" />
        <circle cx="180" cy="180" r="70" stroke={stroke} strokeOpacity="0.55" strokeWidth="1.5" />
        <rect x="148" y="148" width="64" height="64" rx="14" stroke={stroke} strokeWidth="1.5" transform="rotate(45 180 180)" />
        <line x1="30" y1="180" x2="330" y2="180" stroke={muted} strokeWidth="1" />
        <line x1="180" y1="30" x2="180" y2="330" stroke={muted} strokeWidth="1" />
      </svg>
    );
  }
  if (portal.key === 'staff') {
    return (
      <svg viewBox="0 0 360 360" fill="none" style={{ position: 'absolute', right: -30, bottom: -30, width: 310, height: 310, pointerEvents: 'none', opacity: 0.65 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={40 + i * 24}
            y={40 + i * 24}
            width={280 - i * 48}
            height={280 - i * 48}
            rx={28 - i * 3}
            stroke={i % 2 === 0 ? stroke : muted}
            strokeOpacity={i % 2 === 0 ? 0.35 : 0.8}
            strokeWidth="1.2"
          />
        ))}
      </svg>
    );
  }
  if (portal.key === 'official') {
    return (
      <svg viewBox="0 0 380 260" fill="none" style={{ position: 'absolute', right: -20, bottom: -10, width: 360, height: 240, pointerEvents: 'none', opacity: 0.65 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M0 ${180 - i * 22} Q 95 ${120 - i * 16}, 190 ${165 - i * 18} T 380 ${135 - i * 20}`}
            stroke={i === 2 ? stroke : muted}
            strokeWidth={i === 2 ? 2 : 1.2}
            strokeOpacity={i === 2 ? 0.75 : 0.8}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 360 360" fill="none" style={{ position: 'absolute', right: -40, bottom: -50, width: 320, height: 320, pointerEvents: 'none', opacity: 0.7 }}>
      <circle cx="210" cy="210" r="140" fill={stroke} fillOpacity="0.08" />
      <circle cx="210" cy="210" r="95" stroke={stroke} strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="210" cy="210" r="50" stroke={stroke} strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="4 4" />
      <path d="M90 210 H155 L175 160 L205 255 L228 190 L248 210 H315" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '#D6D3D1' };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1;
  const map = [
    { label: 'Too short', color: '#DC2626' },
    { label: 'Weak', color: '#EA580C' },
    { label: 'Fair', color: '#D97706' },
    { label: 'Strong', color: '#0D9468' },
    { label: 'Excellent', color: '#047857' },
  ];
  return { score, ...map[score] };
}

export default function LoginPage({ portal, onBack, onSwitchPortal, onLoginSuccess }) {
  const Icon = portal.icon;

  // 'otp' (Email Verification Login) | 'password' (Classic Login) | 'signup' (Verified Registration)
  const [authMode, setAuthMode] = useState('otp');
  const [step, setStep] = useState('form'); // 'form' | 'verify_otp'

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pharmacyId, setPharmacyId] = useState('');
  const [showPw, setShowPw] = useState(false);

  // OTP state (6 digits)
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpInfoMsg, setOtpInfoMsg] = useState('');
  const [otpDevCode, setOtpDevCode] = useState('');
  const otpRefs = useRef([]);

  // Dynamic backend data
  const [portalStats, setPortalStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemoDrawer, setShowDemoDrawer] = useState(false);

  // Reset form errors & OTP step when portal switches dynamically
  useEffect(() => {
    setError('');
    setStep('form');
    setOtpDigits(['', '', '', '', '', '']);
    setOtpInfoMsg('');
    setOtpDevCode('');
  }, [portal.key]);

  // Fetch dynamic pharmacies & live metrics from backend
  useEffect(() => {
    api.auth.portalStats()
      .then((res) => {
        setPortalStats(res);
        if (res.pharmacies && res.pharmacies.length > 0) {
          setPharmacyId((prev) => prev || res.pharmacies[0].id);
        }
      })
      .catch(() => setPortalStats(null));
  }, []);

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (otpCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setOtpCountdown((sec) => (sec > 0 ? sec - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const formatTimer = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // Handle OTP box typing & paste
  const handleOtpChange = (index, val) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      chars.forEach((c, idx) => { next[idx] = c; });
      setOtpDigits(next);
      const focusIdx = Math.min(chars.length, 5);
      otpRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);
    if (index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Send 6-digit verification email (used by Email OTP Login & Create Account)
  const requestVerificationEmail = async (purpose) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (purpose === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.auth.requestOtp({
        email: trimmedEmail,
        portal_role: portal.role,
        purpose,
        full_name: purpose === 'signup' ? fullName.trim() : undefined,
        password: purpose === 'signup' ? password : undefined,
        pharmacy_id: purpose === 'signup' && portal.needsPharmacy ? pharmacyId || undefined : undefined,
      });
      setOtpInfoMsg(res.message || `6-digit verification code sent to ${trimmedEmail}`);
      setOtpDevCode(res.dev_code || '');
      if (res.dev_code && res.dev_code.length === 6) {
        setOtpDigits(res.dev_code.split(''));
      }
      setOtpCountdown(res.expires_in_seconds || 600);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('verify_otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (err) {
      setError(err.message || 'Failed to send verification email.');
    } finally {
      setLoading(false);
    }
  };

  // Verify 6-digit email code
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits from your verification email.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        code,
        portal_role: portal.role,
      });
      setStoredToken(res.access_token);
      setStoredUser(res.user);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Classic Password Sign In
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.portalLogin(portal.key, {
        email: email.trim().toLowerCase(),
        password,
      });
      setStoredToken(res.access_token);
      setStoredUser(res.user);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (authMode === 'password') {
      handlePasswordLogin(e);
    } else if (authMode === 'otp') {
      requestVerificationEmail('login');
    } else {
      requestVerificationEmail('signup');
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError('');
    try {
      const tokens = await api.auth.getDemoTokens();
      const match = tokens.find((t) => t.role === portal.role);
      if (!match) throw new Error('No demo token available for this portal.');
      setStoredToken(match.access_token);
      const demoUser = {
        id: `demo-${match.role}`,
        email: match.email,
        full_name: match.name,
        role: match.role,
        pharmacy_name: match.pharmacy_name || null,
        pharmacy_id: match.pharmacy_id || null,
        is_active: true,
      };
      setStoredUser(demoUser);
      onLoginSuccess(demoUser);
    } catch (err) {
      setError(err.message || 'Demo sign-in failed — check that the backend is running.');
    } finally {
      setDemoLoading(false);
    }
  };

  const pwStrength = getPasswordStrength(password);

  return (
    <div className="mp-auth-shell">
      {/* LEFT BESPOKE EDITORIAL CANVAS (Dynamic per portal, zero generic blue!) */}
      <section
        className="mp-auth-canvas"
        style={{
          background: `linear-gradient(155deg, ${portal.panelBg} 0%, ${portal.panelBgEnd} 100%)`,
          color: portal.panelText,
          borderRight: `1px solid ${portal.panelBorder}`,
        }}
      >
        <PortalArtwork portal={portal} />

        {/* Top navigation + dynamic portal switcher */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: portal.isLightPanel ? 'rgba(28,25,23,0.06)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${portal.panelBorder}`,
                color: portal.panelText,
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} />
              All Portals
            </button>

            <code style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: portal.accent,
              background: portal.isLightPanel ? 'rgba(234,88,12,0.1)' : 'rgba(255,255,255,0.06)',
              padding: '5px 10px',
              borderRadius: 999,
            }}>
              {portal.path}
            </code>
          </div>

          {/* Dynamic Portal Switcher Strip */}
          {onSwitchPortal && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              padding: 5,
              borderRadius: 12,
              background: portal.isLightPanel ? 'rgba(28,25,23,0.06)' : 'rgba(0,0,0,0.28)',
              border: `1px solid ${portal.panelBorder}`,
              width: 'fit-content',
            }}>
              {PORTALS.map((p) => {
                const active = p.key === portal.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => onSwitchPortal(p)}
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      background: active ? portal.accent : 'transparent',
                      color: active ? '#FFFFFF' : portal.panelMuted,
                    }}
                  >
                    {p.shortLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center Manifesto */}
        <div style={{ position: 'relative', zIndex: 2, margin: '44px 0' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 18,
          }}>
            <div style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: portal.accent,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 12px 24px -6px ${portal.accent}66`,
            }}>
              <Icon size={23} />
            </div>
            <div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: portal.accent,
                fontWeight: 700,
              }}>
                {portal.eyebrow}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{portal.label}</div>
            </div>
          </div>

          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(28px, 3.3vw, 44px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            margin: '0 0 18px',
            maxWidth: 460,
          }}>
            {portal.headline}
          </h1>

          <p style={{
            fontSize: 14.5,
            lineHeight: 1.65,
            color: portal.panelMuted,
            margin: '0 0 26px',
            maxWidth: 440,
          }}>
            {portal.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {portal.highlights.map((item) => (
              <span
                key={item}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: portal.isLightPanel ? 'rgba(28,25,23,0.06)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${portal.panelBorder}`,
                  color: portal.panelText,
                }}
              >
                ✦ {item}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom Dynamic Telemetry Bar */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          paddingTop: 20,
          borderTop: `1px solid ${portal.panelBorder}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
        }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700 }}>
              {portalStats ? portalStats.pharmacies_count : '—'}
            </div>
            <div style={{ fontSize: 11, color: portal.panelMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Live Pharmacies
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700 }}>
              {portalStats ? portalStats.medicines_count : '—'}
            </div>
            <div style={{ fontSize: 11, color: portal.panelMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Tracked SKUs
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: portal.accent }}>
              6-Digit
            </div>
            <div style={{ fontSize: 11, color: portal.panelMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              SMTP Email OTP
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT STUDIO AUTH PANEL (Warm Alabaster Ivory, Crisp Ink) */}
      <section className="mp-auth-panel">
        <div style={{ width: '100%', maxWidth: 420, minWidth: 0 }}>
          {/* Brand Micro-header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: '#141210',
              letterSpacing: '-0.02em',
            }}>
              MediPulse<span style={{ color: portal.accent }}>.ai</span>
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              fontWeight: 600,
              color: '#0D9468',
              background: '#E7F8F1',
              padding: '4px 10px',
              borderRadius: 999,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              {portalStats?.smtp_live ? 'Gmail SMTP Verified' : 'SMTP Ready'}
            </span>
          </div>

          {step === 'verify_otp' ? (
            /* ==================== STEP 2: 6-DIGIT EMAIL OTP VERIFICATION ==================== */
            <div>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 15,
                background: portal.accentSoft,
                color: portal.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <ShieldCheck size={26} />
              </div>

              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#141210',
                margin: '0 0 8px',
              }}>
                Check your inbox
              </h2>
              <p style={{ fontSize: 14, color: '#57534E', lineHeight: 1.6, margin: '0 0 18px' }}>
                {otpInfoMsg || `We sent a 6-digit verification code to ${email}.`} Enter it below to unlock the{' '}
                <b style={{ color: '#141210' }}>{portal.label}</b>.
              </p>

              {otpDevCode && (
                <div style={{
                  background: '#FEF6E6',
                  border: '1px solid #F5D08A',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 16,
                  fontSize: 12.5,
                  color: '#92400E',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>Host blocked SMTP 587/465 — Verification Code:</span>
                    <code style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: 3,
                      color: '#141210',
                      background: '#FFFFFF',
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #E5D4B3',
                    }}>
                      {otpDevCode}
                    </code>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: '#A16207', flexWrap: 'wrap' }}>
                    <span>Render Free tier restricts outbound SMTP ports. Code auto-populated below:</span>
                    <button
                      type="button"
                      onClick={() => setOtpDigits(otpDevCode.split(''))}
                      style={{
                        background: '#141210',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Auto-Fill Code
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div style={errorBoxStyle}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} style={{ width: '100%', minWidth: 0 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                  gap: 8,
                  width: '100%',
                  maxWidth: 380,
                  margin: '0 auto 18px',
                }}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { otpRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      size={1}
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      aria-label={`Verification digit ${idx + 1}`}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: 54,
                        padding: 0,
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 22,
                        fontWeight: 700,
                        borderRadius: 11,
                        border: `2px solid ${digit ? portal.accent : '#DDD6CB'}`,
                        background: digit ? '#FFFFFF' : '#F7F4EE',
                        color: '#141210',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  fontSize: 12.5,
                  color: '#78716C',
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {otpCountdown > 0 ? `Expires in ${formatTimer(otpCountdown)}` : 'Code expired'}
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => requestVerificationEmail(authMode === 'signup' ? 'signup' : 'login')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: portal.accent,
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <RefreshCw size={13} />
                    Resend code
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...primaryBtnStyle(portal.accent, loading),
                    marginBottom: 12,
                  }}
                >
                  {loading ? <Loader2 size={18} className="mp-spin" /> : <CheckCircle2 size={18} />}
                  {loading ? 'Verifying code…' : `Verify & Enter ${portal.label}`}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('form'); setError(''); }}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: 12,
                    border: '1px solid #E4DDD2',
                    background: 'transparent',
                    color: '#57534E',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ← Change email or sign-in method
                </button>
              </form>
            </div>
          ) : (
            /* ==================== STEP 1: DYNAMIC AUTH FORM ==================== */
            <div>
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#141210',
                margin: '0 0 6px',
              }}>
                {authMode === 'otp' && 'Sign in with Email Code'}
                {authMode === 'password' && `Welcome back`}
                {authMode === 'signup' && `Create ${portal.shortLabel} Account`}
              </h2>
              <p style={{ fontSize: 14, color: '#57534E', margin: '0 0 22px' }}>
                {authMode === 'otp' && 'We will email a 6-digit verification code directly to your inbox.'}
                {authMode === 'password' && `Enter your ${portal.label.toLowerCase()} credentials below.`}
                {authMode === 'signup' && 'Your email will be verified via 6-digit Gmail OTP before activation.'}
              </p>

              {/* 3-Tab Dynamic Auth Switcher */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 4,
                background: '#EFEAE1',
                padding: 4,
                borderRadius: 12,
                marginBottom: 22,
              }}>
                {[
                  { id: 'otp', label: 'Email OTP', icon: Mail },
                  { id: 'password', label: 'Password', icon: KeyRound },
                  { id: 'signup', label: 'Sign Up', icon: UserPlus },
                ].map((tab) => {
                  const TabIcon = tab.icon;
                  const active = authMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { setAuthMode(tab.id); setError(''); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '9px 8px',
                        borderRadius: 9,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        fontWeight: 700,
                        transition: 'all 0.16s ease',
                        background: active ? '#FFFFFF' : 'transparent',
                        color: active ? '#141210' : '#78716C',
                        boxShadow: active ? '0 2px 8px rgba(20,18,16,0.08)' : 'none',
                      }}
                    >
                      <TabIcon size={14} color={active ? portal.accent : '#78716C'} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div style={errorBoxStyle}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {authMode === 'signup' && (
                  <div>
                    <label style={labelStyle}>FULL NAME</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Dr. Priya Subramanian"
                      style={inputStyle}
                      required
                    />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>EMAIL ADDRESS</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={authMode === 'password' ? portal.demoEmail : 'you@gmail.com'}
                    autoComplete="username"
                    style={inputStyle}
                    required
                  />
                </div>

                {authMode === 'signup' && portal.needsPharmacy && portalStats?.pharmacies?.length > 0 && (
                  <div>
                    <label style={labelStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Building2 size={12} /> ASSIGNED PHARMACY BRANCH
                      </span>
                    </label>
                    <select
                      value={pharmacyId}
                      onChange={(e) => setPharmacyId(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {portalStats.pharmacies.map((ph) => (
                        <option key={ph.id} value={ph.id}>
                          {ph.name} — {ph.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(authMode === 'password' || authMode === 'signup') && (
                  <div>
                    <label style={labelStyle}>PASSWORD</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={authMode === 'signup' ? 'Create a strong password (min 6 chars)' : 'Enter your password'}
                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                        style={{ ...inputStyle, paddingRight: 44 }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label="Toggle password visibility"
                        style={{
                          position: 'absolute',
                          right: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#78716C',
                          display: 'flex',
                        }}
                      >
                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>

                    {authMode === 'signup' && password && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          {[1, 2, 3, 4].map((lvl) => (
                            <div
                              key={lvl}
                              style={{
                                flex: 1,
                                height: 4,
                                borderRadius: 99,
                                background: pwStrength.score >= lvl ? pwStrength.color : '#E7E2D9',
                                transition: 'background 0.2s',
                              }}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: pwStrength.color }}>
                          Strength: {pwStrength.label}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={primaryBtnStyle(portal.accent, loading)}
                >
                  {loading ? (
                    <Loader2 size={18} className="mp-spin" />
                  ) : authMode === 'password' ? (
                    <LogIn size={18} />
                  ) : (
                    <Mail size={18} />
                  )}
                  {loading
                    ? authMode === 'password' ? 'Authenticating…' : 'Sending verification email…'
                    : authMode === 'password'
                      ? `Sign In to ${portal.label}`
                      : authMode === 'otp'
                        ? 'Send 6-Digit Verification Code'
                        : 'Verify Email & Create Account'}
                </button>
              </form>

              {/* Subtle Collapsible Demo Access Drawer */}
              <div style={{
                marginTop: 26,
                paddingTop: 18,
                borderTop: '1px solid #E8E2D9',
              }}>
                <button
                  type="button"
                  onClick={() => setShowDemoDrawer((v) => !v)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    cursor: 'pointer',
                    color: '#57534E',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} color={portal.accent} />
                    Quick Demo &amp; Evaluation Credentials
                  </span>
                  {showDemoDrawer ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>

                {showDemoDrawer && (
                  <div style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 12,
                    background: '#F4EFE7',
                    border: '1px solid #E4DDD2',
                  }}>
                    <div style={{ fontSize: 12, color: '#57534E', marginBottom: 10, lineHeight: 1.6 }}>
                      <div>
                        Email: <code style={{ fontFamily: "'JetBrains Mono', monospace", color: '#141210', fontWeight: 600 }}>{portal.demoEmail}</code>
                      </div>
                      <div>
                        Password: <code style={{ fontFamily: "'JetBrains Mono', monospace", color: '#141210', fontWeight: 600 }}>{portal.demoPassword}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDemoLogin}
                      disabled={demoLoading}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1px solid ${portal.accent}`,
                        background: '#FFFFFF',
                        color: portal.accent,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: demoLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      {demoLoading ? <Loader2 size={15} className="mp-spin" /> : <Sparkles size={15} />}
                      {demoLoading ? 'Entering demo…' : `Instant Demo — ${portal.label}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <style>{`
        .mp-auth-shell {
          min-height: 100vh;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
          display: grid;
          grid-template-columns: minmax(340px, 46%) minmax(0, 1fr);
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          background: #FCFBF8;
          box-sizing: border-box;
        }
        .mp-auth-canvas {
          position: relative;
          overflow: hidden;
          min-width: 0;
          padding: 36px clamp(24px, 4vw, 52px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: background 0.35s ease;
          box-sizing: border-box;
        }
        .mp-auth-panel {
          background: #FCFBF8;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 36px clamp(20px, 4vw, 52px);
          box-sizing: border-box;
        }
        @media (max-width: 900px) {
          .mp-auth-shell {
            grid-template-columns: 1fr;
          }
          .mp-auth-canvas {
            padding: 28px 22px;
          }
        }
        @keyframes mpSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .mp-spin {
          animation: mpSpin 0.8s linear infinite;
        }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#57534E',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid #DDD6CB',
  background: '#FFFFFF',
  color: '#141210',
  fontSize: 14.5,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
};

const errorBoxStyle = {
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 12,
  padding: '11px 14px',
  marginBottom: 16,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  color: '#B91C1C',
  fontSize: 13,
  lineHeight: 1.45,
};

const primaryBtnStyle = (accent, disabled) => ({
  marginTop: 4,
  width: '100%',
  padding: '13px 18px',
  borderRadius: 12,
  background: disabled ? '#A8A29E' : accent,
  border: 'none',
  color: '#FFFFFF',
  fontSize: 14.5,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  boxShadow: disabled ? 'none' : `0 10px 22px -8px ${accent}99`,
  transition: 'transform 0.15s ease, opacity 0.15s ease',
});
