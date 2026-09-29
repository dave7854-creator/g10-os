import { useState, useEffect } from 'react';
import { getInvoiceDetail, formatCurrency, formatDate, type Session, type PortalInvoiceDetail } from '../portalApi';

interface PortalInvoiceDetailProps {
  session: Session;
  invoiceId: string;
  onBack: () => void;
}

export function PortalInvoiceDetail({ session, invoiceId, onBack }: PortalInvoiceDetailProps) {
  const [invoice, setInvoice] = useState<PortalInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getInvoiceDetail(session, invoiceId)
      .then((res) => setInvoice(res.invoice))
      .catch(() => setError('Unable to load invoice.'))
      .finally(() => setLoading(false));
  }, [session, invoiceId]);

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;
  if (error && !invoice) return (
    <div className="fp-portal-section">
      <BackButton onClick={onBack} />
      <div className="fp-portal-error-banner">{error}</div>
    </div>
  );
  if (!invoice) return null;

  const vehicleLabel = invoice.vehicle ? `${invoice.vehicle.year} ${invoice.vehicle.make} ${invoice.vehicle.model}` : 'Vehicle';
  const payUrl = invoice.paymentToken ? `/pay.html?token=${invoice.paymentToken}` : null;

  const handlePrint = () => window.print();

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <BackButton onClick={onBack} label="Back to Dashboard" />

        <div className="fp-portal-detail-header">
          <h1>Invoice {invoice.work_order_number}</h1>
          <p>{vehicleLabel}</p>
          <p className="fp-portal-detail-date">Invoice Date: {formatDate(invoice.invoice_date || invoice.created_at)}</p>
        </div>

        <div className="fp-portal-invoice-status">
          <div className="fp-portal-status-badge" style={{
            background: invoice.status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            color: invoice.status === 'paid' ? 'var(--fp-success)' : 'var(--fp-warning)',
          }}>
            {invoice.status === 'paid' ? 'Paid in Full' : 'Balance Due'}
          </div>
        </div>

        {/* Labor */}
        {invoice.laborOperations.length > 0 && (
          <div className="fp-portal-detail-section">
            <h3>Labor</h3>
            <div className="fp-portal-table">
              {invoice.laborOperations.map((op, i) => (
                <div key={i} className="fp-portal-table-row">
                  <div className="fp-portal-table-main">{op.operation_description}</div>
                  <div className="fp-portal-table-amount">{formatCurrency(op.labor_total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parts */}
        {invoice.parts.length > 0 && (
          <div className="fp-portal-detail-section">
            <h3>Parts</h3>
            <div className="fp-portal-table">
              {invoice.parts.map((p, i) => (
                <div key={i} className="fp-portal-table-row">
                  <div className="fp-portal-table-main">{p.description}</div>
                  <div className="fp-portal-table-amount">{formatCurrency(p.sell_price)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="fp-portal-detail-section">
          <div className="fp-portal-totals">
            <div className="fp-portal-total-row"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            {Number(invoice.shop_supplies) > 0 && <div className="fp-portal-total-row"><span>Shop Supplies</span><span>{formatCurrency(invoice.shop_supplies)}</span></div>}
            {Number(invoice.tax) > 0 && <div className="fp-portal-total-row"><span>Tax</span><span>{formatCurrency(invoice.tax)}</span></div>}
            <div className="fp-portal-total-row fp-portal-total-final"><span>Total</span><span>{formatCurrency(invoice.total)}</span></div>
            <div className="fp-portal-total-row"><span>Payments Applied</span><span>-{formatCurrency(invoice.totalPaid)}</span></div>
            <div className="fp-portal-total-row fp-portal-total-final" style={{ color: Number(invoice.balance_due) > 0 ? 'var(--fp-primary)' : 'var(--fp-success)' }}>
              <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
            </div>
          </div>
        </div>

        {/* Payments */}
        {invoice.payments.length > 0 && (
          <div className="fp-portal-detail-section">
            <h3>Payment History</h3>
            <div className="fp-portal-table">
              {invoice.payments.map((p, i) => (
                <div key={i} className="fp-portal-table-row">
                  <div className="fp-portal-table-main">
                    {formatCurrency(p.amount)}
                    <div className="fp-portal-table-sub">{p.method} &middot; {formatDate(p.created_at)}</div>
                  </div>
                  <div className="fp-portal-status-badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--fp-success)' }}>
                    {p.payment_status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="fp-portal-invoice-actions">
          <button className="fp-btn fp-btn-outline" onClick={handlePrint}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6,18H4a2,2 0 0,1-2-2V11a2,2 0 0,1 2-2H20a2,2 0 0,1 2 2V16a2,2 0 0,1-2 2H18M6,14H18V22H6V14z"/></svg>
            Print / Download
          </button>
          {payUrl && Number(invoice.balance_due) > 0 && (
            <a className="fp-btn fp-btn-primary fp-btn-lg" href={payUrl} target="_blank" rel="noopener">
              Pay {formatCurrency(invoice.balance_due)}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="fp-back-btn" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7M19 12H5"/></svg>
      {label}
    </button>
  );
}
