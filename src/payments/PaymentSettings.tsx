import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Wallet, DollarSign, Link2, Loader2, Check, ChevronLeft, AlertCircle, RefreshCw, Zap, Building2 } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { supabase } from '@/supabaseClient';

interface SquareLocation {
  id: string;
  name: string;
  label: string;
  status: string;
  capabilities: string[];
  card_processing: boolean;
}

interface SquareConnectionInfo {
  connected: boolean;
  merchant_name?: string;
  merchant_id?: string;
  country?: string;
  currency?: string;
  environment?: string;
  locations?: SquareLocation[];
  selected_location_id?: string | null;
  selected_location_still_active?: boolean;
  selected_location_name?: string | null;
  selected_location_active?: boolean;
  selected_location_capabilities?: string[];
  card_processing_supported?: boolean;
  error?: string;
}

interface PaypalConnectionInfo {
  connected: boolean;
  verified?: boolean;
  environment?: string;
  account_name?: string | null;
  account_email?: string | null;
  account_identity?: string;
  app_id?: string | null;
  error?: string;
}

async function testPaypalConnection(): Promise<PaypalConnectionInfo> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-test`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    return { connected: false, error: data.error || `HTTP ${resp.status}` };
  }
  return data as PaypalConnectionInfo;
}

async function callSquareLocations(action: 'all' | 'test' | 'refresh'): Promise<SquareConnectionInfo> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/square-locations?action=${action}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    return { connected: false, error: data.error || `HTTP ${resp.status}` };
  }
  return data as SquareConnectionInfo;
}

export interface PaymentConfig {
  id: number;
  square_enabled: boolean;
  square_location_id: string | null;
  square_location_name: string | null;
  square_app_id: string | null;
  square_environment: string | null;
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

export async function getPaymentConfig(): Promise<PaymentConfig | null> {
  const { data } = await supabase
    .from('shop_payment_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data as PaymentConfig | null;
}

type ProviderTab = 'overview' | 'square' | 'paypal' | 'venmo' | 'cashapp' | 'manual';

export function PaymentSettings({ onBack }: { onBack?: () => void }) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderTab>('overview');

  // Form state
  const [squareEnabled, setSquareEnabled] = useState(false);
  const [squareAppId, setSquareAppId] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');
  const [squareLocationName, setSquareLocationName] = useState('');
  const [squareAccessToken, setSquareAccessToken] = useState('');
  const [squareEnv, setSquareEnv] = useState('sandbox');
  const [squareDisplayName, setSquareDisplayName] = useState('Credit/Debit Card');

  // Square connection state
  const [squareConnection, setSquareConnection] = useState<SquareConnectionInfo | null>(null);
  const [squareLocations, setSquareLocations] = useState<SquareLocation[]>([]);
  const [testingSquare, setTestingSquare] = useState(false);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const [squareTestResult, setSquareTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalClientSecret, setPaypalClientSecret] = useState('');
  const [paypalDisplayName, setPaypalDisplayName] = useState('PayPal');

  // PayPal connection state
  const [paypalConnection, setPaypalConnection] = useState<PaypalConnectionInfo | null>(null);
  const [testingPaypal, setTestingPaypal] = useState(false);
  const [paypalTestResult, setPaypalTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [venmoEnabled, setVenmoEnabled] = useState(false);
  const [venmoLink, setVenmoLink] = useState('');
  const [venmoDisplayName, setVenmoDisplayName] = useState('Venmo');

  const [cashappEnabled, setCashappEnabled] = useState(false);
  const [cashappLink, setCashappLink] = useState('');
  const [cashappDisplayName, setCashappDisplayName] = useState('Cash App');

  const [manualEnabled, setManualEnabled] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('Pay Online');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    (async () => {
      const cfg = await getPaymentConfig();
      if (cfg) {
        setConfig(cfg);
        setSquareEnabled(cfg.square_enabled);
        setSquareAppId(cfg.square_app_id ?? '');
        setSquareLocationId(cfg.square_location_id ?? '');
        setSquareLocationName(cfg.square_location_name ?? '');
        setSquareEnv(cfg.square_environment ?? 'sandbox');
        setSquareDisplayName(cfg.square_display_name ?? 'Credit/Debit Card');
        setPaypalEnabled(cfg.paypal_enabled);
        setPaypalClientId(cfg.paypal_client_id ?? '');
        setPaypalDisplayName(cfg.paypal_display_name ?? 'PayPal');
        setVenmoEnabled(cfg.venmo_enabled);
        setVenmoLink(cfg.venmo_link ?? '');
        setVenmoDisplayName(cfg.venmo_display_name ?? 'Venmo');
        setCashappEnabled(cfg.cashapp_enabled);
        setCashappLink(cfg.cashapp_link ?? '');
        setCashappDisplayName(cfg.cashapp_display_name ?? 'Cash App');
        setManualEnabled(cfg.manual_link_enabled);
        setManualUrl(cfg.manual_link_url ?? '');
        setManualDisplayName(cfg.manual_link_display_name ?? 'Pay Online');
      }
      // Auto-test PayPal connection if credentials exist
      if (cfg?.paypal_client_id && cfg?.paypal_client_secret) {
        testPaypalConnection().then((info) => setPaypalConnection(info)).catch(() => {});
      }

      setLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTestPaypal = useCallback(async () => {
    setTestingPaypal(true);
    setPaypalTestResult(null);
    try {
      const info = await testPaypalConnection();
      setPaypalConnection(info);
      if (info.connected && info.verified) {
        const accountLine = info.account_identity && info.account_identity !== 'Not available from current API credentials'
          ? `Account: ${info.account_identity}`
          : 'Account Identity: Not available from current API credentials';
        setPaypalTestResult({ ok: true, message: `Connection: SUCCESS | Environment: ${info.environment || 'LIVE'} | ${accountLine}` });
      } else {
        setPaypalTestResult({ ok: false, message: info.error || 'PayPal connection failed.' });
      }
    } catch (err) {
      setPaypalTestResult({ ok: false, message: String(err) });
    }
    setTestingPaypal(false);
  }, []);

  const handleTestSquare = useCallback(async () => {
    setTestingSquare(true);
    setSquareTestResult(null);
    try {
      const info = await callSquareLocations('test');
      if (info.connected) {
        const locActive = info.selected_location_active;
        const cardOk = info.card_processing_supported;
        if (locActive === false) {
          setSquareTestResult({ ok: false, message: `Connected as "${info.merchant_name}", but the selected location is no longer active.` });
        } else if (cardOk === false) {
          setSquareTestResult({ ok: false, message: `Connected as "${info.merchant_name}", but the selected location does not support card processing.` });
        } else {
          setSquareTestResult({ ok: true, message: `Connected as "${info.merchant_name}". Location "${info.selected_location_name}" is active and supports card processing.` });
        }
      } else {
        setSquareTestResult({ ok: false, message: info.error || 'Square connection failed.' });
      }
    } catch (err) {
      setSquareTestResult({ ok: false, message: String(err) });
    }
    setTestingSquare(false);
  }, []);

  const handleRefreshLocations = useCallback(async () => {
    setRefreshingLocations(true);
    try {
      const info = await callSquareLocations('all');
      setSquareConnection(info);
      if (info.locations) setSquareLocations(info.locations);
      if (info.selected_location_id && info.selected_location_still_active === false) {
        setSquareLocationId('');
        setSquareLocationName('');
      }
    } catch {
      // non-fatal
    }
    setRefreshingLocations(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const updates: Record<string, unknown> = {
      id: 1,
      square_enabled: squareEnabled,
      square_app_id: squareAppId || null,
      square_environment: squareEnv,
      square_display_name: squareDisplayName,
      square_location_id: squareLocationId || null,
      square_location_name: squareLocationName || null,
      paypal_enabled: paypalEnabled,
      paypal_client_id: paypalClientId || null,
      paypal_display_name: paypalDisplayName,
      venmo_enabled: venmoEnabled,
      venmo_link: venmoLink || null,
      venmo_display_name: venmoDisplayName,
      cashapp_enabled: cashappEnabled,
      cashapp_link: cashappLink || null,
      cashapp_display_name: cashappDisplayName,
      manual_link_enabled: manualEnabled,
      manual_link_url: manualUrl || null,
      manual_link_display_name: manualDisplayName,
      updated_at: new Date().toISOString(),
    };
    if (squareAccessToken) updates.square_access_token = squareAccessToken;
    if (paypalClientSecret) updates.paypal_client_secret = paypalClientSecret;

    const { error } = await supabase.from('shop_payment_config').upsert(updates);

    if (error) {
      setSaving(false);
      setSaveError(error.message);
      return;
    }

    // Re-read to confirm persistence
    const confirmed = await getPaymentConfig();
    if (confirmed) {
      setConfig(confirmed);
      setSquareEnabled(confirmed.square_enabled);
      setSquareAppId(confirmed.square_app_id ?? '');
      setSquareLocationId(confirmed.square_location_id ?? '');
      setSquareLocationName(confirmed.square_location_name ?? '');
      setSquareEnv(confirmed.square_environment ?? 'sandbox');
      setSquareDisplayName(confirmed.square_display_name ?? 'Credit/Debit Card');
      setVenmoEnabled(confirmed.venmo_enabled);
      setVenmoLink(confirmed.venmo_link ?? '');
      setVenmoDisplayName(confirmed.venmo_display_name ?? 'Venmo');
      setCashappEnabled(confirmed.cashapp_enabled);
      setCashappLink(confirmed.cashapp_link ?? '');
      setCashappDisplayName(confirmed.cashapp_display_name ?? 'Cash App');
    }

    // Re-test PayPal connection after save if credentials exist
    if (paypalClientId && (paypalClientSecret || config?.paypal_client_id)) {
      testPaypalConnection().then((info) => setPaypalConnection(info)).catch(() => {});
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-red-400 animate-spin" />
      </div>
    );
  }

  const TABS: { id: ProviderTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'square', label: 'Square' },
    { id: 'paypal', label: 'PayPal' },
    { id: 'venmo', label: 'Venmo' },
    { id: 'cashapp', label: 'Cash App' },
    { id: 'manual', label: 'Manual Link' },
  ];

  const providerStatus = (enabled: boolean, connected: boolean): string => {
    if (connected && enabled) return 'Connected';
    if (enabled) return 'Enabled';
    return 'Not configured';
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-white">Payment Settings</h1>
        </div>
      )}

      <p className="text-sm text-slate-400">
        Configure payment methods for customer invoices. These settings apply across Shop, Towing, and Parts.
      </p>

      {/* Provider tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.id ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab — compact status summary */}
      {activeTab === 'overview' && (
        <div className="space-y-2">
          {[
            { label: 'Square', status: providerStatus(squareEnabled, !!config?.square_location_id), icon: <CreditCard size={18} className="text-slate-300" />, iconBg: 'bg-red-500/15', tab: 'square' as ProviderTab },
            { label: 'PayPal', status: providerStatus(paypalEnabled, !!config?.paypal_client_id), icon: <Wallet size={18} className="text-slate-300" />, iconBg: 'bg-indigo-500/15', tab: 'paypal' as ProviderTab },
            { label: 'Venmo', status: providerStatus(venmoEnabled, !!config?.venmo_link), icon: <Wallet size={18} className="text-slate-300" />, iconBg: 'bg-red-500/15', tab: 'venmo' as ProviderTab },
            { label: 'Cash App', status: providerStatus(cashappEnabled, !!config?.cashapp_link), icon: <DollarSign size={18} className="text-slate-300" />, iconBg: 'bg-emerald-500/15', tab: 'cashapp' as ProviderTab },
            { label: 'Manual Link', status: providerStatus(manualEnabled, !!config?.manual_link_url), icon: <Link2 size={18} className="text-slate-300" />, iconBg: 'bg-slate-600/40', tab: 'manual' as ProviderTab },
          ].map((row) => (
            <button
              key={row.label}
              onClick={() => setActiveTab(row.tab)}
              className="w-full flex items-center gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl hover:border-slate-700 hover:bg-slate-800/60 transition-all text-left"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${row.iconBg}`}>
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{row.label}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                row.status === 'Connected' ? 'bg-emerald-500/15 text-emerald-400' :
                row.status === 'Enabled' ? 'bg-amber-500/15 text-amber-400' :
                'bg-slate-700/50 text-slate-500'
              }`}>
                {row.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Square tab */}
      {activeTab === 'square' && (
        <PaymentMethodCard
          icon={<CreditCard size={20} className="text-slate-300" />}
          title="Square — Credit/Debit Card"
          subtitle={squareEnabled ? 'Enabled — secure card payments via Square' : 'Not enabled'}
          enabled={squareEnabled}
          onToggle={setSquareEnabled}
          connected={!!config?.square_location_id}
        >
          {squareConnection?.connected ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
              <Building2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">Square Connection: CONNECTED</p>
                <p className="text-xs text-emerald-400/70">Connected Account: {squareConnection.merchant_name}</p>
                <p className="text-xs text-emerald-400/70">Environment: {squareConnection.environment || 'production'}</p>
              </div>
            </div>
          ) : squareConnection?.error ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-300">Square Connection: NOT CONNECTED</p>
                <p className="text-xs text-red-400/70">{squareConnection.error}</p>
              </div>
            </div>
          ) : null}

          <TextInput label="Display Name" value={squareDisplayName} onChange={setSquareDisplayName} placeholder="Credit/Debit Card" />
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Environment</label>
            <div className="grid grid-cols-2 gap-1">
              {['sandbox', 'production'].map((env) => (
                <button
                  key={env}
                  onClick={() => setSquareEnv(env)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                    squareEnv === env ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Square Location</label>
            {squareLocations.length > 0 ? (
              <select
                value={squareLocationId}
                onChange={(e) => {
                  const loc = squareLocations.find((l) => l.id === e.target.value);
                  setSquareLocationId(e.target.value);
                  setSquareLocationName(loc?.label || loc?.name || '');
                }}
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
              >
                <option value="">Select Location</option>
                {squareLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label}
                  </option>
                ))}
              </select>
            ) : squareConnection?.connected ? (
              <p className="text-xs text-slate-500 py-2">No active locations found. Click Refresh Locations to retry.</p>
            ) : (
              <p className="text-xs text-slate-500 py-2">Save your Square Access Token and click Refresh Locations to load available locations.</p>
            )}
            {squareLocationName && squareLocationId && (
              <p className="text-[10px] text-slate-600 mt-1">Selected: {squareLocationName}</p>
            )}
          </div>

          <TextInput label="Square App ID (public)" value={squareAppId} onChange={setSquareAppId} placeholder="sandbox-xxxx or sq0idp-xxxx" />
          <p className="text-[10px] text-slate-600">The App ID is safe to expose in the customer payment page — it's used to load the Square card form.</p>
          <TextInput
            label={`Square Access Token ${config?.square_location_id ? '(enter new to replace)' : ''}`}
            value={squareAccessToken}
            onChange={setSquareAccessToken}
            placeholder="EAAAl..."
            type="password"
          />
          <p className="text-[10px] text-slate-600">Stored securely on the server only. Never exposed to the frontend.</p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTestSquare}
              disabled={testingSquare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {testingSquare ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Test Connection
            </button>
            <button
              onClick={handleRefreshLocations}
              disabled={refreshingLocations}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {refreshingLocations ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh Locations
            </button>
          </div>

          {squareTestResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${squareTestResult.ok ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300' : 'bg-red-950/40 border border-red-800/40 text-red-300'}`}>
              {squareTestResult.ok ? <Check size={14} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
              <span>{squareTestResult.message}</span>
            </div>
          )}
        </PaymentMethodCard>
      )}

      {/* PayPal tab */}
      {activeTab === 'paypal' && (
        <PaymentMethodCard
          icon={<Wallet size={20} className="text-slate-300" />}
          title="PayPal"
          subtitle={paypalEnabled ? 'Enabled — PayPal checkout active' : 'Not enabled'}
          enabled={paypalEnabled}
          onToggle={setPaypalEnabled}
          connected={!!config?.paypal_client_id}
        >
          {paypalConnection?.connected ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
              <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">PayPal: {paypalConnection.verified ? 'CONNECTED' : 'VERIFIED'}</p>
                <p className="text-xs text-emerald-400/70">Environment: {paypalConnection.environment || 'LIVE'}</p>
                <p className="text-xs text-emerald-400/70">Connected Account: {paypalConnection.account_identity || 'Not available from current API credentials'}</p>
                {paypalConnection.account_email && (
                  <p className="text-xs text-emerald-400/70">Email: {paypalConnection.account_email}</p>
                )}
                {paypalConnection.app_id && (
                  <p className="text-xs text-emerald-400/70">App ID: {paypalConnection.app_id}</p>
                )}
              </div>
            </div>
          ) : paypalConnection?.error ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-300">PayPal: NOT CONNECTED</p>
                <p className="text-xs text-red-400/70">{paypalConnection.error}</p>
              </div>
            </div>
          ) : config?.paypal_client_id ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
              <Loader2 size={16} className="text-slate-400 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-300">PayPal: Verifying connection...</p>
                <p className="text-xs text-slate-500">Credentials saved — testing connection to PayPal.</p>
              </div>
            </div>
          ) : null}

          <TextInput label="Display Name" value={paypalDisplayName} onChange={setPaypalDisplayName} placeholder="PayPal" />
          <TextInput label="PayPal Client ID" value={paypalClientId} onChange={setPaypalClientId} placeholder="AY..." />
          <TextInput
            label={`PayPal Client Secret ${config?.paypal_client_id ? '(enter new to replace)' : ''}`}
            value={paypalClientSecret}
            onChange={setPaypalClientSecret}
            placeholder="EH..."
            type="password"
          />
          <p className="text-[10px] text-slate-600">Stored securely on the server only. Never exposed to the browser.</p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTestPaypal}
              disabled={testingPaypal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {testingPaypal ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Test PayPal Connection
            </button>
          </div>

          {paypalTestResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${paypalTestResult.ok ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300' : 'bg-red-950/40 border border-red-800/40 text-red-300'}`}>
              {paypalTestResult.ok ? <Check size={14} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
              <span>{paypalTestResult.message}</span>
            </div>
          )}
        </PaymentMethodCard>
      )}

      {/* Venmo tab */}
      {activeTab === 'venmo' && (
        <PaymentMethodCard
          icon={<Wallet size={20} className="text-slate-300" />}
          title="Venmo"
          subtitle={venmoEnabled ? 'Enabled — Venmo link shown on invoices' : 'Not enabled'}
          enabled={venmoEnabled}
          onToggle={setVenmoEnabled}
          connected={!!config?.venmo_link}
        >
          {config?.venmo_enabled && config?.venmo_link && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
              <Check size={14} className="text-emerald-400 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-emerald-300">Venmo: ENABLED</span>
                <span className="text-emerald-400/70 ml-2">Account: {config.venmo_link}</span>
              </div>
            </div>
          )}
          <TextInput label="Display Name" value={venmoDisplayName} onChange={setVenmoDisplayName} placeholder="Venmo" />
          <TextInput label="Venmo Link or @Username" value={venmoLink} onChange={setVenmoLink} placeholder="@yourshop or https://venmo.com/yourshop" />
          <p className="text-[10px] text-slate-600">Customers will be directed to Venmo to complete payment. Staff must manually confirm these payments.</p>
        </PaymentMethodCard>
      )}

      {/* Cash App tab */}
      {activeTab === 'cashapp' && (
        <PaymentMethodCard
          icon={<DollarSign size={20} className="text-slate-300" />}
          title="Cash App"
          subtitle={cashappEnabled ? 'Enabled — Cash App link shown on invoices' : 'Not enabled'}
          enabled={cashappEnabled}
          onToggle={setCashappEnabled}
          connected={!!config?.cashapp_link}
        >
          {config?.cashapp_enabled && config?.cashapp_link && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
              <Check size={14} className="text-emerald-400 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-emerald-300">Cash App: ENABLED</span>
                <span className="text-emerald-400/70 ml-2">Account: {config.cashapp_link}</span>
              </div>
            </div>
          )}
          <TextInput label="Display Name" value={cashappDisplayName} onChange={setCashappDisplayName} placeholder="Cash App" />
          <TextInput label="Cash App Link or $Cashtag" value={cashappLink} onChange={setCashappLink} placeholder="$yourshop or https://cash.app/$yourshop" />
          <p className="text-[10px] text-slate-600">Customers will be directed to Cash App to complete payment. Staff must manually confirm these payments.</p>
        </PaymentMethodCard>
      )}

      {/* Manual Link tab */}
      {activeTab === 'manual' && (
        <PaymentMethodCard
          icon={<Link2 size={20} className="text-slate-300" />}
          title="Manual Payment Link"
          subtitle={manualEnabled ? 'Enabled — custom link shown on invoices' : 'Not enabled'}
          enabled={manualEnabled}
          onToggle={setManualEnabled}
          connected={!!config?.manual_link_url}
        >
          <TextInput label="Display Name" value={manualDisplayName} onChange={setManualDisplayName} placeholder="Pay Online" />
          <TextInput label="Payment URL" value={manualUrl} onChange={setManualUrl} placeholder="https://your-payment-page.com/checkout" />
          <p className="text-[10px] text-slate-600">Use this for any other payment provider with a direct checkout link.</p>
        </PaymentMethodCard>
      )}

      {/* Save button — always visible across all tabs */}
      {activeTab !== 'overview' && (
        <>
          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <Button onClick={handleSave} size="lg" className="w-full" disabled={saving}
            icon={saved ? <Check size={20} className="text-emerald-400" /> : saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}>
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Payment Settings'}
          </Button>
        </>
      )}
    </div>
  );
}

// ===== Helper Components =====
function PaymentMethodCard({
  icon, title, subtitle, enabled, onToggle, connected, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  connected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled ? 'bg-red-500/15' : 'bg-slate-700/50'}`}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="space-y-2 pt-2 border-t border-slate-700/40">
          {children}
        </div>
      )}
    </Card>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function TextInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
      />
    </div>
  );
}
