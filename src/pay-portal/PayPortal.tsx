import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, CreditCard, Loader2, ArrowLeft, Wallet, Shield,
  Lock, AlertCircle, Building2, Car, Receipt, DollarSign, Link2, ExternalLink,
  Check, Copy,
} from 'lucide-react';

interface PaymentConfig {
  square_enabled: boolean;
  square_app_id: string | null;
  square_environment: string | null;
  square_location_id: string | null;
  square_display_name: string | null;
  paypal_enabled: boolean;
  paypal_client_id: string | null;
  paypal_display_name: string | null;
  venmo_enabled: boolean;
  venmo_link: string | null;
  venmo_display_name: string | null;
  cashapp_enabled: boolean;
  cashapp_link: string | null;
  cashapp_display_name: string | null;
  manual_link_enabled: boolean;
  manual_link_url: string | null;
  manual_link_display_name: string | null;
}

interface InvoiceData {
  invoice: {
    number: string;
    status: string;
    payment_status: string;
    date: string;
    labor_subtotal: number;
    parts_subtotal: number;
    shop_supplies: number;
    core_charges: number;
    tax: number;
    total: number;
    total_paid: number;
    balance_due: number;
  };
  customer: { name: string } | null;
  vehicle: {
    year: string | null; make: string | null; model: string | null;
    trim: string | null; engine: string | null; vin: string | null;
  } | null;
  operations: { description: string; hours: number; rate: number; total: number }[];
  parts: { description: string; price: number; core_charge: number }[];
  payments: { date: string; amount: number; method: string }[];
  payment_config: PaymentConfig | null;
}

type View = 'loading' | 'invoice' | 'payment' | 'success' | 'error';
type PaymentMethodId = 'square' | 'paypal' | 'venmo' | 'cashapp' | 'manual';

