import { useState } from 'react';
import { signInWithPassword, sendSetupInvite, resetPassword } from '../portalApi';

interface PortalLoginProps {
  onBackToSite: () => void;
}

type Mode = 'signin' | 'setup' | 'forgot';

export function PortalLogin({ onBackToSite }: PortalLoginProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your username or email and your password.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Invalid username/email or password.');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await sendSetupInvite(email.trim());
    setLoading(false);
    if (result.success) {
      setInfo(`We sent a secure setup link to ${email}. Click the link in your email to create your password and complete your account.`);
    } else {
      setError(result.error || 'Unable to send setup link. Please try again.');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await resetPassword(email.trim());
    setLoading(false);
    if (result.success) {
      setInfo(`We sent a password reset link to ${email}. Click the link in your email to set a new password.`);
    } else {
      setError(result.error || 'Unable to send reset link. Please try again.');
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    setPassword('');
  };

  return (
    <div className="fp-anim-in" style={{ paddingTop: '120px', paddingBottom: '80px' }}>
      <div className="fp-section" style={{ maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="fp-nav-logo-mark" style={{ margin: '0 auto 20px', width: '56px', height: '56px', fontSize: '22px' }}>FP</div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, marginBottom: '8px' }}>Customer Portal</h1>
          <p style={{ color: 'var(--fp-text-dim)', fontSize: '16px' }}>
            Sign in to view your vehicles, estimates, invoices, and messages.
          </p>
        </div>

        {info ? (
          <div className="fp-portal-success-card">
            <div className="fp-portal-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h3>Check Your Email</h3>
            <p>{info}</p>
            <p style={{ fontSize: '13px', color: 'var(--fp-text-faint)', marginTop: '12px' }}>
              The link expires in 10 minutes. Check your spam folder if you don't see it.
            </p>
            <button className="fp-btn fp-btn-outline" style={{ marginTop: '20px' }} onClick={() => { setInfo(''); switchMode('signin'); }}>
              Back to Sign In
            </button>
          </div>
        ) : mode === 'signin' ? (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="fp-portal-label">Username or Email</label>
              <input
                type="text"
                className="fp-portal-input"
                placeholder="username or you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label className="fp-portal-label">Password</label>
              <input
                type="password"
                className="fp-portal-input"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && <div className="fp-portal-error">{error}</div>}

            <button type="submit" className="fp-btn fp-btn-primary fp-btn-lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('forgot')}
              style={{ background: 'none', border: 'none', color: 'var(--fp-text-dim)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, textAlign: 'center', padding: 0 }}
            >
              Forgot Password?
            </button>
          </form>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="fp-portal-label">Email</label>
              <input
                type="email"
                className="fp-portal-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>

            {error && <div className="fp-portal-error">{error}</div>}

            <button type="submit" className="fp-btn fp-btn-primary fp-btn-lg" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              style={{ background: 'none', border: 'none', color: 'var(--fp-text-dim)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, textAlign: 'center', padding: 0 }}
            >
              Back to Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="fp-portal-label">Email</label>
              <input
                type="email"
                className="fp-portal-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>

            {error && <div className="fp-portal-error">{error}</div>}

            <button type="submit" className="fp-btn fp-btn-primary fp-btn-lg" disabled={loading}>
              {loading ? 'Sending...' : 'Set Up / Access My Account'}
            </button>

            <p style={{ fontSize: '13px', color: 'var(--fp-text-faint)', textAlign: 'center', marginTop: '4px' }}>
              We'll email you a secure link to create your password and set up your account.
            </p>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              style={{ background: 'none', border: 'none', color: 'var(--fp-text-dim)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, textAlign: 'center', padding: 0 }}
            >
              Back to Sign In
            </button>
          </form>
        )}

        {!info && mode === 'signin' && (
          <div style={{ marginTop: '24px', padding: '16px', background: 'var(--fp-surface)', borderRadius: '12px', border: '1px solid var(--fp-border)' }}>
            <p style={{ fontSize: '13px', color: 'var(--fp-text-dim)', textAlign: 'center', marginBottom: '12px' }}>
              New customer or haven't set up your account?
            </p>
            <button
              onClick={() => switchMode('setup')}
              style={{ width: '100%', background: 'none', border: '1px solid var(--fp-border)', color: 'var(--fp-primary)', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: '10px', borderRadius: '8px' }}
            >
              Set Up / Access My Account
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={onBackToSite} style={{ background: 'none', border: 'none', color: 'var(--fp-text-faint)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            Back to Website
          </button>
        </div>
      </div>
    </div>
  );
}
