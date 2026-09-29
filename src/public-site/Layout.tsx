import { useState, useEffect } from 'react';
import { BUSINESS, NAV_ITEMS, type PageId } from './types';

interface LayoutProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
}

export function PublicLayout({ currentPage, onNavigate, children }: LayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navigate = (page: PageId) => {
    onNavigate(page);
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <nav className="fp-nav" style={{ background: scrolled ? 'rgba(11,15,20,0.95)' : 'rgba(11,15,20,0.85)' }}>
        <div className="fp-nav-inner">
          <div className="fp-nav-logo" onClick={() => navigate('home')}>
            <div className="fp-nav-logo-mark">FP</div>
            <div className="fp-nav-logo-text">
              Fort Peck Auto
              <span>Wolf Point, MT</span>
            </div>
          </div>

          <div className="fp-nav-links">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.id}
                className={`fp-nav-link ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </div>
            ))}
          </div>

          <div className="fp-nav-actions">
            <a className="fp-nav-call" href={BUSINESS.phoneHref}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              CALL {BUSINESS.phone}
            </a>
            <div className="fp-nav-mobile-toggle" onClick={() => setDrawerOpen(!drawerOpen)}>
              {drawerOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
            </div>
          </div>
        </div>

        <div className={`fp-nav-drawer ${drawerOpen ? 'open' : ''}`}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`fp-nav-drawer-link ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </div>
          ))}
          <a className="fp-nav-drawer-call" href={BUSINESS.phoneHref}>
            CALL {BUSINESS.phone}
          </a>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px', paddingTop: '8px' }}>
            <a href="/app.html" style={{ display: 'block', padding: '10px 20px', fontSize: '13px', color: 'var(--fp-text-faint)', textDecoration: 'none', fontWeight: 600 }}>
              Employee Login
            </a>
          </div>
        </div>
      </nav>

      <main style={{ paddingTop: 0 }}>{children}</main>

      <footer className="fp-footer">
        <div className="fp-footer-inner">
          <div className="fp-footer-grid">
            <div className="fp-footer-brand">
              <h3>Fort Peck Auto</h3>
              <p>{BUSINESS.tagline}</p>
              <p className="fp-footer-sub">{BUSINESS.partsDivision}</p>
              <p style={{ marginTop: 12 }}>{BUSINESS.location}</p>
              <a href={BUSINESS.phoneHref} className="fp-footer-phone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {BUSINESS.phone}
              </a>
            </div>

            <div className="fp-footer-col">
              <h4>Services</h4>
              <a onClick={() => navigate('repair')}>Auto Repair</a>
              <a onClick={() => navigate('towing')}>Towing</a>
              <a onClick={() => navigate('alignment')}>Alignments</a>
            </div>

            <div className="fp-footer-col">
              <h4>Parts</h4>
              <a onClick={() => navigate('parts')}>Parts & eBay Store</a>
              <a onClick={() => navigate('find-a-part')}>Find a Part</a>
              <a href={BUSINESS.ebayStoreUrl} target="_blank" rel="noopener">eBay Store</a>
            </div>

            <div className="fp-footer-col">
              <h4>Company</h4>
              <a onClick={() => navigate('hours')}>Hours & Location</a>
              <a onClick={() => navigate('contact')}>Contact</a>
              <a onClick={() => navigate('portal')}>Customer Portal</a>
              <a href="/app.html" style={{ fontSize: '13px', color: 'var(--fp-text-faint)', marginTop: '8px', display: 'inline-block' }}>Employee Login</a>
            </div>
          </div>

          <div className="fp-footer-bottom">
            <span>&copy; {new Date().getFullYear()} Fort Peck Auto LLC. All rights reserved.</span>
            <span>Wolf Point, Montana</span>
          </div>
        </div>
      </footer>
    </>
  );
}
