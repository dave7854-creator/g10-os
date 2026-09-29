import { useState, useEffect } from 'react';
import { getItemDetail, type EbayItemDetail, type EbayItem } from '../ebayApi';
import { BUSINESS, type PageId } from '../types';

interface ProductPageProps {
  itemId: string;
  cachedItem?: EbayItem | null;
  onBack: () => void;
  onNavigate: (page: PageId) => void;
}

export function ProductPage({ itemId, cachedItem, onBack, onNavigate }: ProductPageProps) {
  const [item, setItem] = useState<EbayItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    setActiveImg(0);
    getItemDetail(itemId, cachedItem || undefined)
      .then((res) => setItem(res.item))
      .catch(() => setError('Unable to load this item.'))
      .finally(() => setLoading(false));
  }, [itemId, cachedItem]);

  if (loading) {
    return (
      <div className="fp-anim-in" style={{ paddingTop: '100px' }}>
        <div className="fp-section">
          <div className="fp-loading"><div className="fp-spinner" /></div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="fp-anim-in" style={{ paddingTop: '100px' }}>
        <div className="fp-section">
          <button className="fp-back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7M19 12H5"/></svg>
            Back to Parts
          </button>
          <div className="fp-empty">
            <h3>Item Not Available</h3>
            <p>{error || 'This item may have been sold or removed.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const images = item.images?.length > 0 ? item.images : (item.image ? [item.image] : []);
  const shippingInfo = item.shippingOptions?.[0];
  const aspects = item.aspects || [];
  const stockInfo = item.estimatedAvailabilities?.[0];

  return (
    <div className="fp-anim-in" style={{ paddingTop: '90px' }}>
      <div className="fp-section" style={{ paddingTop: '20px' }}>
        <button className="fp-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7M19 12H5"/></svg>
          Back to Parts
        </button>

        <div className="fp-product-layout">
          {/* Gallery */}
          <div className="fp-product-gallery">
            <div className="fp-product-main-img">
              {images.length > 0 ? (
                <img src={images[activeImg]} alt={item.title} />
              ) : (
                <span style={{ color: 'var(--fp-text-faint)' }}>No image available</span>
              )}
            </div>
            {images.length > 1 && (
              <div className="fp-product-thumbs">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`fp-product-thumb ${activeImg === idx ? 'active' : ''}`}
                    onClick={() => setActiveImg(idx)}
                  >
                    <img src={img} alt={`Photo ${idx + 1}`} loading="lazy" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="fp-product-info">
            {item.category && (
              <div style={{ fontSize: '13px', color: 'var(--fp-primary)', fontWeight: 600, marginBottom: '8px' }}>
                {item.category}
              </div>
            )}
            <h1>{item.title}</h1>
            {item.price && (
              <div className="fp-product-price">${item.price}</div>
            )}

            <div className="fp-product-meta">
              <div className="fp-product-meta-row">
                <span className="fp-product-meta-label">Condition</span>
                <span className="fp-product-meta-value">{item.condition}</span>
              </div>
              {item.brand && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">Brand</span>
                  <span className="fp-product-meta-value">{item.brand}</span>
                </div>
              )}
              {item.mpn && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">Manufacturer Part #</span>
                  <span className="fp-product-meta-value">{item.mpn}</span>
                </div>
              )}
              {item.sku && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">SKU</span>
                  <span className="fp-product-meta-value">{item.sku}</span>
                </div>
              )}
              {stockInfo?.estimatedAvailableQuantity && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">Availability</span>
                  <span className="fp-product-meta-value">
                    {stockInfo.estimatedAvailableQuantity > 0 ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
              )}
              {shippingInfo?.shippingCost?.value && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">Shipping</span>
                  <span className="fp-product-meta-value">
                    {shippingInfo.shippingCost.value === '0.00' ? 'Free Shipping' : `$${shippingInfo.shippingCost.value}`}
                  </span>
                </div>
              )}
              {item.itemLocation && (
                <div className="fp-product-meta-row">
                  <span className="fp-product-meta-label">Item Location</span>
                  <span className="fp-product-meta-value">
                    {[item.itemLocation.city, item.itemLocation.stateOrProvince, item.itemLocation.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {item.conditionDescription && (
              <div className="fp-product-section">
                <h3>Condition Details</h3>
                <p>{item.conditionDescription}</p>
              </div>
            )}

            {item.shortDescription && (
              <div className="fp-product-section">
                <h3>Item Description</h3>
                <p>{item.shortDescription}</p>
              </div>
            )}

            {item.description && (
              <div className="fp-product-section">
                <h3>Details</h3>
                <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--fp-text-dim)' }} dangerouslySetInnerHTML={{ __html: item.description }} />
              </div>
            )}

            {aspects.length > 0 && (
              <div className="fp-product-section">
                <h3>Specifications</h3>
                <div className="fp-product-aspects">
                  {aspects.map((aspect: any, idx: number) => (
                    <div key={idx} className="fp-product-aspect">
                      <span className="fp-product-aspect-label">{aspect.name || aspect.localizedName}</span>
                      <span className="fp-product-aspect-value">
                        {Array.isArray(aspect.value) ? aspect.value.join(', ') : aspect.value || aspect.localizedValue}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.compatibleVehicles && item.compatibleVehicles.length > 0 && (
              <div className="fp-product-section">
                <h3>Vehicle Compatibility</h3>
                <ul>
                  {item.compatibleVehicles.slice(0, 20).map((v: any, idx: number) => (
                    <li key={idx}>
                      {[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}
                    </li>
                  ))}
                  {item.compatibleVehicles.length > 20 && (
                    <li style={{ color: 'var(--fp-text-faint)' }}>+ {item.compatibleVehicles.length - 20} more vehicles — see eBay listing for full compatibility</li>
                  )}
                </ul>
              </div>
            )}

            <div className="fp-product-buy">
              {item.itemWebUrl && (
                <a className="fp-btn fp-btn-accent fp-btn-lg" href={item.itemWebUrl} target="_blank" rel="noopener">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  Buy on eBay
                </a>
              )}
              <button className="fp-btn fp-btn-outline" style={{ marginLeft: 12 }} onClick={() => onNavigate('find-a-part')}>
                Can't Find This Part?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
