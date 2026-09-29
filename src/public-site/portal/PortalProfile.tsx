import { useState, useEffect } from 'react';
import { getDashboard, updateProfile, type Session, type PortalCustomer } from '../portalApi';

interface PortalProfileProps {
  session: Session;
}

export function PortalProfile({ session }: PortalProfileProps) {
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    getDashboard(session)
      .then((res) => {
        setCustomer(res.customer);
        setFirstName(res.customer.first_name || '');
        setLastName(res.customer.last_name || '');
        setPhone(res.customer.phone || '');
        setEmail(res.customer.email || '');
        setAddress(res.customer.address || '');
      })
      .catch(() => setError('Unable to load profile.'))
      .finally(() => setLoading(false));
  }, [session]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateProfile(session, {
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        address,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Unable to save.');
    }
    setSaving(false);
  };

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <h1 className="fp-portal-page-title">My Profile</h1>

        {error && <div className="fp-portal-error-banner">{error}</div>}
        {saved && <div className="fp-portal-success-banner">Profile updated successfully!</div>}

        <div className="fp-portal-form">
          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">First Name</label>
              <input className="fp-portal-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Last Name</label>
              <input className="fp-portal-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">Phone</label>
              <input className="fp-portal-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="406-555-0100" />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Email</label>
              <input className="fp-portal-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="fp-portal-field">
            <label className="fp-portal-label">Address</label>
            <input className="fp-portal-input" value={address || ''} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Wolf Point, MT" />
          </div>

          <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="fp-portal-info-card" style={{ marginTop: '32px' }}>
          <h4>Vehicles</h4>
          <p style={{ fontSize: '14px', color: 'var(--fp-text-dim)' }}>
            Your vehicles are managed separately. Visit "My Vehicles" to add or view your vehicles.
          </p>
        </div>
      </div>
    </div>
  );
}
