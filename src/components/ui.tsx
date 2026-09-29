import type { ReactNode } from 'react';
import { X } from 'lucide-react';


export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Responsive modal: bottom-sheet on mobile, centered dialog on desktop. */
export function Modal({
  title,
  children,
  onClose,
  maxWidth = 'lg:max-w-2xl',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className={`relative w-full max-w-md ${maxWidth} bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-800/60 border border-slate-700/50 rounded-2xl ${onClick ? 'cursor-pointer active:scale-[0.98] lg:hover:bg-slate-800/90 lg:hover:border-slate-600/60 transition-all' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  color = 'red',
}: {
  children: ReactNode;
  color?: 'red' | 'blue' | 'green' | 'amber' | 'slate' | 'cyan';
}) {
  const colors: Record<string, string> = {
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    blue: 'bg-red-500/15 text-red-400 border-red-500/20',
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    slate: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[color]}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-red-600 text-white active:bg-red-700 shadow-lg shadow-red-600/20',
    secondary: 'bg-slate-700/80 text-slate-100 active:bg-slate-600 border border-slate-600/50',
    ghost: 'bg-transparent text-slate-300 active:bg-slate-800',
    danger: 'bg-red-600 text-white active:bg-red-700 shadow-lg shadow-red-600/20',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-2 text-sm rounded-xl',
    md: 'px-4 py-3 text-sm rounded-xl',
    lg: 'px-5 py-3.5 text-base rounded-2xl',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.97] ${disabled ? 'opacity-40 pointer-events-none' : ''} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Responsive page container: mobile padding with bottom-nav clearance, desktop wider with top padding. */
export function ScreenContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

/** Responsive section grid: 1 col on mobile, 2 on sm, 3 on lg, 4 on xl. */
export function DataGrid({ children, cols }: { children: ReactNode; cols?: string }) {
  return (
    <div className={cols ?? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'}>
      {children}
    </div>
  );
}
