import { useState, useEffect } from 'react';
import { getVehicles, addVehicle, decodeVin, formatCurrency, type Session, type PortalVehicle } from '../portalApi';

interface PortalVehiclesProps {
  session: Session;
}

export function PortalVehicles({ session }: PortalVehiclesProps) {
  const [vehicles, setVehicles] = useState<PortalVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    getVehicles(session)
      .then((res) => setVehicles(res.vehicles))
      .catch(() => setError('Unable to load vehicles.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <div className="fp-portal-header">
          <h1>My Vehicles</h1>
          <button className="fp-btn fp-btn-primary fp-btn-sm" onClick={() => setShowAdd(true)}>Add Vehicle</button>
        </div>

        {error && <div className="fp-portal-error-banner">{error}</div>}

        {vehicles.length === 0 && !showAdd && (
          <div className="fp-portal-empty">
            <h3>No Vehicles Yet</h3>
            <p>Add your vehicle to make service requests easier.</p>
            <button className="fp-btn fp-btn-primary" onClick={() => setShowAdd(true)}>Add Your First Vehicle</button>
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="fp-portal-card-grid">
            {vehicles.map(v => (
              <div key={v.id} className="fp-portal-card">
                <div className="fp-portal-card-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2-4H6L4 10l-2.5 1.1C1.7 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                </div>
                <div className="fp-portal-card-title">{v.year} {v.make} {v.model}</div>
                {v.trim && v.trim !== 'Base' && <div className="fp-portal-card-sub">{v.trim}</div>}
                <div className="fp-portal-card-details">
                  {v.vin && <div><span>VIN</span> {v.vin}</div>}
                  {v.mileage != null && <div><span>Mileage</span> {v.mileage.toLocaleString()} mi</div>}
                  {v.engine && <div><span>Engine</span> {v.engine}</div>}
                  {v.color && <div><span>Color</span> {v.color}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <AddVehicleForm
            session={session}
            onClose={() => setShowAdd(false)}
            onAdded={() => { setShowAdd(false); load(); }}
          />
        )}
      </div>
    </div>
  );
}

function AddVehicleForm({ session, onClose, onAdded }: { session: Session; onClose: () => void; onAdded: () => void }) {
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [color, setColor] = useState('');
  const [mileage, setMileage] = useState('');
  const [decoded, setDecoded] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDecode = async () => {
    if (vin.length < 17) {
      setError('VIN must be 17 characters.');
      return;
    }
    setDecoding(true);
    setError('');
    try {
      const result = await decodeVin(vin, session);
      setYear(String(result.year));
      setMake(result.make);
      setModel(result.model);
      setTrim(result.trim);
      setDecoded(true);
    } catch (e: any) {
      setError(e.message || 'Unable to decode VIN.');
      setDecoded(false);
    }
    setDecoding(false);
  };

  const handleSave = async () => {
    if (!make || !model || !year) {
      setError('Year, make, and model are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addVehicle(session, {
        vin: vin || undefined,
        year: year || undefined,
        make: make || undefined,
        model: model || undefined,
        trim: trim || undefined,
        color: color || undefined,
        mileage: mileage ? parseInt(mileage) : undefined,
        vin_decoded: decoded,
      });
      onAdded();
    } catch (e: any) {
      setError(e.message || 'Unable to add vehicle.');
    }
    setSaving(false);
  };

  return (
    <div className="fp-portal-modal-overlay" onClick={onClose}>
      <div className="fp-portal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-portal-modal-header">
          <h3>Add Vehicle</h3>
          <button className="fp-portal-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="fp-portal-modal-body">
          {error && <div className="fp-portal-error-banner">{error}</div>}

          <div className="fp-portal-field">
            <label className="fp-portal-label">VIN (optional — auto-fills details)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="fp-portal-input"
                value={vin}
                onChange={(e) => { setVin(e.target.value.toUpperCase()); setDecoded(false); }}
                placeholder="17-character VIN"
                maxLength={17}
              />
              <button className="fp-btn fp-btn-outline fp-btn-sm" onClick={handleDecode} disabled={decoding || vin.length < 17}>
                {decoding ? 'Decoding...' : 'Decode'}
              </button>
            </div>
          </div>

          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">Year *</label>
              <input className="fp-portal-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Make *</label>
              <input className="fp-portal-input" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Chevrolet" />
            </div>
          </div>

          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">Model *</label>
              <input className="fp-portal-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Silverado" />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Trim</label>
              <input className="fp-portal-input" value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="LT" />
            </div>
          </div>

          <div className="fp-portal-field-row">
            <div className="fp-portal-field">
              <label className="fp-portal-label">Color</label>
              <input className="fp-portal-input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Black" />
            </div>
            <div className="fp-portal-field">
              <label className="fp-portal-label">Mileage</label>
              <input className="fp-portal-input" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="85000" />
            </div>
          </div>
        </div>

        <div className="fp-portal-modal-footer">
          <button className="fp-btn fp-btn-outline" onClick={onClose}>Cancel</button>
          <button className="fp-btn fp-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Add Vehicle'}
          </button>
        </div>
      </div>
    </div>
  );
}
