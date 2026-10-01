import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Loader2,
  ScanSearch,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { lookupOemNumber } from '@/shop/researchService';
import type { OemLookupRequest, OemLookupResult } from '@/types';

interface OemLookupPanelProps {
  /** Pre-fill the OEM number (e.g. from the manual part-number input). */
  initialNumber?: string;
  /** Called when the user accepts an identified/selected number into the existing flow. */
  onUseNumber?: (oemNumber: string) => void;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  medium: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  low: 'text-red-300 border-red-500/30 bg-red-500/10',
};

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-slate-500 w-28 shrink-0 uppercase text-[9px] font-semibold pt-0.5">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

export function OemLookupPanel({ initialNumber = '', onUseNumber }: OemLookupPanelProps) {
  const [oemNumber, setOemNumber] = useState(initialNumber);
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [vin, setVin] = useState('');
  const [description, setDescription] = useState('');
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<OemLookupResult | null>(null);
  const [error, setError] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);

  const handleLookup = async () => {
    const num = oemNumber.trim();
    if (!num) {
      setError('Enter an OEM / manufacturer part number first.');
      return;
    }
    setLooking(true);
    setError('');
    setResult(null);
    try {
      const payload: OemLookupRequest = { oemNumber: num };
      const y = parseInt(year, 10);
      if (!Number.isNaN(y)) payload.year = y;
      if (make.trim()) payload.make = make.trim();
      if (model.trim()) payload.model = model.trim();
      if (vin.trim()) payload.vin = vin.trim();
      if (description.trim()) payload.description = description.trim();
      const res = await lookupOemNumber(payload);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OEM lookup failed');
    } finally {
      setLooking(false);
    }
  };

  const inputCls =
    'px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 w-full';

  return (
    <div className="p-2.5 bg-slate-800/40 rounded-xl space-y-2">
      <div className="flex items-center gap-2">
        <ScanSearch size={12} className="text-slate-500" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold">OEM Number Lookup</p>
      </div>
      <p className="text-[10px] text-slate-600">
        Identify a part from its OEM number — catalog sources first, then eBay data, then web fallback.
      </p>

      <input
        type="text"
        value={oemNumber}
        onChange={(e) => setOemNumber(e.target.value)}
        placeholder="OEM / MPN number (required) — e.g. 23228498"
        className={`${inputCls} font-mono`}
      />
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className={inputCls} />
        <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className={inputCls} />
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN (optional)" className={`${inputCls} font-mono`} />
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Part description (optional)" className={inputCls} />
      </div>

      <button
        onClick={handleLookup}
        disabled={looking}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
      >
        {looking ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
        {looking ? 'Identifying part…' : 'Identify Part'}
      </button>

      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {result.identified ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : (
              <XCircle size={14} className="text-amber-400" />
            )}
            <span className="text-sm text-white font-bold font-mono">{result.oemNumber || oemNumber}</span>
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[result.confidence]}`}>
              {result.confidence} confidence
            </span>
          </div>
          <p className="text-[10px] text-slate-500">{result.confidenceReason}</p>

          {result.identified && (
            <div className="space-y-1.5">
              <FactRow label="Manufacturer" value={result.manufacturer} />
              {result.partName && <FactRow label="Part" value={result.partName} />}
              {result.partType && <FactRow label="Type" value={result.partType} />}
              {result.supersededNumbers.length > 0 && (
                <FactRow label="Replaces" value={result.supersededNumbers.join(', ')} />
              )}
              {result.supersededBy && <FactRow label="Replaced by" value={result.supersededBy} />}
              {result.hollanderNumber && <FactRow label="Hollander #" value={result.hollanderNumber} />}
              {result.interchangeNumbers.length > 0 && (
                <FactRow label="Interchange" value={result.interchangeNumbers.join(', ')} />
              )}
              {result.applications.length > 0 && (
                <div className="flex gap-2 text-xs">
                  <span className="text-slate-500 w-28 shrink-0 uppercase text-[9px] font-semibold pt-0.5">Applications</span>
                  <ul className="text-slate-200 list-disc list-inside space-y-0.5">
                    {result.applications.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result.options.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-amber-300 uppercase font-semibold">
                Multiple matches — pick the one matching the physical part:
              </p>
              {result.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onUseNumber?.(result.oemNumber)}
                  className="w-full text-left p-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg"
                >
                  <p className="text-xs text-white font-semibold">{opt.partName}</p>
                  <p className="text-[10px] text-slate-500">
                    {opt.partType && `${opt.partType} · `}
                    {opt.supportCount} source{opt.supportCount === 1 ? '' : 's'} · {opt.sources.join(', ')}
                  </p>
                  {opt.applications.length > 0 && (
                    <p className="text-[10px] text-slate-400 truncate">{opt.applications[0]}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {result.degraded.length > 0 && (
            <div className="flex items-start gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-200/80">
                Limited sources: {result.degraded.join('; ')}
              </p>
            </div>
          )}

          {result.notes && <p className="text-[10px] text-slate-500">{result.notes}</p>}

          {result.evidence.length > 0 && (
            <div>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="text-[10px] text-slate-400 underline"
              >
                {showEvidence ? 'Hide' : 'Show'} source evidence ({result.evidence.length})
              </button>
              {showEvidence && (
                <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">
                  {result.evidence.map((e, i) => (
                    <div key={i} className="p-1.5 bg-slate-800/60 rounded-lg">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge color="slate">{e.fact}</Badge>
                        <span className="text-[11px] text-slate-200">{e.value}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{e.snippet}</p>
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        {e.sourceName} <ExternalLink size={9} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.identified && onUseNumber && (
            <button
              onClick={() => onUseNumber(result.oemNumber)}
              className="w-full px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg"
            >
              Use {result.oemNumber} in eBay research
            </button>
          )}
        </div>
      )}
    </div>
  );
}
