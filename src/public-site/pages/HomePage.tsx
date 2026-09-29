import { useState, useEffect } from 'react';
import { BUSINESS, type PageId } from '../types';
import { searchInventory, type EbayItem } from '../ebayApi';
import { PartCard } from '../PartCard';

interface HomeProps {
  onNavigate: (page: PageId) => void;
  onViewProduct: (itemId: string, cachedItem?: EbayItem) => void;
}

export function HomePage({ onNavigate, onViewProduct }: HomeProps) {
  const [featured, setFeatured] = useState<EbayItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  useEffect(() => {
    searchInventory({ limit: 8, sort: 'NEWLY_LISTED' })
      .then((res) => setFeatured(res.items))
      .catch(() => setFeatured([]))
      .finally(() => setLoadingFeatured(false));
  }, []);

  return (
    <div className="fp-anim-in">
      {/* HERO */}
      <section className="fp-hero">
        <div className="fp-hero-bg">
          <img src="https://images.unsplash.com/photo-1486262715619-67ee85b12c03?w=1600&q=80" alt="" />
        </div>
        <div className="fp-hero-overlay" />
        <div className="fp-hero-content">
          <div className="fp-hero-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Wolf Point, Montana
          </div>
          <h1>Fort Peck Auto</h1>
          <p className="fp-hero-tagline">Auto Repair • Towing • Alignments • Used Auto Parts</p>
          <p className="fp-hero-location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {BUSINESS.location}
          </p>
          <div className="fp-hero-actions">
            <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={() => onNavigate('contact')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
              Request Service
            </button>
            <a className="fp-btn fp-btn-accent fp-btn-lg" href={BUSINESS.phoneHref}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call Now
            </a>
            <button className="fp-btn fp-btn-outline fp-btn-lg" onClick={() => onNavigate('portal')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Customer Portal
            </button>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="fp-section">
        <div className="fp-section-header">
          <span className="fp-eyebrow">Our Services</span>
          <h2>Full-Service Auto Shop</h2>
          <p>Professional automotive repair, towing, wheel alignments, and quality used OEM parts — all in one place.</p>
        </div>
        <div className="fp-services-grid">
          <div className="fp-service-card">
            <div className="fp-service-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <h3>Auto Repair</h3>
            <p>Professional automotive repair, diagnostics and maintenance.</p>
            <div className="fp-service-actions">
              <button className="fp-btn fp-btn-primary fp-btn-sm" onClick={() => onNavigate('repair')}>Request Service</button>
            </div>
          </div>

          <div className="fp-service-card">
            <div className="fp-service-icon orange">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h2l3-9 4 18 3-9h6"/></svg>
            </div>
            <h3>Towing</h3>
            <p>Professional towing and vehicle transport.</p>
            <div className="fp-service-actions">
              <a className="fp-btn fp-btn-accent fp-btn-sm" href={BUSINESS.phoneHref}>Call for Towing</a>
            </div>
          </div>

          <div className="fp-service-card">
            <div className="fp-service-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>
            </div>
            <div className="fp-service-sub">Now Offering</div>
            <h3>Wheel Alignments</h3>
            <p>Professional wheel alignment service using our Hunter system.</p>
            <div className="fp-service-equip">GEOLINER 770</div>
            <div className="fp-service-actions">
              <button className="fp-btn fp-btn-primary fp-btn-sm" onClick={() => onNavigate('alignment')}>Schedule Alignment</button>
            </div>
          </div>

          <div className="fp-service-card">
            <div className="fp-service-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div className="fp-service-sub">{BUSINESS.partsDivision}</div>
            <h3>Used Auto Parts</h3>
            <p>Quality used OEM automotive parts with nationwide shipping.</p>
            <div className="fp-service-actions">
              <button className="fp-btn fp-btn-primary fp-btn-sm" onClick={() => onNavigate('parts')}>Shop Parts</button>
              <button className="fp-btn fp-btn-outline fp-btn-sm" onClick={() => onNavigate('find-a-part')}>Find a Part</button>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PARTS */}
      <section className="fp-section fp-parts-section">
        <div className="fp-section-header">
          <span className="fp-eyebrow">{BUSINESS.partsDivision}</span>
          <h2>Shop Used Auto Parts</h2>
          <p>Browse our live eBay inventory — quality used OEM parts with nationwide shipping.</p>
        </div>

        {loadingFeatured ? (
          <div className="fp-loading"><div className="fp-spinner" /></div>
        ) : featured.length === 0 ? (
          <div className="fp-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <h3>Inventory Loading</h3>
            <p>Our parts inventory is being updated. Check back soon or use Find a Part to request a specific item.</p>
          </div>
        ) : (
          <>
            <div className="fp-parts-grid">
              {featured.map((item) => (
                <PartCard key={item.itemId} item={item} onClick={(id, it) => onViewProduct(id, it)} />
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="fp-btn fp-btn-primary" onClick={() => onNavigate('parts')}>View All Parts</button>
              <button className="fp-btn fp-btn-outline" style={{ marginLeft: 12 }} onClick={() => onNavigate('find-a-part')}>Find a Part</button>
            </div>
          </>
        )}
      </section>

      {/* CTA */}
      <section className="fp-cta">
        <h2>Need Service or Parts?</h2>
        <p>Call us at {BUSINESS.phone} — we're here to help.</p>
        <div className="fp-cta-actions">
          <a className="fp-btn fp-btn-primary fp-btn-lg" href={BUSINESS.phoneHref}>Call {BUSINESS.phone}</a>
          <button className="fp-btn fp-btn-outline fp-btn-lg" onClick={() => onNavigate('contact')}>Contact Us</button>
        </div>
      </section>
    </div>
  );
}
