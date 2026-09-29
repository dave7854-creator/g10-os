import { useState, useEffect, useCallback } from 'react';
import { BUSINESS } from '../types';
import { searchInventory, getCategories, type EbayItem, type SortOption } from '../ebayApi';
import { PartCard } from '../PartCard';

interface PartsPageProps {
  onViewProduct: (itemId: string, cachedItem?: EbayItem) => void;
}

export function PartsPage({ onViewProduct }: PartsPageProps) {
  const [items, setItems] = useState<EbayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('BEST_MATCH');
  const [categoryId, setCategoryId] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const LIMIT = 24;

  const doSearch = useCallback(async (reset: boolean) => {
    if (reset) { setLoading(true); setOffset(0); }
    else setLoadingMore(true);
    setError('');

    try {
      const res = await searchInventory({
        q: query || undefined,
        sort,
        limit: LIMIT,
        offset: reset ? 0 : offset,
        categoryId: categoryId || undefined,
      });
      if (reset) {
        setItems(res.items);
      } else {
        setItems((prev) => [...prev, ...res.items]);
      }
      setTotal(res.total);
      setHasMore(res.hasNext);
      setOffset(reset ? res.offset + res.items.length : offset + res.items.length);
    } catch (err) {
      setError('Unable to load inventory. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query, sort, categoryId, offset]);

  useEffect(() => {
    getCategories().then((res) => setCategories(res.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(true), 300);
    return () => clearTimeout(timer);
  }, [query, sort, categoryId]);

  return (
    <div className="fp-anim-in" style={{ paddingTop: '90px' }}>
      <div className="fp-section" style={{ paddingTop: '20px' }}>
        {/* Header */}
        <div className="fp-section-header" style={{ marginBottom: '32px' }}>
          <span className="fp-eyebrow">{BUSINESS.partsDivision}</span>
          <h2>Used OEM Auto Parts</h2>
          <p>Browse our live inventory — quality used OEM parts with nationwide shipping. Powered by our eBay store.</p>
        </div>

        {/* Toolbar */}
        <div className="fp-store-toolbar">
          <div className="fp-store-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search inventory — e.g. Dodge Ram headlight, ECM, tail light..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="fp-store-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            <option value="BEST_MATCH">Best Match</option>
            <option value="NEWLY_LISTED">Newest</option>
            <option value="PRICE_PLUS_SHIPPING_ASC">Price: Low to High</option>
            <option value="PRICE_PLUS_SHIPPING_DESC">Price: High to Low</option>
          </select>
          <button
            className="fp-btn fp-btn-outline fp-btn-sm"
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: window.innerWidth <= 768 ? 'flex' : 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            Filters
          </button>
        </div>

        {/* Layout */}
        <div className="fp-store-layout">
          {/* Filters sidebar */}
          <div className={`fp-store-filters ${showFilters ? 'open' : ''}`}>
            <div className="fp-filter-group">
              <div className="fp-filter-label">Category</div>
              <select className="fp-filter-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>
                    {cat.categoryName} ({cat.itemCount})
                  </option>
                ))}
              </select>
            </div>
            <div className="fp-filter-group">
              <div className="fp-filter-label">Store</div>
              <div style={{ fontSize: '13px', color: 'var(--fp-text-dim)', lineHeight: 1.6 }}>
                {BUSINESS.partsDivision}<br />
                <a href={BUSINESS.ebayStoreUrl} target="_blank" rel="noopener" style={{ color: 'var(--fp-primary)', fontWeight: 600, fontSize: '13px' }}>
                  Visit eBay Store →
                </a>
              </div>
            </div>
          </div>

          {/* Results */}
          <div>
            {error && <div className="fp-error-banner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>{error}</div>}

            {!loading && (
              <div className="fp-store-results">
                {total > 0 ? `${total} part${total !== 1 ? 's' : ''} found` : ''}
              </div>
            )}

            {loading ? (
              <div className="fp-loading"><div className="fp-spinner" /></div>
            ) : items.length === 0 ? (
              <div className="fp-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <h3>No Parts Found</h3>
                <p>Try a different search term, or use our Find a Part form to request a specific part.</p>
              </div>
            ) : (
              <>
                <div className="fp-parts-grid">
                  {items.map((item) => (
                    <PartCard key={item.itemId} item={item} onClick={(id) => onViewProduct(id, item)} />
                  ))}
                </div>

                {hasMore && (
                  <div className="fp-store-loadmore">
                    <button
                      className="fp-btn fp-btn-outline"
                      onClick={() => doSearch(false)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
