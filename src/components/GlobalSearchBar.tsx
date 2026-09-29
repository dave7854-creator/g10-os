import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, User, Car, FileText, Truck, Package, Wrench,
  DollarSign, AlertCircle, Loader2, ChevronRight,
} from 'lucide-react';
import type { Screen } from '@/types';
import type { AppEmployee } from '@/components/AppLock';
import { managerGlobalSearch, type SearchResults, type SearchResult } from '@/shop/managerApi';

interface GlobalSearchBarProps {
  employee: AppEmployee;
  onNavigate: (s: Screen) => void;
}

const CATEGORY_CONFIG: { key: string; label: string; icon: any; screen: Screen }[] = [
  { key: 'customers', label: 'Customers', icon: User, screen: 'customer-accounts' },
  { key: 'vehicles', label: 'Vehicles', icon: Car, screen: 'customer-accounts' },
  { key: 'work_orders', label: 'Work Orders', icon: Wrench, screen: 'shop' },
  { key: 'towing', label: 'Towing', icon: Truck, screen: 'towing' },
  { key: 'parts', label: 'Parts', icon: Package, screen: 'shop' },
  { key: 'salvage_parts', label: 'Salvage Parts', icon: Package, screen: 'inventory' },
  { key: 'salvage_vehicles', label: 'Salvage Vehicles', icon: Car, screen: 'vehicles' },
  { key: 'inquiries', label: 'Inquiries', icon: AlertCircle, screen: 'inquiries' },
  { key: 'ebay_listings', label: 'eBay Listings', icon: FileText, screen: 'ebay' },
];

export function GlobalSearchBar({ employee, onNavigate }: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults['results'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    try {
      setError('');
      const data = await managerGlobalSearch(employee.id, q);
      setResults(data.results || null);
    } catch {
      setError('Search failed. Try again.');
      setResults(null);
    }
    setLoading(false);
  }, [employee.id]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasResults = results && Object.values(results).some((arr) => arr && arr.length > 0);

  const handleResultClick = (result: SearchResult, category: string) => {
    setShowDropdown(false);
    setQuery('');
    setResults(null);
    const config = CATEGORY_CONFIG.find((c) => c.key === category);
    if (config) {
      onNavigate(config.screen);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search customers, vehicles, VINs, parts, work orders..."
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl pl-10 pr-10 py-3 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults(null); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X size={16} />
          </button>
        )}
        {loading && (
          <Loader2 size={16} className="absolute right-8 top-1/2 -translate-y-1/2 text-cyan-400 animate-spin" />
        )}
      </div>

      {showDropdown && (query.length >= 2) && (
        <div className="absolute top-full mt-2 w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 max-h-[70vh] overflow-y-auto z-50">
          {error && (
            <div className="px-4 py-3 text-sm text-red-300 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {!loading && !hasResults && query.length >= 2 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No results found for "{query}"
            </div>
          )}

          {hasResults && CATEGORY_CONFIG.map((cat) => {
            const catResults = (results as any)?.[cat.key];
            if (!catResults || catResults.length === 0) return null;
            const Icon = cat.icon;
            return (
              <div key={cat.key} className="py-2">
                <div className="px-4 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Icon size={12} /> {cat.label}
                </div>
                {catResults.map((r: SearchResult) => (
                  <button
                    key={`${cat.key}-${r.id}`}
                    onClick={() => handleResultClick(r, cat.key)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <Icon size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.label}</p>
                      <p className="text-xs text-slate-500 truncate">{r.sublabel}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
