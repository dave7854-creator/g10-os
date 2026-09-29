import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

export interface NavTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ModuleNavProps {
  title: string;
  subtitle?: string;
  tabs: NavTab[];
  current: string;
  onNavigate: (id: string) => void;
  onExit?: () => void;
  exitLabel?: string;
}

export function ModuleNav({
  title,
  subtitle,
  tabs,
  current,
  onNavigate,
  onExit,
  exitLabel = 'Back to Home',
}: ModuleNavProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 flex-col z-40">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center">
              {tabs[0] && (() => {
                const Icon = tabs[0].icon;
                return <Icon size={18} className="text-white" />;
              })()}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{title}</p>
              {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
            </div>
          </div>
        </div>
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = current === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  active
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon size={18} strokeWidth={2.2} />
                {tab.label}
              </button>
            );
          })}
        </div>
        {onExit && (
          <div className="px-2 py-3 border-t border-slate-800">
            <button
              onClick={onExit}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all text-sm font-medium"
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
              {exitLabel}
            </button>
          </div>
        )}
      </nav>

      {/* Mobile / tablet bottom nav */}
      <div className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
        <div className="mx-2 mb-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl shadow-black/50 safe-bottom">
          <div className="flex items-center justify-around px-0.5 py-1.5 gap-0 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = current === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl transition-all active:scale-90 flex-shrink-0"
                >
                  <div
                    className={`p-1.5 rounded-lg transition-all ${
                      active
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                        : 'text-slate-500'
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  <span
                    className={`text-[9px] font-semibold transition-colors ${
                      active ? 'text-red-400' : 'text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
