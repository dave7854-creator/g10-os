import { useState } from 'react';
import { createAccount, updatePassword, type Session, type PortalCustomer } from '../portalApi';

interface PortalSetupProps {
  session: Session;
  email: string;
  onComplete: (customer: PortalCustomer) => void;
  onBackToSite: () => void;
}

export function PortalSetup({ session, email, onComplete, onBackToSite }: PortalSetupProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError('First name, last name, and phone number are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const pwResult = await updatePassword(password);
      if (!pwResult.success) {
        setError(pwResult.error || 'Unable to set password. Please try again.');
        setSaving(false);
        return;
      }

      const result = await createAccount(session, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        address: address.trim() || undefined,
      });

      if (result.linked && result.customer) {
        onComplete(result.customer);
      } else {
        setError(result.error || 'Unable to create your account. Please try again.');
      }
    } catch {
      setError('Unable to create your account. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="fp-anim-in" style={{ paddingTop: '120px', paddingBottom: '80px' }}>
      <div className="fp-section" style={{ maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="fp-nav-logo-mark" style={{ margin: '0 auto 20px', width: '56px', height: '56px', fontSize: '22px' }}>FP</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px' }}>Complete Your Account</h1>
          <p style={{ color: 'var(--fp-text-dim)', fontSize: '15px' }}>
            Your email <strong>{email}</strong> was verified. Complete the form below to finish setting up your customer portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">First Name *</label>
              <input className="fp-portal-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus disabled={saving} />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Last Name *</label>
              <input className="fp-portal-input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="fp-portal-field">
            <label className="fp-portal-label">Phone Number *</label>
            <input className="fp-portal-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="406-555-0100" disabled={saving} />
          </div>

          <div className="fp-portal-field">
            <label className="fp-portal-label">Address (optional)</label>
            <input className="fp-portal-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Wolf Point, MT" disabled={saving} />
          </div>

          <div className="fp-portal-field">
            <label className="fp-portal-label">Create Password *</label>
            <input type="password" className="fp-portal-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" disabled={saving} />
          </div>

          <div className="fp-portal-field">
            <label className="fp-portal-label">Confirm Password *</label>
            <input type="password" className="fp-portal-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" disabled={saving} />
          </div>

          {error && <div className="fp-portal-error">{error}</div>}

          <button type="submit" className="fp-btn fp-btn-primary fp-btn-lg" disabled={saving}>
            {saving ? 'Creating Account...' : 'Complete Setup'}
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
