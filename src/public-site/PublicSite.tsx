import { useState, useEffect } from 'react';
import { PublicLayout } from './Layout';
import { HomePage } from './pages/HomePage';
import { PartsPage } from './pages/PartsPage';
import { ProductPage } from './pages/ProductPage';
import { ServicePage } from './pages/ServicePage';
import { HoursPage } from './pages/HoursPage';
import { ContactPage } from './pages/ContactPage';
import { FindAPartPage } from './pages/FindAPartPage';
import type { PageId } from './types';
import type { EbayItem } from './ebayApi';
import { PortalApp } from './portal/PortalApp';

export function PublicSite() {
  const [page, setPage] = useState<PageId>('home');
  const [productItemId, setProductItemId] = useState<string | null>(null);
  const [productCachedItem, setProductCachedItem] = useState<EbayItem | null>(null);

  // Keep the app in sync with the URL hash, including direct links,
  // browser back/forward, and links such as /public-site#find-a-part.
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1);

      if (!hash) {
        setPage('home');
        setProductItemId(null);
        return;
      }

      if (hash.startsWith('product/')) {
        setProductItemId(hash.slice('product/'.length));
        setPage('product');
      } else if (hash === 'portal' || hash.startsWith('portal/') || hash.startsWith('portal?')) {
        setPage('portal');
      } else {
        setPage(hash as PageId);
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const navigate = (newPage: PageId) => {
    setPage(newPage);
    if (newPage === 'home') {
      window.location.hash = '';
    } else {
      window.location.hash = newPage;
    }
  };

  const viewProduct = (itemId: string, cachedItem?: EbayItem) => {
    setProductItemId(itemId);
    setProductCachedItem(cachedItem || null);
    setPage('product');
    window.location.hash = `product/${itemId}`;
    window.scrollTo(0, 0);
  };

  const renderPage = () => {
    switch (page) {
      case 'home':
        return <HomePage onNavigate={navigate} onViewProduct={viewProduct} />;
      case 'repair':
        return <ServicePage type="repair" onNavigate={navigate} />;
      case 'towing':
        return <ServicePage type="towing" onNavigate={navigate} />;
      case 'alignment':
        return <ServicePage type="alignment" onNavigate={navigate} />;
      case 'parts':
        return <PartsPage onViewProduct={viewProduct} />;
      case 'product':
        return productItemId ? (
          <ProductPage itemId={productItemId} cachedItem={productCachedItem} onBack={() => navigate('parts')} onNavigate={navigate} />
        ) : <PartsPage onViewProduct={viewProduct} />;
      case 'hours':
        return <HoursPage onNavigate={navigate} />;
      case 'contact':
        return <ContactPage onNavigate={navigate} />;
      case 'find-a-part':
        return <FindAPartPage />;
      case 'portal':
        return <PortalApp onBackToSite={() => navigate('home')} />;
      default:
        return <HomePage onNavigate={navigate} onViewProduct={viewProduct} />;
    }
  };

  return (
    <PublicLayout currentPage={page} onNavigate={navigate}>
      {renderPage()}
    </PublicLayout>
  );
}
