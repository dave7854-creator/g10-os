import { useState, useEffect } from 'react';
import { Delete, AlertCircle, Loader2 } from 'lucide-react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  error?: string;
  checking?: boolean;
  disabled?: boolean;
  maxLength?: number;
  autoSubmit?: boolean;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

const KEYS: { digit: string; letters?: string }[] = [
  { digit: '1' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
];

export function PinPad({
  onSubmit,
  error = '',
  checking = false,
  disabled = false,
  maxLength = 4,
  autoSubmit = true,
  title = 'Enter Passcode',
  subtitle = '',
  icon,
}: PinPadProps) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  const pressDigit = (d: string) => {
    if (disabled || checking) return;
    setPin((p) => {
      if (p.length >= maxLength) return p;
      const next = p + d;
      if (autoSubmit && next.length === maxLength) {
        onSubmit(next);
      }
      return next;
    });
  };

  const backspace = () => {
    if (disabled || checking) return;
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-start px-6 select-none pt-16">
      {/* Top section: icon + title + dots */}
      <div className="flex flex-col items-center justify-start w-full max-w-sm">
        {icon && (
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-5">
            {icon}
          </div>
        )}
        <h1 className="text-2xl font-semibold text-white mb-1">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm mb-8">{subtitle}</p>}
        {!subtitle && <div className="mb-8" />}

        {/* PIN dots */}
        <div className="flex justify-center gap-5 py-2">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > i
                  ? 'bg-red-500 border-red-500 scale-110'
                  : 'border-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Error / checking indicator */}
        <div className="h-8 mt-4 flex items-center justify-center">
          {error && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <AlertCircle size={15} className="text-red-400" />
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}
          {checking && <Loader2 size={20} className="text-red-500 animate-spin" />}
        </div>
      </div>

      {/* Keypad section */}
      <div className="w-full max-w-sm pb-10 safe-bottom">
        <div className="grid grid-cols-3 gap-x-6 gap-y-4 sm:gap-x-8 sm:gap-y-5">
          {KEYS.map((key) => (
            <button
              key={key.digit}
              onClick={() => pressDigit(key.digit)}
              disabled={disabled || checking}
              className="relative flex flex-col items-center justify-center aspect-square w-full max-w-[80px] mx-auto rounded-full bg-gray-900/80 active:bg-gray-800 active:scale-95 transition-all disabled:opacity-30"
            >
              <span className="text-3xl sm:text-4xl font-light text-white leading-none">{key.digit}</span>
              {key.letters && (
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-500 tracking-widest mt-0.5 h-3">
                  {key.letters}
                </span>
              )}
            </button>
          ))}

          {/* Bottom row: empty, 0, delete */}
          <div />
          <button
            onClick={() => pressDigit('0')}
            disabled={disabled || checking}
            className="flex items-center justify-center aspect-square w-full max-w-[80px] mx-auto rounded-full bg-gray-900/80 active:bg-gray-800 active:scale-95 transition-all disabled:opacity-30"
          >
            <span className="text-3xl sm:text-4xl font-light text-white leading-none">0</span>
          </button>
          <button
            onClick={backspace}
            disabled={disabled || checking}
            className="flex items-center justify-center aspect-square w-full max-w-[80px] mx-auto rounded-full active:scale-95 transition-all disabled:opacity-30"
          >
            <Delete size={26} className="text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
