import { useState, useEffect } from 'react';
import { getPayments, formatCurrency, formatDate, type Session, type PortalPayment } from '../portalApi';
import type { PortalPage } from './PortalApp';

interface PortalPaymentsProps {
  session: Session;
  onNavigate: (page: PortalPage, id?: string) => void;
}

export function PortalPayments({ session }: PortalPaymentsProps) {
  const [payments, setPayments] = useState<PortalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPayments(session)
      .then((res) => setPayments(res.payments))
      .catch(() => setError('Unable to load payment history.'))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <h1 className="fp-portal-page-title">Payment History</h1>

        {error && <div className="fp-portal-error-banner">{error}</div>}

        {payments.length === 0 && !error && (
          <div className="fp-portal-empty">
            <h3>No Payments Yet</h3>
            <p>When you make payments on your invoices, they'll appear here.</p>
          </div>
        )}

        {payments.length > 0 && (
          <div className="fp-portal-list">
            {payments.map(p => (
              <div key={p.id} className="fp-portal-list-item">
                <div className="fp-portal-list-info">
                  <div className="fp-portal-list-primary">{formatCurrency(p.amount)}</div>
                  <div className="fp-portal-list-secondary">{p.work_order_number}</div>
                  <div className="fp-portal-list-meta">
                    {p.method} {p.processor ? `(${p.processor})` : ''} &middot; {formatDate(p.created_at)}
                  </div>
                </div>
                <div className="fp-portal-status-badge" style={{
                  background: p.payment_status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: p.payment_status === 'completed' ? 'var(--fp-success)' : 'var(--fp-warning)',
                }}>
                  {p.payment_status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
