import { BUSINESS, type PageId } from '../types';

export function ContactPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <div className="fp-anim-in" style={{ paddingTop: '90px' }}>
      <div className="fp-section" style={{ paddingTop: '20px' }}>
        <div className="fp-section-header">
          <span className="fp-eyebrow">Get In Touch</span>
          <h2>Contact Us</h2>
          <p>Fort Peck Auto & {BUSINESS.partsDivision}</p>
        </div>

        <div className="fp-contact-grid">
          {/* Left: phone + info */}
          <div className="fp-contact-card">
            <h3>Call Us</h3>
            <p style={{ color: 'var(--fp-text-dim)', fontSize: '14px', marginBottom: '20px' }}>
              Call {BUSINESS.phone} for any service — we're here to help.
            </p>
            <a className="fp-btn fp-btn-primary fp-btn-lg" href={BUSINESS.phoneHref} style={{ width: '100%' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call {BUSINESS.phone}
            </a>

            <div style={{ marginTop: '24px' }}>
              <h3>Business</h3>
              <div style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--fp-text-dim)' }}>
                <strong style={{ color: 'var(--fp-text)' }}>Fort Peck Auto</strong><br />
                Auto Repair • Towing • Alignments<br /><br />
                <strong style={{ color: 'var(--fp-text)' }}>{BUSINESS.partsDivision}</strong><br />
                Used OEM Auto Parts • Nationwide Shipping<br /><br />
                {BUSINESS.location}<br />
                <a href={BUSINESS.phoneHref} style={{ color: 'var(--fp-text)', fontWeight: 600 }}>{BUSINESS.phone}</a>
              </div>
            </div>
          </div>

          {/* Right: service options */}
          <div className="fp-contact-card">
            <h3>What Do You Need?</h3>
            <div className="fp-contact-option" onClick={() => onNavigate('repair')}>
              <div className="fp-contact-option-icon" style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              </div>
              <div className="fp-contact-option-text">
                <div className="fp-contact-option-title">Auto Repair</div>
                <div className="fp-contact-option-desc">Schedule repair or maintenance service</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fp-text-faint)' }}><path d="m9 18 6-6-6-6"/></svg>
            </div>

            <div className="fp-contact-option" onClick={() => onNavigate('towing')}>
              <div className="fp-contact-option-icon" style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h2l3-9 4 18 3-9h6"/></svg>
              </div>
              <div className="fp-contact-option-text">
                <div className="fp-contact-option-title">Towing</div>
                <div className="fp-contact-option-desc">Need a tow? Call us now</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fp-text-faint)' }}><path d="m9 18 6-6-6-6"/></svg>
            </div>

            <div className="fp-contact-option" onClick={() => onNavigate('alignment')}>
              <div className="fp-contact-option-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>
              </div>
              <div className="fp-contact-option-text">
                <div className="fp-contact-option-title">Wheel Alignment</div>
                <div className="fp-contact-option-desc">Schedule an alignment service</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fp-text-faint)' }}><path d="m9 18 6-6-6-6"/></svg>
            </div>

            <div className="fp-contact-option" onClick={() => onNavigate('find-a-part')}>
              <div className="fp-contact-option-icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <div className="fp-contact-option-text">
                <div className="fp-contact-option-title">Find a Part</div>
                <div className="fp-contact-option-desc">Search for a specific used OEM part</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fp-text-faint)' }}><path d="m9 18 6-6-6-6"/></svg>
            </div>

            <div className="fp-contact-option" onClick={() => onNavigate('parts')}>
              <div className="fp-contact-option-icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
              </div>
              <div className="fp-contact-option-text">
                <div className="fp-contact-option-title">Browse Parts Store</div>
                <div className="fp-contact-option-desc">Shop our live eBay inventory</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fp-text-faint)' }}><path d="m9 18 6-6-6-6"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