export function PayPortal() {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [view, setView] = useState<View>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [token, setToken] = useState('');

  const loadData = useCallback(async (t: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-portal/${t}`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? 'Failed to load invoice');
      }
      const json = await resp.json();
      setData(json);
      setView('invoice');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load invoice');
      setView('error');
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/pay\/invoice\/([A-Za-z0-9_-]+)/);
    const t = match ? match[1] : new URLSearchParams(window.location.search).get('token');
    if (t) {
      setToken(t);
      loadData(t);
    } else {
      setErrorMsg('No invoice token provided');
      setView('error');
    }
  }, [loadData]);

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-red-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Unable to Load Invoice</h1>
          <p className="text-slate-400 text-sm">{errorMsg}</p>
          <p className="text-slate-600 text-xs">Please contact the shop if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  if (view === 'success' && data) {
    return <SuccessView data={data} onBack={() => { setView('invoice'); loadData(token); }} />;
  }

  if (view === 'payment' && data) {
    return (
      <PaymentView
        data={data}
        token={token}
        onClose={() => setView('invoice')}
        onSuccess={() => setView('success')}
      />
    );
  }

  if (view === 'invoice' && data) {
    return <InvoiceView data={data} onPay={() => setView('payment')} />;
  }

  return null;
}

// ===== INVOICE VIEW =====
function InvoiceView({ data, onPay }: { data: InvoiceData; onPay: () => void }) {
  const inv = data.invoice;
  const balance = inv.balance_due;
  const isPaid = balance <= 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Building2 size={22} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Wolf Point Auto</h1>
              <p className="text-xs text-slate-500">123 Main Street · Wolf Point, MT 59201</p>
            </div>
          </div>
          {isPaid && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">Paid in Full</span>
            </div>
          )}
        </div>

        {/* Invoice meta card */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Invoice Number</p>
              <p className="text-xl font-bold">{inv.number}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Date</p>
              <p className="text-sm font-semibold">{new Date(inv.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Customer & Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.customer && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Billed To</p>
                <p className="text-sm font-semibold">{data.customer.name}</p>
              </div>
            )}
            {data.vehicle && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Vehicle</p>
                <div className="flex items-center gap-1.5">
                  <Car size={14} className="text-slate-500" />
                  <p className="text-sm font-semibold">
                    {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
                    {data.vehicle.trim ? ` ${data.vehicle.trim}` : ''}
                  </p>
                </div>
                {data.vehicle.engine && <p className="text-xs text-slate-500 mt-0.5">{data.vehicle.engine}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Labor line items */}
        {data.operations.length > 0 && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Labor</p>
            </div>
            <div className="divide-y divide-slate-800/60">
              {data.operations.map((op, i) => (
                <div key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{op.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{op.hours.toFixed(2)} hrs @ ${op.rate.toFixed(0)}/hr</p>
                  </div>
                  <p className="text-sm font-semibold flex-shrink-0">${op.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parts line items */}
        {data.parts.length > 0 && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Parts</p>
            </div>
            <div className="divide-y divide-slate-800/60">
              {data.parts.map((p, i) => (
                <div key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.description}</p>
                    {p.core_charge > 0 && <p className="text-xs text-slate-500 mt-0.5">Core charge: ${p.core_charge.toFixed(2)}</p>}
                  </div>
                  <p className="text-sm font-semibold flex-shrink-0">${p.price.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 p-5">
          <div className="space-y-2 ml-auto max-w-xs">
            <TotalRow label="Labor Subtotal" value={inv.labor_subtotal} />
            <TotalRow label="Parts Subtotal" value={inv.parts_subtotal} />
            {inv.shop_supplies > 0 && <TotalRow label="Shop Supplies" value={inv.shop_supplies} />}
            {inv.core_charges > 0 && <TotalRow label="Core Charges" value={inv.core_charges} />}
            {inv.tax > 0 && <TotalRow label="Tax" value={inv.tax} />}
            <div className="border-t border-slate-700/60 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Total</span>
                <span className="text-lg font-bold">${inv.total.toFixed(2)}</span>
              </div>
            </div>
            {inv.total_paid > 0 && (
              <>
                <TotalRow label="Payments Received" value={inv.total_paid} muted />
                <div className="border-t border-slate-700/60 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Balance Due</span>
                    <span className={`text-lg font-bold ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      ${inv.balance_due.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment history */}
        {data.payments.length > 0 && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment History</p>
            </div>
            <div className="divide-y divide-slate-800/60">
              {data.payments.map((p, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <Wallet size={14} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">${p.amount.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{p.method} · {new Date(p.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Make a Payment button — hidden when fully paid */}
        {!isPaid && (
          <button
            onClick={onPay}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-2xl py-4 text-base font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            <CreditCard size={20} />
            Make a Payment
          </button>
        )}

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-slate-600">
          <Shield size={12} />
          <p className="text-[10px]">Secure payment powered by your shop's payment provider</p>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-slate-500' : 'text-slate-400'}>{label}</span>
      <span className={`font-semibold ${muted ? 'text-slate-400' : 'text-white'}`}>${value.toFixed(2)}</span>
    </div>
  );
}

// ===== PAYMENT VIEW =====
function PaymentView({
  data, token, onClose, onSuccess,
}: {
  data: InvoiceData;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inv = data.invoice;
  const balance = inv.balance_due;
  const [amount, setAmount] = useState(String(balance.toFixed(2)));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [activeMethod, setActiveMethod] = useState<PaymentMethodId | null>(null);
  const [squareLoaded, setSquareLoaded] = useState(false);
  const [squarePayments, setSquarePayments] = useState<any>(null);
  const [squareCard, setSquareCard] = useState<any>(null);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [externalRedirected, setExternalRedirected] = useState(false);

  const config = data.payment_config;

  // Build list of available payment methods
  const methods: { id: PaymentMethodId; label: string; icon: React.ReactNode; color: string }[] = [];
  if (config?.square_enabled && config?.square_app_id) {
    methods.push({
      id: 'square',
      label: config.square_display_name || 'Credit/Debit Card',
      icon: <CreditCard size={20} />,
      color: 'bg-red-600',
    });
  }
  if (config?.paypal_enabled && config?.paypal_client_id) {
    methods.push({
      id: 'paypal',
      label: config.paypal_display_name || 'PayPal',
      icon: <Wallet size={20} />,
      color: 'bg-indigo-600',
    });
  }
  if (config?.venmo_enabled && config?.venmo_link) {
    methods.push({
      id: 'venmo',
      label: config.venmo_display_name || 'Venmo',
      icon: <Wallet size={20} />,
      color: 'bg-red-500',
    });
  }
  if (config?.cashapp_enabled && config?.cashapp_link) {
    methods.push({
      id: 'cashapp',
      label: config.cashapp_display_name || 'Cash App',
      icon: <DollarSign size={20} />,
      color: 'bg-emerald-600',
    });
  }
  if (config?.manual_link_enabled && config?.manual_link_url) {
    methods.push({
      id: 'manual',
      label: config.manual_link_display_name || 'Pay Online',
      icon: <Link2 size={20} />,
      color: 'bg-slate-600',
    });
  }

  // Auto-select first method
  useEffect(() => {
    if (methods.length > 0 && !activeMethod) {
      setActiveMethod(methods[0].id);
    }
  }, [methods.length, activeMethod]);

  // Load Square Web Payments SDK
  useEffect(() => {
    if (!config?.square_enabled || !config?.square_app_id) return;
    if (activeMethod !== 'square') return;

    const env = config.square_environment || 'sandbox';
    const sdkUrl = env === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js';

    if (document.getElementById('square-web-sdk')) {
      initSquare();
      return;
    }
    const script = document.createElement('script');
    script.id = 'square-web-sdk';
    script.src = sdkUrl;
    script.onload = () => { setSquareLoaded(true); initSquare(); };
    document.head.appendChild(script);

    function initSquare() {
      // @ts-ignore — Square SDK loaded via script tag
      const Square = window.Square;
      if (!Square || !config) return;
      try {
        const payments = Square.payments(config.square_app_id, config.square_location_id || undefined);
        setSquarePayments(payments);
      } catch (e) {
        setError('Unable to initialize Square payment form.');
      }
    }
  }, [config?.square_enabled, config?.square_app_id, config?.square_environment, config?.square_location_id, activeMethod]);

  // Initialize Square card when payments object is ready
  useEffect(() => {
    if (!squarePayments || activeMethod !== 'square') return;
    (async () => {
      try {
        const card = await squarePayments.card();
        card.attach('#square-card-container');
        setSquareCard(card);
      } catch (e) {
        // Square not fully configured
      }
    })();
    return () => {
      if (squareCard) {
        try { squareCard.detach(); } catch { /* noop */ }
        setSquareCard(null);
      }
    };
  }, [squarePayments, activeMethod]);

  // Load PayPal SDK
  useEffect(() => {
    if (!config?.paypal_enabled || !config?.paypal_client_id) return;
    if (activeMethod !== 'paypal') return;

    if (document.getElementById('paypal-sdk')) {
      renderPaypal();
      return;
    }
    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${config.paypal_client_id}&currency=USD&intent=capture`;
    script.onload = () => { setPaypalLoaded(true); renderPaypal(); };
    document.head.appendChild(script);

    function renderPaypal() {
      // @ts-ignore
      const paypal = window.paypal;
      if (!paypal) return;
      const container = document.getElementById('paypal-button-container');
      if (!container) return;
      container.innerHTML = '';
      paypal.Buttons({
        createOrder: async () => {
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-payment`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token,
              payment_token: 'pending',
              amount_cents: Math.round(parseFloat(amount) * 100),
              processor: 'paypal',
            }),
          });
          const result = await resp.json();
          return result.payment_id;
        },
        onApprove: async (details: any) => {
          setProcessing(true);
          setError('');
          try {
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-payment`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                token,
                payment_token: details.captureId ?? details.id,
                amount_cents: Math.round(parseFloat(amount) * 100),
                processor: 'paypal',
              }),
            });
            const result = await resp.json();
            if (!resp.ok || result.error) throw new Error(result.error ?? 'Payment failed');
            setProcessing(false);
            onSuccess();
          } catch (e) {
            setProcessing(false);
            setError(e instanceof Error ? e.message : 'Payment failed');
          }
        },
        onError: () => {
          setProcessing(false);
          setError('PayPal payment failed. Please try again.');
        },
      }).render('#paypal-button-container');
    }
  }, [config?.paypal_enabled, config?.paypal_client_id, activeMethod, amount, token, onSuccess]);

  const handleSquarePay = async () => {
    if (!squareCard) {
      setError('Payment system is loading. Please wait a moment and try again.');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0.5) {
      setError('Please enter a valid payment amount (minimum $0.50)');
      return;
    }
    if (amt > balance) {
      setError('Payment amount cannot exceed balance due');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const tokenResult = await squareCard.tokenize();
      if (tokenResult.status !== 'OK') {
        throw new Error(tokenResult.errors?.[0]?.message ?? 'Card information is invalid');
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          payment_token: tokenResult.token,
          amount_cents: Math.round(amt * 100),
          processor: 'square',
        }),
      });

      const result = await resp.json();
      if (!resp.ok || result.error) throw new Error(result.error ?? 'Payment failed');

      setProcessing(false);
      onSuccess();
    } catch (e) {
      setProcessing(false);
      setError(e instanceof Error ? e.message : 'Payment failed');
    }
  };

  const handleExternalPay = (url: string) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0.5) {
      setError('Please enter a valid payment amount (minimum $0.50)');
      return;
    }
    if (amt > balance) {
      setError('Payment amount cannot exceed balance due');
      return;
    }
    setExternalRedirected(true);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePayFull = () => {
    setAmount(String(balance.toFixed(2)));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        {/* Back button */}
        <button onClick={onClose} className="flex items-center gap-1 text-slate-400 text-sm hover:text-white transition-colors">
          <ArrowLeft size={18} /> Back to Invoice
        </button>

        {/* Payment summary — invoice details with balance due */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Receipt size={18} className="text-red-400" />
            <h1 className="text-lg font-bold">Payment for Invoice #{inv.number}</h1>
          </div>
          {data.customer && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Customer</span>
              <span className="font-semibold">{data.customer.name}</span>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Invoice Total</span>
              <span className="font-semibold">${inv.total.toFixed(2)}</span>
            </div>
            {inv.total_paid > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Previously Paid</span>
                <span className="font-semibold text-emerald-400">${inv.total_paid.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold border-t border-slate-700/60 pt-2">
              <span>Balance Due</span>
              <span className="text-amber-400">${balance.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Amount selector */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">Payment Amount</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
              <input
                type="number" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/50 rounded-xl pl-7 pr-3 py-3 text-white text-lg font-bold focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handlePayFull}
              className="mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Pay Full Balance (${balance.toFixed(2)})
            </button>
          </div>
        </div>

        {/* Payment methods */}
        {methods.length > 0 ? (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Payment Method</p>

            {/* Method selector tabs */}
            {methods.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setActiveMethod(m.id); setError(''); setExternalRedirected(false); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                      activeMethod === m.id ? `${m.color} text-white` : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Square card form */}
            {activeMethod === 'square' && (
              <div className="space-y-4">
                <div id="square-card-container" className="min-h-[120px]" />
                {error && <ErrorBox text={error} />}
                <button
                  onClick={handleSquarePay}
                  disabled={processing || !squareCard}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-3.5 text-base font-bold transition-all flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 size={18} className="animate-spin" /> Processing...</>
                  ) : (
                    <><Lock size={16} /> Pay ${parseFloat(amount || '0').toFixed(2)}</>
                  )}
                </button>
                <p className="text-[10px] text-slate-600 text-center">
                  Card information is securely processed by Square. We never see or store your card details.
                </p>
              </div>
            )}

            {/* PayPal buttons */}
            {activeMethod === 'paypal' && (
              <div className="space-y-3">
                <div id="paypal-button-container" className="min-h-[50px]" />
                {error && <ErrorBox text={error} />}
                <p className="text-[10px] text-slate-600 text-center">
                  PayPal will open a secure window to complete your payment.
                </p>
              </div>
            )}

            {/* Invoice reference banner above Venmo/Cash App */}
            {(activeMethod === 'venmo' || activeMethod === 'cashapp') && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <Receipt size={16} className="text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-300 font-semibold">
                  Reference: Invoice #{inv.number}
                </p>
              </div>
            )}

            {/* Venmo */}
            {activeMethod === 'venmo' && (
              <ExternalPaymentInfo
                label={config?.venmo_display_name || 'Venmo'}
                link={config?.venmo_link || ''}
                amount={amount}
                invoiceNumber={inv.number}
                onPay={() => {
                  const url = buildVenmoPayLink(config?.venmo_link || '');
                  handleExternalPay(url);
                }}
                redirected={externalRedirected}
                error={error}
              />
            )}

            {/* Cash App */}
            {activeMethod === 'cashapp' && (
              <ExternalPaymentInfo
                label={config?.cashapp_display_name || 'Cash App'}
                link={config?.cashapp_link || ''}
                amount={amount}
                invoiceNumber={inv.number}
                onPay={() => {
                  const url = buildCashAppPayLink(config?.cashapp_link || '');
                  handleExternalPay(url);
                }}
                redirected={externalRedirected}
                error={error}
              />
            )}

            {/* Manual Link */}
            {activeMethod === 'manual' && (
              <ExternalPaymentInfo
                label={config?.manual_link_display_name || 'Pay Online'}
                link={config?.manual_link_url || ''}
                amount={amount}
                onPay={() => handleExternalPay(config?.manual_link_url || '')}
                redirected={externalRedirected}
                error={error}
              />
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center mx-auto">
              <AlertCircle size={24} className="text-amber-400" />
            </div>
            <h2 className="text-lg font-bold">Online Payments Not Available</h2>
            <p className="text-sm text-slate-400">
              This shop hasn't enabled online payments yet. Please call (406) 555-0100 to make a payment over the phone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== PAYMENT LINK BUILDERS =====

function extractVenmoUsername(link: string): string {
  if (!link) return '';
  if (link.startsWith('@')) return link.slice(1);
  const match = link.match(/venmo\.com\/(?:u\/)?([^/?#]+)/i);
  if (match) return match[1];
  const paramMatch = link.match(/recipients=([^&]+)/i);
  if (paramMatch) return paramMatch[1];
  return link;
}

function buildVenmoPayLink(rawLink: string): string {
  const username = extractVenmoUsername(rawLink);
  if (!username) return rawLink;
  if (rawLink.startsWith('http')) return rawLink;
  return `https://venmo.com/${username}`;
}

function extractCashtag(link: string): string {
  if (!link) return '';
  if (link.startsWith('$')) return link.slice(1);
  const match = link.match(/cash\.app\/\$?([^/?#]+)/i);
  if (match) return match[1];
  return link;
}

function buildCashAppPayLink(rawLink: string): string {
  const cashtag = extractCashtag(rawLink);
  if (!cashtag) return rawLink;
  if (rawLink.startsWith('http')) return rawLink;
  return `https://cash.app/$${cashtag}`;
}

// ===== SHARED COMPONENTS =====

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
      <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
      <p className="text-xs text-red-300">{text}</p>
    </div>
  );
}

function ExternalPaymentInfo({ label, link, amount, invoiceNumber, onPay, redirected, error }: {
  label: string;
  link: string;
  amount: string;
  invoiceNumber?: string;
  onPay: () => void;
  redirected: boolean;
  error: string;
}) {
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);

  const copyAmount = () => {
    navigator.clipboard.writeText(amount).then(() => {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    });
  };

  const copyInvoice = () => {
    if (!invoiceNumber) return;
    navigator.clipboard.writeText(`Invoice #${invoiceNumber}`).then(() => {
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-xl">
        <ExternalLink size={18} className="text-slate-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-500 truncate">{link}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 bg-slate-800/40 rounded-xl">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Balance Due</p>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-sm font-bold text-amber-400">${parseFloat(amount || '0').toFixed(2)}</p>
            <button onClick={copyAmount} className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors">
              {copiedAmount ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
        </div>
        {invoiceNumber && (
          <div className="p-3 bg-slate-800/40 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Invoice #</p>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-sm font-bold text-white">{invoiceNumber}</p>
              <button onClick={copyInvoice} className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors">
                {copiedInvoice ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBox text={error} />}
      <button
        onClick={onPay}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3.5 text-base font-bold transition-all flex items-center justify-center gap-2"
      >
        <ExternalLink size={18} /> Open {label}
      </button>
      {redirected && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs text-amber-300 font-semibold">Payment page opened in a new tab</p>
          <p className="text-xs text-amber-400/70 mt-1">
            After completing your payment, please close this tab and return here.
            Your payment will be confirmed by our staff shortly — it is not automatically marked as paid.
          </p>
        </div>
      )}
      <p className="text-[10px] text-slate-600 text-center">
        You'll be redirected to {label} to complete your payment. Use the amount and invoice number above when sending your payment. Our staff will confirm your payment manually.
      </p>
    </div>
  );
}

// ===== SUCCESS VIEW =====
function SuccessView({ data, onBack }: { data: InvoiceData; onBack: () => void }) {
  const inv = data.invoice;
  const isFullyPaid = inv.balance_due <= 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Payment Successful</h1>
          <p className="text-slate-400 text-sm">
            {isFullyPaid
              ? `Your invoice ${inv.number} is now paid in full. Thank you!`
              : `Your payment has been applied to invoice ${inv.number}.`}
          </p>
        </div>

        {!isFullyPaid && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase font-semibold">Remaining Balance</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">${inv.balance_due.toFixed(2)}</p>
          </div>
        )}

        <button
          onClick={onBack}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-3 text-sm font-bold transition-colors"
        >
          Back to Invoice
        </button>
      </div>
    </div>
  );
}
