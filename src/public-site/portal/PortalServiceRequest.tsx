import { useState, useEffect } from 'react';
import { getDashboard, createServiceRequest, type Session, type PortalVehicle } from '../portalApi';

interface PortalServiceRequestProps {
  session: Session;
  onDone: () => void;
}

export function PortalServiceRequest({ session, onDone }: PortalServiceRequestProps) {
  const [vehicles, setVehicles] = useState<PortalVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getDashboard(session)
      .then((res) => {
        setVehicles(res.vehicles);
        if (res.vehicles.length > 0) setVehicleId(res.vehicles[0].id);
      })
      .catch(() => setError('Unable to load your vehicles.'))
      .finally(() => setLoading(false));
  }, [session]);

  const handleSubmit = async () => {
    if (!vehicleId) {
      setError('Please select a vehicle.');
      return;
    }
    if (!problem.trim()) {
      setError('Please describe the problem or service needed.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await createServiceRequest(session, vehicleId, problem);
      if (result.success) {
        setSuccess(`Service request submitted! Your work order number is ${result.work_order_number}. The shop has been notified.`);
      }
    } catch (e: any) {
      setError(e.message || 'Unable to submit request.');
    }
    setSubmitting(false);
  };

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  if (success) {
    return (
      <div className="fp-anim-in">
        <div className="fp-portal-section">
          <div className="fp-portal-success-card">
            <div className="fp-portal-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h3>Request Submitted!</h3>
            <p>{success}</p>
            <button className="fp-btn fp-btn-primary" style={{ marginTop: '20px' }} onClick={onDone}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <h1 className="fp-portal-page-title">Request Service</h1>
        <p style={{ color: 'var(--fp-text-dim)', marginBottom: '24px' }}>
          Select one of your saved vehicles and tell us what's going on. We'll create a work order and get back to you.
        </p>

        {error && <div className="fp-portal-error-banner">{error}</div>}

        {vehicles.length === 0 ? (
          <div className="fp-portal-empty">
            <h3>Add a Vehicle First</h3>
            <p>You need to add at least one vehicle before you can request service.</p>
            <button className="fp-btn fp-btn-primary" onClick={onDone}>Go to Dashboard</button>
          </div>
        ) : (
          <div className="fp-portal-form">
            <div className="fp-portal-field">
              <label className="fp-portal-label">Select Vehicle *</label>
              <select className="fp-portal-input fp-portal-select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model}{v.vin ? ` — VIN: ${v.vin.slice(-6)}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="fp-portal-field">
              <label className="fp-portal-label">Problem / Service Needed *</label>
              <textarea
                className="fp-portal-input fp-portal-textarea"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="Describe the issue, what service you need, or any concerns..."
                rows={5}
              />
            </div>

            <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Service Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
