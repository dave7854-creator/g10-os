import { useState, useEffect } from 'react';
import { Loader2, Check, ChevronLeft, ExternalLink, Key, Zap, Link2, RefreshCw, AlertCircle, Eye, Pencil } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { supabase } from '@/supabaseClient';

const EBAY_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-api`;

interface PolicyOption {
  id: string;
  name: string;
}

interface PolicyError {
  type: string;
  status: number;
  message?: string;
  errors?: Array<{ message: string; errorId?: number }>;
}

interface PolicyDetails {
  [key: string]: unknown;
}

export function EbaySettings({ onBack }: { onBack?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [ruName, setRuName] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [merchantName, setMerchantName] = useState('Fort Peck Auto');
  const [handlingTime, setHandlingTime] = useState(2);
  const [returnPolicyId, setReturnPolicyId] = useState('');
  const [fulfillmentPolicyId, setFulfillmentPolicyId] = useState('');
  const [paymentPolicyId, setPaymentPolicyId] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [returnPolicies, setReturnPolicies] = useState<PolicyOption[]>([]);
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<PolicyOption[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<PolicyOption[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ type: 'success' | 'error' | 'pending'; message: string } | null>(null);
  const [ebayUsername, setEbayUsername] = useState<string | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<{ type: string; id: string; name: string } | null>(null);
  const [policyDetails, setPolicyDetails] = useState<PolicyDetails | null>(null);
  const [policyDetailsLoading, setPolicyDetailsLoading] = useState(false);
  const [policyDetailsError, setPolicyDetailsError] = useState<string | null>(null);

  const fetchIdentity = async () => {
    try {
      const resp = await fetch(`${EBAY_API_URL}/oauth/identity`);
      const data = await resp.json();
      if (data.connected) {
        setHasRefreshToken(true);
        setEbayUsername(data.username || null);
      } else {
        setEbayUsername(null);
      }
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ebay_config')
        .select('id, environment, merchant_name, default_handling_time, default_return_policy, auto_publish, client_id, ru_name, refresh_token, default_fulfillment_policy_id, default_payment_policy_id')
        .eq('id', 1)
        .maybeSingle();
      if (data) {
        setEnvironment(data.environment || 'production');
        setMerchantName(data.merchant_name || 'Fort Peck Auto');
        setHandlingTime(data.default_handling_time ?? 2);
        setReturnPolicyId(data.default_return_policy || '');
        setFulfillmentPolicyId(data.default_fulfillment_policy_id || '');
        setPaymentPolicyId(data.default_payment_policy_id || '');
        setAutoPublish(data.auto_publish ?? false);
        setClientId(data.client_id || '');
        setRuName(data.ru_name || '');
        setHasRefreshToken(!!data.refresh_token);
      }
      setLoaded(true);
      if (data?.refresh_token) {
        fetchIdentity();
        fetchPolicies();
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const connected = params.get('connected');
    const oauthError = params.get('error');

    if (connected === 'true') {
      setOauthStatus({ type: 'pending', message: 'eBay account connected. Verifying authentication...' });
      window.history.replaceState({}, document.title, window.location.pathname);
      (async () => {
        try {
          const testResp = await fetch(`${EBAY_API_URL}/oauth/test`);
          const testData = await testResp.json();
          if (testData.access_token_test === 'SUCCESS') {
            setHasRefreshToken(true);
            setOauthStatus({ type: 'success', message: 'eBay account connected and authentication verified.' });
            fetchIdentity();
            fetchPolicies();
          } else {
            setOauthStatus({ type: 'error', message: `Connected but token test failed: ${testData.error || 'Unknown error'}` });
          }
        } catch (err) {
          setOauthStatus({ type: 'error', message: err instanceof Error ? err.message : 'Verification failed' });
        }
      })();
      return;
    }

    if (oauthError) {
      setOauthStatus({ type: 'error', message: `eBay authorization was denied: ${oauthError}` });
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code) {
      setConnecting(true);
      setOauthStatus({ type: 'pending', message: 'Exchanging authorization code for tokens...' });
      (async () => {
        try {
          const resp = await fetch(`${EBAY_API_URL}/oauth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Token exchange failed');

          setHasRefreshToken(true);
          setOauthStatus({ type: 'success', message: 'eBay account connected successfully. Refresh token stored.' });

          setOauthStatus({ type: 'pending', message: 'Testing authentication...' });
          const testResp = await fetch(`${EBAY_API_URL}/oauth/test`);
          const testData = await testResp.json();
          if (testData.access_token_test === 'SUCCESS') {
            setOauthStatus({ type: 'success', message: 'eBay account connected and authentication verified.' });
            fetchIdentity();
            fetchPolicies();
          } else {
            setOauthStatus({ type: 'error', message: `Connected but token test failed: ${testData.error || 'Unknown error'}` });
          }
        } catch (err) {
          setOauthStatus({ type: 'error', message: err instanceof Error ? err.message : 'OAuth callback failed' });
        } finally {
          setConnecting(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      })();
    }
  }, []);

  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    setPoliciesError(null);
    try {
      const resp = await fetch(`${EBAY_API_URL}/policies`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch policies');

      setReturnPolicies((data.returnPolicies || []).map((p: any) => ({ id: p.returnPolicyId, name: p.name })));
      setFulfillmentPolicies((data.fulfillmentPolicies || []).map((p: any) => ({ id: p.fulfillmentPolicyId, name: p.name })));
      setPaymentPolicies((data.paymentPolicies || []).map((p: any) => ({ id: p.paymentPolicyId, name: p.name })));

      if (data.errors) {
        const errorParts: string[] = [];
        for (const [type, err] of Object.entries(data.errors)) {
          const e = err as PolicyError;
          const ebayMsg = e.errors?.map((er) => er.message).join('; ') || e.message || `HTTP ${e.status}`;
          errorParts.push(`${type}: ${ebayMsg}`);
        }
        if (errorParts.length > 0) {
          setPoliciesError(errorParts.join(' | '));
        }
      }
    } catch (err) {
      setPoliciesError(err instanceof Error ? err.message : 'Failed to load eBay policies');
    } finally {
      setPoliciesLoading(false);
    }
  };

  const handleViewPolicyDetails = async (type: string, id: string, name: string) => {
    setViewingPolicy({ type, id, name });
    setPolicyDetails(null);
    setPolicyDetailsError(null);
    setPolicyDetailsLoading(true);
    try {
      const resp = await fetch(`${EBAY_API_URL}/policy-details?type=${type}&id=${encodeURIComponent(id)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch policy details');
      setPolicyDetails(data.policy || null);
    } catch (err) {
      setPolicyDetailsError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setPolicyDetailsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: Record<string, unknown> = {
      id: 1,
      environment,
      merchant_name: merchantName,
      default_handling_time: handlingTime,
      default_return_policy: returnPolicyId || null,
      default_fulfillment_policy_id: fulfillmentPolicyId || null,
      default_payment_policy_id: paymentPolicyId || null,
      auto_publish: autoPublish,
      client_id: clientId || null,
      ru_name: ruName || null,
      updated_at: new Date().toISOString(),
    };
    if (clientSecret) updates.client_secret = clientSecret;

    await supabase.from('ebay_config').upsert(updates);
    setSaving(false);
    setSaved(true);
    setClientSecret('');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnectEbay = async () => {
    setConnecting(true);
    setOauthStatus(null);
    try {
      const returnTo = `${window.location.origin}/app.html`;
      const resp = await fetch(`${EBAY_API_URL}/oauth/init?return_to=${encodeURIComponent(returnTo)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to start OAuth flow');
      window.location.href = data.authUrl;
    } catch (err) {
      setOauthStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to start OAuth' });
      setConnecting(false);
    }
  };

  const handleTestAuth = async () => {
    setConnecting(true);
    setOauthStatus({ type: 'pending', message: 'Testing eBay authentication...' });
    try {
      const resp = await fetch(`${EBAY_API_URL}/oauth/test`);
      const data = await resp.json();
      if (data.access_token_test === 'SUCCESS') {
        setOauthStatus({ type: 'success', message: `Authentication verified on ${data.environment}.` });
        fetchIdentity();
        fetchPolicies();
      } else {
        setHasRefreshToken(false);
        setOauthStatus({ type: 'error', message: data.error || data.message || 'Authentication failed' });
      }
    } catch (err) {
      setOauthStatus({ type: 'error', message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setConnecting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-red-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-white">eBay Motors Settings</h1>
        </div>
      )}

      <p className="text-sm text-slate-400">
        Configure your eBay developer credentials to publish part listings directly to eBay Motors.
      </p>

      {/* Connection status */}
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${hasRefreshToken ? 'bg-emerald-500/15' : 'bg-slate-700/50'}`}>
            {hasRefreshToken ? <Check size={18} className="text-emerald-400" /> : <Key size={18} className="text-slate-400" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">eBay Connection</p>
            <p className={`text-xs font-semibold ${hasRefreshToken ? 'text-emerald-400' : 'text-slate-500'}`}>
              {hasRefreshToken ? 'CONNECTED' : 'NOT CONNECTED'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 mb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 flex-shrink-0">Environment:</span>
            <span className={`font-semibold capitalize ${environment === 'production' ? 'text-red-400' : 'text-amber-400'}`}>
              {environment}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 flex-shrink-0">Connected User:</span>
            {hasRefreshToken ? (
              <span className="font-semibold text-white">
                {ebayUsername || 'Loading...'}
              </span>
            ) : (
              <span className="font-semibold text-slate-600">NONE</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {hasRefreshToken ? (
            <Button
              onClick={handleConnectEbay}
              size="sm"
              variant="secondary"
              className="flex-1"
              icon={connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              disabled={connecting}
            >
              Reconnect eBay Account
            </Button>
          ) : (
            <Button
              onClick={handleConnectEbay}
              size="sm"
              className="flex-1"
              icon={connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              disabled={connecting}
            >
              Connect eBay Account
            </Button>
          )}
          {hasRefreshToken && (
            <Button
              onClick={handleTestAuth}
              size="sm"
              variant="secondary"
              icon={connecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              disabled={connecting}
            >
              Test Auth
            </Button>
          )}
        </div>
      </Card>

      {/* OAuth status messages */}
      {oauthStatus && (
        <div className={`p-3 rounded-xl border flex items-start gap-2 ${
          oauthStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' :
          oauthStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20' :
          'bg-red-500/10 border-red-500/20'
        }`}>
          {oauthStatus.type === 'success' ? (
            <Check size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : oauthStatus.type === 'error' ? (
            <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          ) : (
            <Loader2 size={14} className="text-red-400 flex-shrink-0 mt-0.5 animate-spin" />
          )}
          <p className={`text-xs ${
            oauthStatus.type === 'success' ? 'text-emerald-300' :
            oauthStatus.type === 'error' ? 'text-red-300' : 'text-red-300'
          }`}>
            {oauthStatus.message}
          </p>
        </div>
      )}

      {/* API Credentials */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={14} className="text-amber-400" />
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">eBay Developer Credentials</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {['sandbox', 'production'].map((env) => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                environment === env ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {env}
            </button>
          ))}
        </div>
        <Field label="Client ID" value={clientId} onChange={setClientId} placeholder="eBay developer client ID" />
        <Field label="Client Secret" value={clientSecret} onChange={setClientSecret} placeholder="Enter new to replace" type="password" />
        <Field label="Redirect URI Name (RuName)" value={ruName} onChange={setRuName} placeholder="eBay RuName for OAuth" />
        <p className="text-[10px] text-slate-600">
          Get these from the eBay Developer Portal at developer.ebay.com. The Client Secret is stored server-side and never exposed to the browser.
        </p>
      </Card>

      {/* Selling Preferences */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Selling Preferences</p>
          {hasRefreshToken && (
            <button
              onClick={fetchPolicies}
              disabled={policiesLoading}
              className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              {policiesLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Refresh Policies
            </button>
          )}
        </div>
        <Field label="Seller Display Name" value={merchantName} onChange={setMerchantName} placeholder="Fort Peck Auto" />
        <div>
          <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Default Handling Time (days)</label>
          <input
            type="number"
            value={handlingTime}
            onChange={(e) => setHandlingTime(parseInt(e.target.value) || 1)}
            min={1}
            max={30}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Policies error banner */}
        {policiesError && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">{policiesError}</p>
          </div>
        )}

        <PolicySection
          label="Return Policy"
          policies={returnPolicies}
          selectedId={returnPolicyId}
          onSelect={setReturnPolicyId}
          loading={policiesLoading}
          hasRefreshToken={hasRefreshToken}
          onViewDetails={handleViewPolicyDetails}
          onRefresh={fetchPolicies}
          refreshing={policiesLoading}
          policyType="return"
        />

        <PolicySection
          label="Shipping / Fulfillment Policy"
          policies={fulfillmentPolicies}
          selectedId={fulfillmentPolicyId}
          onSelect={setFulfillmentPolicyId}
          loading={policiesLoading}
          hasRefreshToken={hasRefreshToken}
          onViewDetails={handleViewPolicyDetails}
          onRefresh={fetchPolicies}
          refreshing={policiesLoading}
          policyType="fulfillment"
        />

        <PolicySection
          label="Payment Policy"
          policies={paymentPolicies}
          selectedId={paymentPolicyId}
          onSelect={setPaymentPolicyId}
          loading={policiesLoading}
          hasRefreshToken={hasRefreshToken}
          onViewDetails={handleViewPolicyDetails}
          onRefresh={fetchPolicies}
          refreshing={policiesLoading}
          policyType="payment"
        />

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-sm font-semibold text-white">Auto-publish listings</p>
            <p className="text-xs text-slate-500">Publish to eBay immediately when a listing is created</p>
          </div>
          <button
            onClick={() => setAutoPublish(!autoPublish)}
            className={`relative w-11 h-6 rounded-full transition-colors ${autoPublish ? 'bg-emerald-600' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoPublish ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </Card>

      <Button onClick={handleSave} size="lg" className="w-full" disabled={saving}
        icon={saved ? <Check size={20} className="text-emerald-400" /> : saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}>
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save eBay Settings'}
      </Button>

      {/* Policy Details Modal */}
      {viewingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewingPolicy(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">{viewingPolicy.name}</h3>
                <p className="text-[10px] text-slate-500 uppercase capitalize">{viewingPolicy.type} Policy Details</p>
              </div>
              <button onClick={() => setViewingPolicy(null)} className="text-slate-400 hover:text-white">
                <ChevronLeft size={20} className="rotate-90" />
              </button>
            </div>
            {policyDetailsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="text-red-400 animate-spin" />
              </div>
            ) : policyDetailsError ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{policyDetailsError}</p>
              </div>
            ) : policyDetails ? (
              <div className="space-y-2">
                {Object.entries(policyDetails).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5 py-1 border-b border-slate-800 last:border-0">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                    <span className="text-xs text-white">
                      {typeof value === 'object' && value !== null
                        ? JSON.stringify(value)
                        : String(value ?? '—')}
                    </span>
                  </div>
                ))}
                <a
                  href={`https://www.ebay.com/sh/landing/policies/${viewingPolicy.type}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 pt-2"
                >
                  <ExternalLink size={11} /> Manage on eBay
                </a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function PolicySection({
  label,
  policies,
  selectedId,
  onSelect,
  loading,
  hasRefreshToken,
  onViewDetails,
  onRefresh,
  refreshing,
  policyType,
}: {
  label: string;
  policies: PolicyOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  hasRefreshToken: boolean;
  onViewDetails: (type: string, id: string, name: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  policyType: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-slate-500 uppercase font-semibold block">{label}</label>
        {hasRefreshToken && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
          <Loader2 size={14} className="animate-spin" /> Loading policies...
        </div>
      ) : policies.length > 0 ? (
        <div className="space-y-2">
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
          >
            <option value="">Select a {label.toLowerCase()}...</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            {selectedId && (
              <button
                onClick={() => {
                  const p = policies.find((p) => p.id === selectedId);
                  if (p) onViewDetails(policyType, p.id, p.name);
                }}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-400 transition-colors"
              >
                <Eye size={11} /> View Details
              </button>
            )}
            <a
              href={`https://www.ebay.com/sh/landing/policies/${policyType}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-400 transition-colors"
            >
              <Pencil size={11} /> Edit on eBay
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-amber-400 py-1">
            No policies found — create one in eBay, then Refresh Policies.
          </p>
          <a
            href={`https://www.ebay.com/sh/landing/policies/${policyType}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
          >
            <ExternalLink size={10} /> Go to eBay Business Policies
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
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
