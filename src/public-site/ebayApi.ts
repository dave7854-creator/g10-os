import { BUSINESS } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';
const FN_BASE = `${SUPABASE_URL}/functions/v1/ebay-api`;

export interface EbayItem {
  itemId: string;
  title: string;
  price: string | null;
  currency: string;
  image: string | null;
  condition: string;
  category: string | null;
  categoryId: string | null;
  itemWebUrl: string | null;
  shippingOptions: any[];
  buyingOptions: string[];
  itemLocation: any;
  estimatedAvailabilities: any[];
}

export interface EbayItemDetail extends EbayItem {
  images: string[];
  conditionDescription: string | null;
  shortDescription: string | null;
  description: string | null;
  brand: string | null;
  mpn: string | null;
  sku: string | null;
  productId: string | null;
  product: any;
  aspects: any[];
  compatibleVehicles: any[];
}

interface SearchResult {
  items: EbayItem[];
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  seller: string;
}

export type SortOption = 'BEST_MATCH' | 'NEWLY_LISTED' | 'PRICE_PLUS_SHIPPING_ASC' | 'PRICE_PLUS_SHIPPING_DESC';

export async function searchInventory(opts: {
  q?: string;
  sort?: SortOption;
  limit?: number;
  offset?: number;
  categoryId?: string;
}): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.sort) params.set('sort', opts.sort);
  params.set('limit', String(opts.limit ?? 24));
  params.set('offset', String(opts.offset ?? 0));
  if (opts.categoryId) params.set('category_id', opts.categoryId);

  const resp = await fetch(`${FN_BASE}/public/inventory?${params.toString()}`, {
    headers: { Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!resp.ok) throw new Error('Failed to search inventory');
  return resp.json();
}

export async function getItemDetail(itemId: string, cachedItem?: EbayItem): Promise<{ item: EbayItemDetail }> {
  const resp = await fetch(`${FN_BASE}/public/item?item_id=${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!resp.ok) {
    if (cachedItem) {
      return { item: { ...cachedItem, images: cachedItem.image ? [cachedItem.image] : [], conditionDescription: null, shortDescription: null, description: null, brand: null, mpn: null, sku: null, productId: null, product: null, aspects: [], compatibleVehicles: [] } };
    }
    throw new Error('Failed to load item');
  }
  const data = await resp.json();
  const item = data.item || {};
  if (cachedItem) {
    if (!item.images || item.images.length === 0) {
      item.images = cachedItem.image ? [cachedItem.image] : [];
    }
    if (!item.shippingOptions || item.shippingOptions.length === 0) {
      item.shippingOptions = cachedItem.shippingOptions || [];
    }
    if (!item.buyingOptions || item.buyingOptions.length === 0) {
      item.buyingOptions = cachedItem.buyingOptions || [];
    }
    if (!item.estimatedAvailabilities || item.estimatedAvailabilities.length === 0) {
      item.estimatedAvailabilities = cachedItem.estimatedAvailabilities || [];
    }
    if (!item.itemLocation) {
      item.itemLocation = cachedItem.itemLocation;
    }
    if (!item.itemWebUrl) {
      item.itemWebUrl = cachedItem.itemWebUrl;
    }
  }
  return { item };
}

export async function getCategories(): Promise<{ categories: any[] }> {
  const resp = await fetch(`${FN_BASE}/public/categories`, {
    headers: { Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!resp.ok) return { categories: [] };
  return resp.json();
}

export { BUSINESS };
