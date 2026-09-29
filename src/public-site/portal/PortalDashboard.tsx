import { useState, useEffect } from 'react';
import { getDashboard, formatCurrency, formatDate, REPAIR_STATUS_LABELS, STATUS_COLORS, type Session, type DashboardData } from '../portalApi';
import type { PortalPage } from './PortalApp';

interface PortalDashboardProps {
  session: Session;
  onNavigate: (page: PortalPage, id?: string) => void;
}

export function PortalDashboard({ session, onNavigate }: PortalDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard(session)
      .then(setData)
      .catch(() => setError('Unable to load your dashboard. Please try again.'))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) {
    return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;
  }

  if (error || !data) {
    return (
      <div className="fp-portal-section">
        <div className="fp-portal-error-banner">{error || 'Unable to load dashboard.'}</div>
      </div>
    );
  }

  const { customer, stats, workOrders } = data;
  const estimates = workOrders.filter(wo => wo.status === 'estimate');
  const activeRepairs = workOrders.filter(wo => ['approved', 'in_progress', 'waiting_parts'].includes(wo.status));
  const invoices = workOrders.filter(wo => wo.status === 'invoiced' || wo.status === 'paid');

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        {/* Greeting */}
        <div className="fp-portal-greeting">
          <h1>Welcome, {customer.first_name || 'Customer'}</h1>
          <p>Here's what's happening with your vehicles and repairs.</p>
        </div>

        {/* Status cards */}
        <div className="fp-portal-stat-grid">
          <div className="fp-portal-stat-card" onClick={() => onNavigate('dashboard')}>
            <div className="fp-portal-stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--fp-warning)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div className="fp-portal-stat-value">{stats.estimatesAwaitingApproval}</div>
            <div className="fp-portal-stat-label">Estimates Awaiting Approval</div>
          </div>

          <div className="fp-portal-stat-card">
            <div className="fp-portal-stat-icon" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--fp-accent)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div className="fp-portal-stat-value">{stats.activeRepairs}</div>
            <div className="fp-portal-stat-label">Vehicles Being Serviced</div>
          </div>

          <div className="fp-portal-stat-card">
            <div className="fp-portal-stat-icon" style={{ background: 'rgba(220,38,38,0.15)', color: 'var(--fp-primary)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </div>
            <div className="fp-portal-stat-value">{formatCurrency(stats.balanceDue)}</div>
            <div className="fp-portal-stat-label">Balance Due</div>
          </div>

          <div className="fp-portal-stat-card" onClick={() => onNavigate('vehicles')}>
            <div className="fp-portal-stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--fp-success)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2-4H6L4 10l-2.5 1.1C1.7 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
            <div className="fp-portal-stat-value">{data.vehicles.length}</div>
            <div className="fp-portal-stat-label">My Vehicles</div>
          </div>
        </div>

        {/* Quick action */}
        <button className="fp-btn fp-btn-primary fp-btn-lg fp-portal-cta" onClick={() => onNavigate('service-request')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          Request Service
        </button>

        {/* Estimates awaiting approval */}
        {estimates.length > 0 && (
          <div className="fp-portal-list">
            <h2 className="fp-portal-list-title">Estimates Awaiting Your Approval</h2>
            {estimates.map(wo => (
              <div key={wo.id} className="fp-portal-list-item" onClick={() => onNavigate('estimate', wo.id)}>
                <div className="fp-portal-list-info">
                  <div className="fp-portal-list-primary">{wo.work_order_number}</div>
                  <div className="fp-portal-list-secondary">
                    {wo.vehicle ? `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}` : 'Vehicle info unavailable'}
                  </div>
                  <div className="fp-portal-list-meta">{formatDate(wo.created_at)}</div>
                </div>
                <div className="fp-portal-list-right">
                  <div className="fp-portal-list-amount">{formatCurrency(wo.total)}</div>
                  <div className="fp-portal-status-badge" style={{ background: STATUS_COLORS[wo.status] + '22', color: STATUS_COLORS[wo.status] }}>
                    Action Needed
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active repairs */}
        {activeRepairs.length > 0 && (
          <div className="fp-portal-list">
            <h2 className="fp-portal-list-title">Current Repairs</h2>
            {activeRepairs.map(wo => (
              <div key={wo.id} className="fp-portal-list-item">
                <div className="fp-portal-list-info">
                  <div className="fp-portal-list-primary">{wo.work_order_number}</div>
                  <div className="fp-portal-list-secondary">
                    {wo.vehicle ? `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}` : 'Vehicle info unavailable'}
                  </div>
                </div>
                <div className="fp-portal-list-right">
                  <div className="fp-portal-status-badge" style={{ background: STATUS_COLORS[wo.status] + '22', color: STATUS_COLORS[wo.status] }}>
                    {REPAIR_STATUS_LABELS[wo.status]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent invoices */}
        {invoices.length > 0 && (
          <div className="fp-portal-list">
            <h2 className="fp-portal-list-title">Invoices</h2>
            {invoices.slice(0, 5).map(wo => (
              <div key={wo.id} className="fp-portal-list-item" onClick={() => onNavigate('invoice', wo.id)}>
                <div className="fp-portal-list-info">
                  <div className="fp-portal-list-primary">{wo.work_order_number}</div>
                  <div className="fp-portal-list-secondary">
                    {wo.vehicle ? `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}` : 'Vehicle info unavailable'}
                  </div>
                  <div className="fp-portal-list-meta">{formatDate(wo.invoice_date || wo.created_at)}</div>
                </div>
                <div className="fp-portal-list-right">
                  <div className="fp-portal-list-amount">{formatCurrency(wo.total)}</div>
                  {Number(wo.balance_due) > 0 && wo.status === 'invoiced' && (
                    <div className="fp-portal-pay-btn">Pay {formatCurrency(wo.balance_due)}</div>
                  )}
                  {wo.status === 'paid' && (
                    <div className="fp-portal-status-badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--fp-success)' }}>
                      Paid
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {workOrders.length === 0 && (
          <div className="fp-portal-empty">
            <h3>No Records Yet</h3>
            <p>You don't have any estimates, repairs, or invoices yet. When you bring your vehicle in, they'll show up here.</p>
            <button className="fp-btn fp-btn-primary" onClick={() => onNavigate('service-request')}>Request Service</button>
          </div>
        )}
      </div>
    </div>
  );
}
