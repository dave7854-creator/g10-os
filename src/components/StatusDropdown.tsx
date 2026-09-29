import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { VehicleStatusConfig, VehicleStatus } from '@/types';

export function StatusDropdown({
  currentStatus,
  configs,
  onSelect,
  disabled = false,
}: {
  currentStatus: VehicleStatus;
  configs: VehicleStatusConfig[];
  onSelect: (status: string, config: VehicleStatusConfig) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = configs.find((c) => c.slug === currentStatus);
  const currentColor = current?.color ?? 'slate';

  const colorMap: Record<string, string> = {
    blue: 'bg-red-500/15 text-red-400 border-red-500/20',
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    slate: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${colorMap[currentColor]} ${disabled ? 'opacity-50' : 'active:scale-95'}`}
      >
        {current?.name ?? currentStatus}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-fade-in">
          {configs.map((config) => (
            <button
              key={config.id}
              onClick={() => {
                setOpen(false);
                onSelect(config.slug, config);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-slate-700/50 ${
                config.slug === currentStatus ? 'text-white font-semibold' : 'text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${colorMap[config.color].split(' ')[0]} ${colorMap[config.color].split(' ')[1]}`} />
                {config.name}
              </span>
              {config.slug === currentStatus && <Check size={16} className="text-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
