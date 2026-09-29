import { useState, useEffect } from 'react';
import { Loader2, Check, AlertTriangle, Phone } from 'lucide-react';
import { getMessagingConfig, updateMessagingConfig } from './messagingService';
import type { MessagingConfig } from './types';

export function MessagingSettings() {
  const [config, setConfig] = useState<MessagingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [provider, setProvider] = useState('telnyx');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await getMessagingConfig();
      if (cfg) {
        setConfig(cfg);
        setProvider(cfg.provider ?? 'telnyx');
        setPhoneNumber(cfg.phone_number ?? '');
        setIsActive(cfg.is_active ?? false);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const updates: Record<string, unknown> = {
      provider,
      phone_number: phoneNumber || null,
      is_active: isActive,
    };
    if (apiKey.trim()) updates.api_key = apiKey.trim();
    if (apiSecret.trim()) updates.api_secret = apiSecret.trim();

    const result = await updateMessagingConfig(updates as Parameters<typeof updateMessagingConfig>[0]);
    if (result) {
      setConfig(result);
      setApiKey('');
      setApiSecret('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError('Failed to save settings');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 size={16} className="text-red-400 animate-spin" />
        <p className="text-xs text-slate-500">Loading messaging settings...</p>
      </div>
    );
  }

  const connected = config?.is_active && config?.phone_number;

  return (
    <div className="space-y-3">
      {/* Connection status */}
      <div className={`p-3 rounded-xl border ${connected ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800/40 border-slate-700/40'}`}>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-300">Connected — {config?.provider === 'telnyx' ? 'Telnyx' : 'Twilio'}</p>
            </>
          ) : (
            <>
              <AlertTriangle size={14} className="text-slate-500" />
              <p className="text-xs font-semibold text-slate-400">Not Connected</p>
            </>
          )}
        </div>
        {config?.phone_number && (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <Phone size={10} /> {config.phone_number}
          </p>
        )}
      </div>

      {/* Provider selector */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">SMS Provider</p>
        <div className="grid grid-cols-2 gap-2">
          {['telnyx', 'twilio'].map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all active:scale-95 ${
                provider === p ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Phone number */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Business SMS Number</p>
        <input
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+1 555 000 0000"
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* API Key */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">
          API Key {config?.is_active && <span className="text-slate-600 normal-case font-normal">(enter new to replace)</span>}
        </p>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.is_active ? '••••••••••••' : 'Enter API key'}
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* API Secret (Twilio auth token) */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">
          API Secret / Auth Token {config?.is_active && <span className="text-slate-600 normal-case font-normal">(enter new to replace)</span>}
        </p>
        <input
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder={config?.is_active ? '••••••••••••' : 'Enter secret/token'}
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Active toggle */}
      <button
        onClick={() => setIsActive(!isActive)}
        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition-all ${
          isActive ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-800/60 border-slate-700/50 text-slate-400'
        }`}
      >
        <span className="text-sm font-semibold">Enable messaging (send/receive SMS)</span>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isActive ? 'bg-red-600 border-red-600' : 'border-slate-600'}`}>
          {isActive && <Check size={12} className="text-white" />}
        </div>
      </button>

      {/* Webhook info */}
      <div className="p-2.5 bg-slate-800/40 rounded-xl">
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Incoming SMS Webhook</p>
        <p className="text-xs text-slate-400">Configure your provider to send incoming SMS to:</p>
        <p className="text-xs text-red-400 font-mono mt-1 break-all">
          {import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-webhook
        </p>
      </div>

      {/* Save */}
      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
      {saved && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <p className="text-xs text-emerald-300 font-semibold">Settings saved successfully</p>
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {saving ? 'Saving...' : 'Save Messaging Settings'}
      </button>
    </div>
  );
}
