import { useState, useEffect, useCallback } from 'react';
import { portalSupabase, linkAccount, updatePassword, type Session, type User, type PortalCustomer } from '../portalApi';
import { PortalLogin } from './PortalLogin';
import { PortalSetup } from './PortalSetup';
import { PortalDashboard } from './PortalDashboard';
import { PortalVehicles } from './PortalVehicles';
import { PortalEstimateDetail } from './PortalEstimateDetail';
import { PortalInvoiceDetail } from './PortalInvoiceDetail';
import { PortalMessages } from './PortalMessages';
import { PortalServiceRequest } from './PortalServiceRequest';
import { PortalProfile } from './PortalProfile';
import { PortalPayments } from './PortalPayments';

export type PortalPage =
  | 'dashboard'
  | 'vehicles'
  | 'estimate'
  | 'invoice'
  | 'payments'
  | 'messages'
  | 'message-thread'
  | 'service-request'
  | 'profile';

interface PortalAppProps {
  onBackToSite: () => void;
}

export function PortalApp({ onBackToSite }: PortalAppProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [linked, setLinked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [page, setPage] = useState<PortalPage>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  useEffect(() => {
    // Check if this is a password recovery flow (redirected from auth-callback with ?recover=1)
    const hashParts = window.location.hash.split('?');
    const queryParams = new URLSearchParams(hashParts[1] || '');
    if (queryParams.get('recover') === '1') {
      setNeedsPasswordReset(true);
      // Clean the recover flag from the URL
      window.history.replaceState(null, '', `${window.location.pathname}#portal`);
    }

    // Ensure the hash stays #portal so PublicSite doesn't fall back to Home
    if (!window.location.hash.includes('portal')) {
      window.history.replaceState(null, '', `${window.location.pathname}#portal`);
    }

    portalSupabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = portalSupabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setLinked(false);
        setLinkError('');
        setNeedsSetup(false);
        setNeedsPasswordReset(false);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkLink = useCallback(async (sess: Session) => {
    setLinkError('');
    setNeedsSetup(false);
    try {
      const result = await linkAccount(sess);
      if (result.linked) {
        if (result.setup_complete === false) {
          setNeedsSetup(true);
        } else {
          setLinked(true);
        }
      } else if (result.needs_setup) {
        setNeedsSetup(true);
      } else if (result.error) {
        setLinked(false);
        setLinkError(result.error);
      }
    } catch {
      setLinkError('Unable to connect to your account. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (session && !linked && !linkError && !needsSetup) {
      checkLink(session);
    }
  }, [session, linked, linkError, needsSetup, checkLink]);

  const handleSignOut = () => {
    portalSupabase.auth.signOut();
    setLinked(false);
    setLinkError('');
    setNeedsSetup(false);
    setNeedsPasswordReset(false);
    setPage('dashboard');
  };

  const handleSetupComplete = (_customer: PortalCustomer) => {
    setNeedsSetup(false);
    setLinked(true);
    setPage('dashboard');
  };

  const navigate = (newPage: PortalPage, id?: string) => {
    setPage(newPage);
    if (id) setSelectedId(id);
    window.scrollTo(0, 0);
  };

  // Route guard: loading state
  if (loading) {
    return (
      <div style={{ paddingTop: '120px', paddingBottom: '80px', textAlign: 'center' }}>
        <div className="fp-loading"><div className="fp-spinner" /></div>
      </div>
    );
  }

  // Route guard: no session → login
  if (!session || !user) {
    return <PortalLogin onBackToSite={onBackToSite} />;
  }

  // Route guard: password recovery flow → show reset form
  if (needsPasswordReset) {
    return <PortalResetPassword session={session} onComplete={() => { setNeedsPasswordReset(false); }} onBackToSite={onBackToSite} />;
  }

  // Route guard: session exists but account setup is incomplete → setup page
  if (needsSetup) {
    return (
      <PortalSetup
        session={session}
        email={user.email || ''}
        onComplete={handleSetupComplete}
        onBackToSite={onBackToSite}
      />
    );
  }

  // Route guard: session exists but linking failed (non-setup error)
  if (!linked && linkError) {
    return (
      <div className="fp-anim-in" style={{ paddingTop: '120px', paddingBottom: '80px' }}>
        <div className="fp-section" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <div className="fp-empty">
            <h3>Account Not Connected</h3>
            <p style={{ marginBottom: '24px' }}>{linkError}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="fp-btn fp-btn-outline" onClick={() => { setLinked(false); setLinkError(''); checkLink(session); }}>
                Try Again
              </button>
              <button className="fp-btn fp-btn-primary" onClick={handleSignOut}>
                Sign Out
              </button>
              <button className="fp-btn fp-btn-outline" onClick={onBackToSite}>
                Back to Website
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Route guard: session exists but still linking (loading)
  if (!linked) {
    return (
      <div style={{ paddingTop: '120px', paddingBottom: '80px', textAlign: 'center' }}>
        <div className="fp-loading"><div className="fp-spinner" /></div>
        <p style={{ marginTop: '16px', color: 'var(--fp-text-dim)' }}>Connecting your account...</p>
      </div>
    );
  }

  // Setup complete → show portal
  return (
    <PortalShell page={page} onNavigate={navigate} onSignOut={handleSignOut} onBackToSite={onBackToSite}>
      {page === 'dashboard' && <PortalDashboard session={session} onNavigate={navigate} />}
      {page === 'vehicles' && <PortalVehicles session={session} />}
      {page === 'estimate' && selectedId && <PortalEstimateDetail session={session} estimateId={selectedId} onBack={() => navigate('dashboard')} />}
      {page === 'invoice' && selectedId && <PortalInvoiceDetail session={session} invoiceId={selectedId} onBack={() => navigate('dashboard')} />}
      {page === 'payments' && <PortalPayments session={session} onNavigate={navigate} />}
      {page === 'messages' && <PortalMessages session={session} onOpenThread={(id) => { setSelectedConversationId(id); navigate('message-thread'); }} />}
      {page === 'message-thread' && selectedConversationId && <PortalMessages session={session} conversationId={selectedConversationId} onBack={() => navigate('messages')} />}
      {page === 'service-request' && <PortalServiceRequest session={session} onDone={() => navigate('dashboard')} />}
      {page === 'profile' && <PortalProfile session={session} />}
    </PortalShell>
  );
}

function PortalResetPassword({ session, onComplete, onBackToSite }: { session: Session; onComplete: () => void; onBackToSite: () => void; }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await updatePassword(newPassword);
    setSaving(false);
    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Unable to update password. Please try again.');
    }
  };

  return (
    <div className="fp-anim-in" style={{ paddingTop: '120px', paddingBottom: '80px' }}>
      <div className="fp-section" style={{ maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="fp-nav-logo-mark" style={{ margin: '0 auto 20px', width: '56px', height: '56px', fontSize: '22px' }}>FP</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px' }}>Set New Password</h1>
          <p style={{ color: 'var(--fp-text-dim)', fontSize: '15px' }}>
            Enter your new password below to finish resetting your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="fp-portal-field">
            <label className="fp-portal-label">New Password *</label>
            <input type="password" className="fp-portal-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" autoFocus disabled={saving} />
          </div>
          <div className="fp-portal-field">
            <label className="fp-portal-label">Confirm Password *</label>
            <input type="password" className="fp-portal-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" disabled={saving} />
          </div>
          {error && <div className="fp-portal-error">{error}</div>}
          <button type="submit" className="fp-btn fp-btn-primary fp-btn-lg" disabled={saving}>
            {saving ? 'Saving...' : 'Set New Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={onBackToSite} style={{ background: 'none', border: 'none', color: 'var(--fp-text-faint)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            Back to Website
          </button>
        </div>
      </div>
    </div>
  );
}

interface PortalShellProps {
  page: PortalPage;
  onNavigate: (page: PortalPage) => void;
  onSignOut: () => void;
  onBackToSite: () => void;
  children: React.ReactNode;
}

const PORTAL_NAV: { id: PortalPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'vehicles', label: 'My Vehicles', icon: 'car' },
  { id: 'service-request', label: 'Request Service', icon: 'wrench' },
  { id: 'payments', label: 'Payments', icon: 'card' },
  { id: 'messages', label: 'Messages', icon: 'mail' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

function PortalShell({ page, onNavigate, onSignOut, onBackToSite, children }: PortalShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (p: PortalPage) => {
    onNavigate(p);
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <nav className="fp-nav" style={{ background: 'rgba(11,15,20,0.97)' }}>
        <div className="fp-nav-inner">
          <div className="fp-nav-logo" onClick={onBackToSite}>
            <div className="fp-nav-logo-mark">FP</div>
            <div className="fp-nav-logo-text">
              Customer Portal
              <span>Fort Peck Auto</span>
            </div>
          </div>

          <div className="fp-portal-nav-links">
            {PORTAL_NAV.map((item) => (
              <div
                key={item.id}
                className={`fp-nav-link ${page === item.id || (item.id === 'messages' && page === 'message-thread') ? 'active' : ''}`}
                onClick={() => nav(item.id)}
              >
                {item.label}
              </div>
            ))}
          </div>

          <div className="fp-nav-actions">
            <button className="fp-btn fp-btn-outline fp-btn-sm" onClick={onSignOut}>Sign Out</button>
            <div className="fp-nav-mobile-toggle" onClick={() => setDrawerOpen(!drawerOpen)}>
              {drawerOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
            </div>
          </div>
        </div>

        <div className={`fp-nav-drawer ${drawerOpen ? 'open' : ''}`}>
          {PORTAL_NAV.map((item) => (
            <div
              key={item.id}
              className={`fp-nav-drawer-link ${page === item.id ? 'active' : ''}`}
              onClick={() => nav(item.id)}
            >
              {item.label}
            </div>
          ))}
          <button className="fp-nav-drawer-call" onClick={onSignOut}>Sign Out</button>
          <button className="fp-nav-drawer-link" onClick={onBackToSite}>Back to Website</button>
        </div>
      </nav>

      <div style={{ paddingTop: '84px', minHeight: '100vh' }}>
        {children}
      </div>
    </>
  );
}
