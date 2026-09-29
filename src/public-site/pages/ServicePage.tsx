import { BUSINESS, type PageId } from '../types';

interface ServicePageProps {
  type: 'repair' | 'towing' | 'alignment';
  onNavigate: (page: PageId) => void;
}

export function ServicePage({ type, onNavigate }: ServicePageProps) {
  if (type === 'repair') {
    return (
      <div className="fp-anim-in">
        <div className="fp-repair-hero-image">
          <img
            src="/assets/images/ChatGPT_Image_Sep_16,_2026,_04_34_11_PM.png"
            alt="Mechanic working underneath a vehicle in an automotive repair shop"
            width="1536"
            height="1024"
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="fp-service-page-hero">
          <span className="fp-eyebrow">Professional Service</span>
          <h1>Auto Repair</h1>
          <p>Professional automotive repair, diagnostics, and maintenance in Wolf Point, Montana.</p>
          <div className="fp-service-page-actions">
            <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={() => onNavigate('contact')}>Request Service</button>
            <a className="fp-btn fp-btn-accent fp-btn-lg" href={BUSINESS.phoneHref}>Call {BUSINESS.phone}</a>
          </div>
        </div>
        <div className="fp-service-page-body">
          <h2>Professional Auto Repair</h2>
          <p>Fort Peck Auto provides professional automotive repair and maintenance services for vehicles of all makes and models. Our experienced technicians use modern diagnostic equipment to identify and fix issues accurately and efficiently.</p>

          <h2>What We Offer</h2>
          <ul>
            <li>Engine diagnostics and repair</li>
            <li>Brake service and repair</li>
            <li>Electrical system diagnostics</li>
            <li>Suspension and steering repair</li>
            <li>Transmission service</li>
            <li>Routine maintenance and inspections</li>
            <li>Heating and A/C service</li>
            <li>Exhaust system repair</li>
          </ul>

          <div className="fp-cta" style={{ margin: '40px -24px' }}>
            <h2>Ready to Schedule?</h2>
            <p>Call us to book your repair or request service online.</p>
            <div className="fp-cta-actions">
              <a className="fp-btn fp-btn-primary fp-btn-lg" href={BUSINESS.phoneHref}>Call {BUSINESS.phone}</a>
              <button className="fp-btn fp-btn-outline fp-btn-lg" onClick={() => onNavigate('contact')}>Request Service</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'towing') {
    return (
      <div className="fp-anim-in">
        <div className="fp-service-page-hero">
          <span className="fp-eyebrow">24/7 Towing Service</span>
          <h1>Towing</h1>
          <p>Professional towing and vehicle transport. Call us anytime.</p>
          <div className="fp-service-page-actions">
            <a className="fp-btn fp-btn-accent fp-btn-lg" href={BUSINESS.phoneHref}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call for Towing — {BUSINESS.phone}
            </a>
          </div>
        </div>
        <div className="fp-service-page-body">
          <h2>Professional Towing Services</h2>
          <p>Fort Peck Auto provides professional towing and vehicle transport services. Whether you need a vehicle moved across town or recovered from the roadside, our team is ready to help.</p>

          <h2>When to Call</h2>
          <ul>
            <li>Vehicle breakdown</li>
            <li>Accident recovery</li>
            <li>Vehicle transport</li>
            <li>Off-road recovery</li>
            <li>Equipment hauling</li>
          </ul>

          <div style={{
            background: 'var(--fp-surface)',
            border: '2px solid var(--fp-accent)',
            borderRadius: '16px',
            padding: '28px',
            textAlign: 'center',
            margin: '32px 0',
          }}>
            <p style={{ fontSize: '14px', color: 'var(--fp-text-dim)', marginBottom: '12px' }}>Need a tow right now?</p>
            <a className="fp-btn fp-btn-accent fp-btn-lg" href={BUSINESS.phoneHref} style={{ fontSize: '20px', fontWeight: 900 }}>
              CALL {BUSINESS.phone}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Alignment
  return (
    <div className="fp-anim-in">
      <div className="fp-service-page-hero">
        <span className="fp-eyebrow">Now Offering</span>
        <h1>Professional Wheel Alignments</h1>
        <p>Precision wheel alignment service using the Hofmann Geoliner 770 system.</p>
        <div className="fp-service-page-actions">
          <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={() => onNavigate('contact')}>Schedule Alignment</button>
          <a className="fp-btn fp-btn-outline fp-btn-lg" href={BUSINESS.phoneHref}>Call {BUSINESS.phone}</a>
        </div>
      </div>
      <div className="fp-service-page-body">
        <div className="fp-equipment-card">
          <div className="fp-equipment-name" style={{ color: 'var(--fp-primary)' }}>GEOLINER 770</div>
          <p className="fp-equipment-desc">Professional-grade wheel alignment system</p>
        </div>

        <h2>Precision Wheel Alignments</h2>
        <p>Fort Peck Auto uses the Hofmann Geoliner 770 computerized alignment system for accurate wheel alignment measurements and adjustments.</p>

        <div className="fp-video-section">
          <div className="fp-video-container">
            <iframe
              src="https://www.youtube.com/embed/OzKfG7z2c4U"
              title="Hofmann Geoliner 770 Wheel Alignment"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <p className="fp-video-caption">Hofmann Geoliner 770 Wheel Alignment</p>
          <button className="fp-btn fp-btn-primary fp-btn-lg" onClick={() => onNavigate('contact')}>Schedule an Alignment</button>
        </div>

        <h2>Signs You May Need an Alignment</h2>
        <ul>
          <li>Vehicle pulls to one side while driving</li>
          <li>Uneven or rapid tire wear</li>
          <li>Steering wheel is off-center when driving straight</li>
          <li>Vibration in the steering wheel</li>
          <li>After hitting a pothole or curb</li>
          <li>After suspension or steering repairs</li>
        </ul>

        <div className="fp-cta" style={{ margin: '40px -24px' }}>
          <h2>Schedule Your Alignment</h2>
          <p>Call us to book your alignment service today.</p>
          <div className="fp-cta-actions">
            <a className="fp-btn fp-btn-primary fp-btn-lg" href={BUSINESS.phoneHref}>Call {BUSINESS.phone}</a>
            <button className="fp-btn fp-btn-outline fp-btn-lg" onClick={() => onNavigate('contact')}>Schedule Online</button>
          </div>
        </div>
      </div>
    </div>
  );
}
