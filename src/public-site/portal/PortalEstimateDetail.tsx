import { useState, useEffect } from 'react';
import { getEstimateDetail, respondToEstimate, formatCurrency, formatDate, type Session, type PortalEstimateDetail } from '../portalApi';

interface PortalEstimateDetailProps {
  session: Session;
  estimateId: string;
  onBack: () => void;
}

export function PortalEstimateDetail({ session, estimateId, onBack }: PortalEstimateDetailProps) {
  const [estimate, setEstimate] = useState<PortalEstimateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    getEstimateDetail(session, estimateId)
      .then((res) => setEstimate(res.estimate))
      .catch(() => setError('Unable to load estimate.'))
      .finally(() => setLoading(false));
  }, [session, estimateId]);

  const handleRespond = async () => {
    if (!decision || !estimate) return;
    setResponding(true);
    setError('');
    try {
      await respondToEstimate(session, estimate.id, decision, estimate.total, estimate.estimateHash, notes);
      setResult(decision === 'approved' ? 'Estimate approved! The shop has been notified.' : 'Estimate declined. The shop has been notified.');
      // Reload estimate
      const res = await getEstimateDetail(session, estimateId);
      setEstimate(res.estimate);
    } catch (e: any) {
      setError(e.message || 'Unable to submit your response.');
    }
    setResponding(false);
  };

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  if (error && !estimate) {
    return (
      <div className="fp-portal-section">
        <BackButton onClick={onBack} />
        <div className="fp-portal-error-banner">{error}</div>
      </div>
    );
  }

  if (!estimate) return null;

  const vehicleLabel = estimate.vehicle ? `${estimate.vehicle.year} ${estimate.vehicle.make} ${estimate.vehicle.model}` : 'Vehicle';
  const alreadyResponded = !!estimate.existingApproval;

  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <BackButton onClick={onBack} label="Back to Dashboard" />

        <div className="fp-portal-detail-header">
          <h1>Estimate {estimate.work_order_number}</h1>
          <p>{vehicleLabel}</p>
          <p className="fp-portal-detail-date">Date: {formatDate(estimate.created_at)}</p>
        </div>

        {result && <div className="fp-portal-success-banner">{result}</div>}
        {error && <div className="fp-portal-error-banner">{error}</div>}

        {alreadyResponded && (
          <div className="fp-portal-info-banner">
            You {estimate.existingApproval!.decision} this estimate on {formatDate(estimate.existingApproval!.decided_at)}.
          </div>
        )}

        {/* Labor */}
        {estimate.laborOperations.length > 0 && (
          <div className="fp-portal-detail-section">
            <h3>Labor</h3>
            <div className="fp-portal-table">
              {estimate.laborOperations.map((op, i) => (
                <div key={i} className="fp-portal-table-row">
                  <div className="fp-portal-table-main">
                    {op.operation_description}
                    <div className="fp-portal-table-sub">{op.charged_hours} hrs @ {formatCurrency(op.labor_rate)}</div>
                  </div>
                  <div className="fp-portal-table-amount">{formatCurrency(op.labor_total)}</div>
                </div>
              ))}
            </div>
            <div className="fp-portal-table-total">
              <span>Labor Subtotal</span>
              <span>{formatCurrency(estimate.laborTotal)}</span>
            </div>
          </div>
        )}

        {/* Parts */}
        {estimate.parts.length > 0 && (
          <div className="fp-portal-detail-section">
            <h3>Parts</h3>
            <div className="fp-portal-table">
              {estimate.parts.map((p, i) => (
                <div key={i} className="fp-portal-table-row">
                  <div className="fp-portal-table-main">
                    {p.description}
                    {p.part_number && <div className="fp-portal-table-sub">Part #: {p.part_number}</div>}
                  </div>
                  <div className="fp-portal-table-amount">{formatCurrency(p.sell_price)}</div>
                </div>
              ))}
            </div>
            <div className="fp-portal-table-total">
              <span>Parts Subtotal</span>
              <span>{formatCurrency(estimate.partsTotal)}</span>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="fp-portal-detail-section">
          <div className="fp-portal-totals">
            <div className="fp-portal-total-row"><span>Subtotal</span><span>{formatCurrency(estimate.subtotal)}</span></div>
            {Number(estimate.shop_supplies) > 0 && <div className="fp-portal-total-row"><span>Shop Supplies</span><span>{formatCurrency(estimate.shop_supplies)}</span></div>}
            {Number(estimate.tax) > 0 && <div className="fp-portal-total-row"><span>Tax</span><span>{formatCurrency(estimate.tax)}</span></div>}
            <div className="fp-portal-total-row fp-portal-total-final"><span>Total</span><span>{formatCurrency(estimate.total)}</span></div>
          </div>
        </div>

        {/* Approval actions */}
        {estimate.status === 'estimate' && !alreadyResponded && !result && (
          <div className="fp-portal-approval-section">
            <h3>Your Decision</h3>
            <p>Please review the estimate above and let us know how you'd like to proceed.</p>

            <div className="fp-portal-approval-buttons">
              <button
                className={`fp-btn fp-btn-lg ${decision === 'approved' ? 'fp-btn-primary' : 'fp-btn-outline'}`}
                onClick={() => setDecision('approved')}
              >
                Approve Estimate
              </button>
              <button
                className={`fp-btn fp-btn-lg ${decision === 'declined' ? 'fp-btn-primary' : 'fp-btn-outline'}`}
                onClick={() => setDecision('declined')}
              >
                Decline
              </button>
            </div>

            {decision && (
              <div className="fp-portal-approval-confirm">
                <div className="fp-portal-field">
                  <label className="fp-portal-label">Notes (optional)</label>
                  <textarea
                    className="fp-portal-input fp-portal-textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={decision === 'approved' ? 'Any special instructions or questions...' : 'Let us know why you\'re declining...'}
                    rows={3}
                  />
                </div>
                <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={handleRespond} disabled={responding}>
                  {responding ? 'Submitting...' : `Confirm ${decision === 'approved' ? 'Approval' : 'Decline'}`}
                </button>
              </div>
            )}
          </div>
        )}
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
