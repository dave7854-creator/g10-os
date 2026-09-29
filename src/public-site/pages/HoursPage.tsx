import { BUSINESS, HOURS, type PageId } from '../types';

export function HoursPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <div className="fp-anim-in" style={{ paddingTop: '90px' }}>
      <div className="fp-section" style={{ paddingTop: '20px' }}>
        <div className="fp-section-header">
          <span className="fp-eyebrow">Visit Us</span>
          <h2>Hours & Location</h2>
          <p>Fort Peck Auto — Wolf Point, Montana</p>
        </div>

        <div className="fp-hours-grid">
          {/* Hours */}
          <div className="fp-hours-card">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Business Hours
            </h3>
            {HOURS.map((row) => (
              <div key={row.day} className="fp-hours-row">
                <span className="fp-hours-day">{row.day}</span>
                <span className={`fp-hours-time ${!row.time ? 'closed' : ''}`}>
                  {row.time || 'By Appointment'}
                </span>
              </div>
            ))}
            <p style={{ fontSize: '13px', color: 'var(--fp-text-faint)', marginTop: '16px' }}>
              Hours may vary. Please call to confirm current business hours.
            </p>
          </div>

          {/* Location */}
          <div>
            <div className="fp-map-placeholder">
              <div style={{ textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '8px' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <p>Map of Wolf Point, Montana</p>
              </div>
            </div>
            <div className="fp-hours-card" style={{ marginTop: '20px' }}>
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Our Location
              </h3>
              <div className="fp-location-info">
                <div className="fp-location-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <div>
                    <strong>Fort Peck Auto</strong><br />
                    {BUSINESS.location}
                  </div>
                </div>
                <div className="fp-location-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <a href={BUSINESS.phoneHref} style={{ color: 'var(--fp-text)', fontWeight: 600 }}>{BUSINESS.phone}</a>
                </div>
              </div>
              <div className="fp-location-actions">
                <a className="fp-btn fp-btn-primary" href={BUSINESS.phoneHref}>Call</a>
                <a className="fp-btn fp-btn-outline" href="https://www.google.com/maps/search/?api=1&query=Fort+Peck+Auto+Wolf+Point+Montana" target="_blank" rel="noopener">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Get Directions
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
