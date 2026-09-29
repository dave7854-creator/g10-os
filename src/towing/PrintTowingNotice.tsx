import { useState, useEffect, useMemo } from 'react';
import { X, Printer, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Edit3, Save, Eye } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import type { TowingImpound, TowingOwner, TowingLienHolder, TowingFee, TowingPayment, TowingNoticeTemplate, TowingNoticeSnapshot, TowingUser } from '@/towing/types';

function replaceTokens(text: string, ctx: NoticeContext): string {
  return text
    .replace(/\{\{company_name\}\}/gi, ctx.companyName || '')
    .replace(/\{\{company_address\}\}/gi, ctx.companyAddress || '')
    .replace(/\{\{company_phone\}\}/gi, ctx.companyPhone || '')
    .replace(/\{\{company_license\}\}/gi, ctx.companyLicense || '')
    .replace(/\{\{call_number\}\}/gi, ctx.callNumber)
    .replace(/\{\{impound_date\}\}/gi, ctx.impoundDate)
    .replace(/\{\{impound_time\}\}/gi, ctx.impoundTime)
    .replace(/\{\{vehicle_year\}\}/gi, ctx.vehicleYear)
    .replace(/\{\{vehicle_make\}\}/gi, ctx.vehicleMake)
    .replace(/\{\{vehicle_model\}\}/gi, ctx.vehicleModel)
    .replace(/\{\{vehicle_color\}\}/gi, ctx.vehicleColor)
    .replace(/\{\{vehicle_plate\}\}/gi, ctx.vehiclePlate)
    .replace(/\{\{vin\}\}/gi, ctx.vin)
    .replace(/\{\{owner_name\}\}/gi, ctx.ownerName)
    .replace(/\{\{owner_address\}\}/gi, ctx.ownerAddress)
    .replace(/\{\{owner_phone\}\}/gi, ctx.ownerPhone)
    .replace(/\{\{lienholder_name\}\}/gi, ctx.lienholderName)
    .replace(/\{\{lienholder_address\}\}/gi, ctx.lienholderAddress)
    .replace(/\{\{lienholder_phone\}\}/gi, ctx.lienholderPhone)
    .replace(/\{\{tow_location\}\}/gi, ctx.towLocation)
    .replace(/\{\{tow_reason\}\}/gi, ctx.towReason)
    .replace(/\{\{storage_days\}\}/gi, ctx.storageDays)
    .replace(/\{\{notice_date\}\}/gi, ctx.noticeDate);
}

interface NoticeContext {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyLicense: string;
  callNumber: string;
  impoundDate: string;
  impoundTime: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  vin: string;
  ownerName: string;
  ownerAddress: string;
  ownerPhone: string;
  lienholderName: string;
  lienholderAddress: string;
  lienholderPhone: string;
  towLocation: string;
  towReason: string;
  storageDays: string;
  noticeDate: string;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)})-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function buildContext(
  impound: TowingImpound,
  owners: TowingOwner[],
  liens: TowingLienHolder[],
  template: TowingNoticeTemplate
): NoticeContext {
  const towDate = new Date(impound.tow_date);
  const now = new Date();
  const storageDays = Math.max(1, Math.ceil((now.getTime() - towDate.getTime()) / (1000 * 60 * 60 * 24)));
  const owner = owners[0];
  const lien = liens[0];

  return {
    companyName: template.company_name || '',
    companyAddress: template.company_address || '',
    companyPhone: formatPhone(template.company_phone || ''),
    companyLicense: template.company_license || '',
    callNumber: impound.id.slice(0, 8).toUpperCase(),
    impoundDate: towDate.toLocaleDateString(),
    impoundTime: towDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    vehicleYear: impound.year || 'N/A',
    vehicleMake: impound.make || 'N/A',
    vehicleModel: impound.model || 'N/A',
    vehicleColor: impound.color || 'N/A',
    vehiclePlate: impound.plate || 'N/A',
    vin: impound.vin || 'N/A',
    ownerName: owner?.name || 'Unknown',
    ownerAddress: owner?.address || 'N/A',
    ownerPhone: formatPhone(owner?.phone || 'N/A'),
    lienholderName: lien?.name || '',
    lienholderAddress: lien?.address || 'N/A',
    lienholderPhone: formatPhone(lien?.phone || 'N/A'),
    towLocation: impound.tow_location || impound.pickup_location || 'N/A',
    towReason: impound.tow_reason || 'N/A',
    storageDays: String(storageDays),
    noticeDate: now.toLocaleDateString(),
  };
}

// Shared style for both preview and print — ensures they match exactly
const DOCUMENT_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: '7.5in',
  margin: '0 auto',
  padding: 0,
  fontFamily: '"Georgia", "Times New Roman", serif',
  color: '#000',
  fontSize: '10.5pt',
  lineHeight: '1.5',
  background: '#fff',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '8pt',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#1a2744',
  marginBottom: '4px',
  paddingBottom: '2px',
  borderBottom: '1px solid #ccc',
};

const INFO_TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '9.5pt',
};

const LABEL_CELL: React.CSSProperties = {
  border: '1px solid #aaa',
  padding: '3px 8px',
  fontWeight: 'bold',
  width: '20%',
  background: '#f0f2f5',
  whiteSpace: 'nowrap',
};

const VALUE_CELL: React.CSSProperties = {
  border: '1px solid #aaa',
  padding: '3px 8px',
};

// ===== PRINT NOTICE COMPONENT =====
export function PrintTowingNotice({
  impound,
  owners,
  liens,
  fees,
  payments,
  userId,
  onPrinted,
  onClose,
}: {
  impound: TowingImpound;
  owners: TowingOwner[];
  liens: TowingLienHolder[];
  fees: TowingFee[];
  payments: TowingPayment[];
  userId: string;
  onPrinted: () => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<TowingNoticeTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TowingNoticeTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('towing_notice_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('template_name', { ascending: true });
      const tpls = (data ?? []) as TowingNoticeTemplate[];
      setTemplates(tpls);
      const def = tpls.find((t) => t.is_default) ?? tpls[0] ?? null;
      setSelectedTemplate(def);
      setLoading(false);
    })();
  }, []);

  const ctx = useMemo(() => {
    if (!selectedTemplate) return null;
    return buildContext(impound, owners, liens, selectedTemplate);
  }, [impound, owners, liens, selectedTemplate]);

  const saveSnapshot = async (): Promise<void> => {
    if (!ctx || !selectedTemplate) return;
    const header = replaceTokens(selectedTemplate.header_text || '', ctx);
    const body = replaceTokens(selectedTemplate.body_text || '', ctx);
    const footer = replaceTokens(selectedTemplate.footer_text || '', ctx);
    const generatedText = [header, body, footer].filter(Boolean).join('\n\n');
    const snapshotData: Record<string, string> = {
      companyName: ctx.companyName,
      companyAddress: ctx.companyAddress,
      companyPhone: ctx.companyPhone,
      companyLicense: ctx.companyLicense,
      noticeType: selectedTemplate.notice_type,
      callNumber: ctx.callNumber,
      impoundDate: ctx.impoundDate,
      impoundTime: ctx.impoundTime,
      vehicleYear: ctx.vehicleYear,
      vehicleMake: ctx.vehicleMake,
      vehicleModel: ctx.vehicleModel,
      vehicleColor: ctx.vehicleColor,
      vehiclePlate: ctx.vehiclePlate,
      vin: ctx.vin,
      ownerName: ctx.ownerName,
      ownerAddress: ctx.ownerAddress,
      ownerPhone: ctx.ownerPhone,
      lienholderName: ctx.lienholderName,
      lienholderAddress: ctx.lienholderAddress,
      lienholderPhone: ctx.lienholderPhone,
      towLocation: ctx.towLocation,
      towReason: ctx.towReason,
      storageDays: ctx.storageDays,
      noticeDate: ctx.noticeDate,
    };
    await supabase.from('towing_notice_snapshots').insert({
      impound_id: impound.id,
      template_id: selectedTemplate.id,
      template_name: selectedTemplate.template_name,
      notice_type: selectedTemplate.notice_type,
      printed_by: userId,
      snapshot_data: snapshotData,
      generated_text: generatedText,
    });
    setSnapshotSaved(true);
    onPrinted();
  };

  const handlePrint = async () => {
    await saveSnapshot();
    setShowPreview(true);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <Loader2 size={32} className="text-red-400 animate-spin" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-slate-900 rounded-3xl border border-slate-700/50 p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-white">No Notice Templates</h2>
          <p className="text-sm text-slate-400">You need to create a notice template in Settings before you can print a towing notice.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold">Close</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-end justify-center print:hidden" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
        <div className="relative w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-700/50 max-h-[90vh] overflow-y-auto scrollbar-hide animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
            <h2 className="text-lg font-bold text-white">Print Towing Notice</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Notice Template</label>
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value);
                  setSelectedTemplate(t ?? null);
                }}
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.template_name}{t.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {ctx && selectedTemplate && (
              <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800/60 text-xs font-semibold text-slate-300 no-print"
                >
                  <span>Preview Towing Notice</span>
                  {showPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showPreview && (
                  <div className="bg-slate-500/20 p-2 max-h-[60vh] overflow-y-auto">
                    <div className="mx-auto" style={{ width: '7.5in', maxWidth: '100%' }}>
                      <NoticeDocument template={selectedTemplate} ctx={ctx} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handlePrint}
                disabled={snapshotSaved}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Printer size={16} /> {snapshotSaved ? 'Printed & Saved' : 'Print / Save PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden print-only document */}
      {ctx && selectedTemplate && (
        <div className="hidden print:block">
          <NoticeDocument template={selectedTemplate} ctx={ctx} />
        </div>
      )}
    </>
  );
}

// ===== NOTICE DOCUMENT (renders for both preview and print) =====
function NoticeDocument({ template, ctx }: { template: TowingNoticeTemplate; ctx: NoticeContext }) {
  const header = replaceTokens(template.header_text || '', ctx);
  const body = replaceTokens(template.body_text || '', ctx);
  const footer = replaceTokens(template.footer_text || '', ctx);
  const hasLienholder = ctx.lienholderName && ctx.lienholderName !== 'None';

  return (
    <div className="notice-document" style={DOCUMENT_STYLE}>
      {/* Company header */}
      <div style={{ textAlign: 'center', borderBottom: '2.5px solid #1a2744', paddingBottom: '10px', marginBottom: '14px' }}>
        {template.company_name && (
          <div style={{ fontSize: '15pt', fontWeight: 'bold', color: '#1a2744', lineHeight: '1.2' }}>{template.company_name}</div>
        )}
        {template.company_address && (
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '2px' }}>{template.company_address}</div>
        )}
        {template.company_phone && (
          <div style={{ fontSize: '9pt', color: '#444' }}>Phone: {ctx.companyPhone}</div>
        )}
        {template.company_license && (
          <div style={{ fontSize: '9pt', color: '#666', marginTop: '1px' }}>License #: {template.company_license}</div>
        )}
      </div>

      {/* Title */}
      <h1 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 4px 0', color: '#1a2744' }}>
        {template.template_name}
      </h1>
      <div style={{ textAlign: 'center', fontSize: '9pt', color: '#666', marginBottom: '14px' }}>
        Date: {ctx.noticeDate} &nbsp;|&nbsp; Call #: {ctx.callNumber}
      </div>

      {/* Header text */}
      {header && <p style={{ marginBottom: '10px', fontSize: '10pt' }}>{header}</p>}

      {/* Vehicle info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={SECTION_LABEL}>Vehicle Information</div>
        <table style={INFO_TABLE_STYLE}>
          <tbody>
            <tr>
              <td style={LABEL_CELL}>Year</td>
              <td style={VALUE_CELL}>{ctx.vehicleYear}</td>
              <td style={LABEL_CELL}>Make</td>
              <td style={VALUE_CELL}>{ctx.vehicleMake}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Model</td>
              <td style={VALUE_CELL}>{ctx.vehicleModel}</td>
              <td style={LABEL_CELL}>Color</td>
              <td style={VALUE_CELL}>{ctx.vehicleColor}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Plate</td>
              <td style={VALUE_CELL}>{ctx.vehiclePlate}</td>
              <td style={LABEL_CELL}>VIN</td>
              <td style={{ ...VALUE_CELL, fontFamily: '"Courier New", monospace', fontSize: '8.5pt' }}>{ctx.vin}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Impounded</td>
              <td style={VALUE_CELL}>{ctx.impoundDate} at {ctx.impoundTime}</td>
              <td style={LABEL_CELL}>Location</td>
              <td style={VALUE_CELL}>{ctx.towLocation}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Reason</td>
              <td style={VALUE_CELL} colSpan={3}>{ctx.towReason}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Owner info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={SECTION_LABEL}>Registered Owner</div>
        <table style={INFO_TABLE_STYLE}>
          <tbody>
            <tr>
              <td style={LABEL_CELL}>Name</td>
              <td style={VALUE_CELL}>{ctx.ownerName}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Address</td>
              <td style={VALUE_CELL}>{ctx.ownerAddress}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Phone</td>
              <td style={VALUE_CELL}>{ctx.ownerPhone}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Lienholder info — only if applicable */}
      {hasLienholder && (
        <div style={{ marginBottom: '12px' }}>
          <div style={SECTION_LABEL}>Lienholder</div>
          <table style={INFO_TABLE_STYLE}>
            <tbody>
              <tr>
                <td style={LABEL_CELL}>Name</td>
                <td style={VALUE_CELL}>{ctx.lienholderName}</td>
              </tr>
              <tr>
                <td style={LABEL_CELL}>Address</td>
                <td style={VALUE_CELL}>{ctx.lienholderAddress}</td>
              </tr>
              <tr>
                <td style={LABEL_CELL}>Phone</td>
                <td style={VALUE_CELL}>{ctx.lienholderPhone}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Notice body text */}
      {body && (
        <p style={{ marginBottom: '10px', fontSize: '9.5pt', lineHeight: '1.55', textAlign: 'justify' as const }}>{body}</p>
      )}

      {/* Footer text */}
      {footer && <p style={{ marginBottom: '10px', fontStyle: 'italic', fontSize: '9pt', color: '#444' }}>{footer}</p>}

      {/* Contact details */}
      {(ctx.companyName || ctx.companyPhone) && (
        <div style={{ marginTop: '6px', padding: '8px 10px', background: '#f0f2f5', border: '1px solid #ccc', borderRadius: '4px', fontSize: '9pt' }}>
          <strong style={{ color: '#1a2744' }}>Contact:</strong> {ctx.companyName}
          {ctx.companyPhone && ` — ${ctx.companyPhone}`}
          {ctx.companyAddress && <div style={{ marginTop: '2px', color: '#555' }}>{ctx.companyAddress}</div>}
        </div>
      )}

      {/* Signature lines */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ borderTop: '1px solid #000', width: '2.8in', paddingTop: '4px', fontSize: '8.5pt', color: '#555' }}>Authorized Signature</div>
        <div style={{ borderTop: '1px solid #000', width: '2in', paddingTop: '4px', fontSize: '8.5pt', color: '#555' }}>Date</div>
      </div>
    </div>
  );
}

// ===== NOTICE TEMPLATE MANAGER (Settings page section) =====
export function NoticeTemplateManager({ user }: { user: TowingUser }) {
  const [templates, setTemplates] = useState<TowingNoticeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TowingNoticeTemplate | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('towing_notice_templates').select('*').order('template_name', { ascending: true });
    setTemplates((data ?? []) as TowingNoticeTemplate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setDefault = async (t: TowingNoticeTemplate) => {
    await supabase.from('towing_notice_templates').update({ is_default: false }).neq('id', t.id);
    await supabase.from('towing_notice_templates').update({ is_default: true }).eq('id', t.id);
    load();
  };

  const deleteTemplate = async (t: TowingNoticeTemplate) => {
    await supabase.from('towing_notice_templates').delete().eq('id', t.id);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="text-red-400 animate-spin" />
      </div>
    );
  }

  if (editing) {
    return <TemplateEditor template={editing} userId={user.id} onClose={() => { setEditing(null); load(); }} />;
  }

  if (showNew) {
    return (
      <TemplateEditor
        template={null}
        userId={user.id}
        onClose={() => { setShowNew(false); load(); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowNew(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-bold active:scale-95 transition-transform"
      >
        <Plus size={16} /> New Template
      </button>

      {templates.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">No notice templates yet. Create one to start printing towing notices.</p>
      ) : (
        templates.map((t) => (
          <div key={t.id} className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">{t.template_name}</p>
                  {t.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold text-red-400 bg-red-500/15">Default</span>}
                </div>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{t.notice_type} notice</p>
                {t.company_name && <p className="text-xs text-slate-400 mt-1">{t.company_name}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(t)} className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center active:scale-90 transition-transform">
                  <Edit3 size={14} className="text-slate-300" />
                </button>
                <button onClick={() => deleteTemplate(t)} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            </div>
            {!t.is_default && (
              <button onClick={() => setDefault(t)} className="text-xs text-red-400 font-semibold">Set as Default</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ===== TEMPLATE EDITOR =====
const TOKEN_HELP = [
  '{{company_name}}', '{{company_address}}', '{{company_phone}}', '{{company_license}}',
  '{{call_number}}', '{{impound_date}}', '{{impound_time}}',
  '{{vehicle_year}}', '{{vehicle_make}}', '{{vehicle_model}}', '{{vehicle_color}}',
  '{{vehicle_plate}}', '{{vin}}', '{{owner_name}}', '{{owner_address}}', '{{owner_phone}}',
  '{{lienholder_name}}', '{{lienholder_address}}', '{{lienholder_phone}}',
  '{{tow_location}}', '{{tow_reason}}', '{{storage_days}}', '{{notice_date}}',
];

function TemplateEditor({
  template,
  userId,
  onClose,
}: {
  template: TowingNoticeTemplate | null;
  userId: string;
  onClose: () => void;
}) {
  const [templateName, setTemplateName] = useState(template?.template_name ?? '');
  const [noticeType, setNoticeType] = useState<TowingNoticeTemplate['notice_type']>(template?.notice_type ?? 'towing');
  const [companyName, setCompanyName] = useState(template?.company_name ?? '');
  const [companyAddress, setCompanyAddress] = useState(template?.company_address ?? '');
  const [companyPhone, setCompanyPhone] = useState(template?.company_phone ?? '');
  const [companyLicense, setCompanyLicense] = useState(template?.company_license ?? '');
  const [headerText, setHeaderText] = useState(template?.header_text ?? '');
  const [bodyText, setBodyText] = useState(template?.body_text ?? '');
  const [footerText, setFooterText] = useState(template?.footer_text ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !templateName.trim()) return;
    setSaving(true);
    const payload = {
      template_name: templateName.trim(),
      notice_type: noticeType,
      company_name: companyName || null,
      company_address: companyAddress || null,
      company_phone: companyPhone || null,
      company_license: companyLicense || null,
      header_text: headerText || null,
      body_text: bodyText || null,
      footer_text: footerText || null,
    };
    if (template) {
      await supabase.from('towing_notice_templates').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', template.id);
    } else {
      await supabase.from('towing_notice_templates').insert({ ...payload, is_default: false, created_by: userId });
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{template ? 'Edit Template' : 'New Template'}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
          <X size={18} className="text-slate-400" />
        </button>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Template Name</label>
        <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Towing Notice"
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all" />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Notice Type</label>
        <select value={noticeType} onChange={(e) => setNoticeType(e.target.value as TowingNoticeTemplate['notice_type'])}
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
          <option value="towing">Towing</option>
          <option value="lien">Lien</option>
          <option value="abandonment">Abandonment</option>
          <option value="sale">Sale</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3 space-y-3">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">Company Information</p>
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Company Name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Towing Inc."
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none transition-all" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Address</label>
          <input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="123 Main St, City, ST 12345"
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none transition-all" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Phone</label>
            <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="555-1234"
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">License #</label>
            <input value={companyLicense} onChange={(e) => setCompanyLicense(e.target.value)} placeholder="TL-12345"
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none transition-all" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Header Text</label>
        <textarea value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Intro paragraph. Use {{owner_name}} to auto-fill the owner's name..."
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all min-h-20 resize-vertical" />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Body Text</label>
        <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Main notice body. Use tokens like {{vehicle_make}}, {{tow_reason}}, {{storage_days}}..."
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all min-h-24 resize-vertical" />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Footer Text</label>
        <textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Closing paragraph / contact instructions..."
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all min-h-16 resize-vertical" />
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Available Tokens (click to copy)</p>
        <div className="flex flex-wrap gap-1.5">
          {TOKEN_HELP.map((token) => (
            <button
              key={token}
              onClick={() => navigator.clipboard?.writeText(token)}
              className="text-[10px] px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700/50 text-red-400 font-mono active:scale-95 transition-transform"
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold active:scale-95 transition-transform">Cancel</button>
        <button onClick={handleSave} disabled={saving || !templateName.trim()}
          className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Template
        </button>
      </div>
    </div>
  );
}

// ===== NOTICE SNAPSHOT VIEWER =====
export function NoticeSnapshotViewer({ impoundId }: { impoundId: string }) {
  const [snapshots, setSnapshots] = useState<TowingNoticeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<TowingNoticeSnapshot | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('towing_notice_snapshots')
      .select('*')
      .eq('impound_id', impoundId)
      .order('printed_at', { ascending: false });
    setSnapshots((data ?? []) as TowingNoticeSnapshot[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [impoundId]);

  const deleteSnapshot = async (id: string) => {
    await supabase.from('towing_notice_snapshots').delete().eq('id', id);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 size={20} className="text-slate-500 animate-spin" /></div>;
  }

  if (viewing) {
    return (
      <div className="space-y-3">
        <button onClick={() => setViewing(null)} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
          <ChevronDown size={16} className="rotate-90" /> Back to Snapshots
        </button>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{viewing.template_name}</p>
              <p className="text-xs text-slate-500">
                Printed {new Date(viewing.printed_at).toLocaleDateString()} at {new Date(viewing.printed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold text-red-400 bg-red-500/15 capitalize">{viewing.notice_type}</span>
          </div>
        </div>
        <div className="rounded-xl bg-slate-500/20 p-2 max-h-[50vh] overflow-y-auto">
          <div className="mx-auto" style={{ width: '7.5in', maxWidth: '100%' }}>
            <SnapshotDocument snapshot={viewing} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setViewing(null); window.print(); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2">
            <Printer size={14} /> Reprint
          </button>
          <button onClick={() => deleteSnapshot(viewing.id)} className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-semibold flex items-center justify-center gap-2">
            <Trash2 size={14} /> Delete
          </button>
        </div>
        {/* Print-only version */}
        <div className="hidden print:block">
          <SnapshotDocument snapshot={viewing} />
        </div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return <p className="text-xs text-slate-600 py-2">No printed towing notice snapshots yet.</p>;
  }

  return (
    <div className="space-y-2">
      {snapshots.map((s) => {
        const d = s.snapshot_data;
        return (
          <div key={s.id} className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white truncate">{s.template_name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold text-red-400 bg-red-500/15 capitalize">{s.notice_type}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(s.printed_at).toLocaleDateString()} at {new Date(s.printed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
                {d && (
                  <p className="text-xs text-slate-400 mt-1 truncate">
                    {d.vehicleYear} {d.vehicleMake} {d.vehicleModel}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => setViewing(s)} className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center active:scale-90 transition-transform">
                  <Eye size={12} className="text-slate-300" />
                </button>
                <button onClick={() => deleteSnapshot(s.id)} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotDocument({ snapshot }: { snapshot: TowingNoticeSnapshot }) {
  const d = snapshot.snapshot_data;
  const hasLienholder = d.lienholderName && d.lienholderName !== 'None';

  return (
    <div className="notice-document" style={DOCUMENT_STYLE}>
      {/* Company header */}
      <div style={{ textAlign: 'center', borderBottom: '2.5px solid #1a2744', paddingBottom: '10px', marginBottom: '14px' }}>
        {d.companyName && (
          <div style={{ fontSize: '15pt', fontWeight: 'bold', color: '#1a2744', lineHeight: '1.2' }}>{d.companyName}</div>
        )}
        {d.companyAddress && (
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '2px' }}>{d.companyAddress}</div>
        )}
        {d.companyPhone && (
          <div style={{ fontSize: '9pt', color: '#444' }}>Phone: {d.companyPhone}</div>
        )}
      </div>

      {/* Title */}
      <h1 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 4px 0', color: '#1a2744' }}>
        {snapshot.template_name}
      </h1>
      <div style={{ textAlign: 'center', fontSize: '9pt', color: '#666', marginBottom: '14px' }}>
        Date: {d.noticeDate} &nbsp;|&nbsp; Call #: {d.callNumber}
      </div>

      {/* Notice text */}
      {snapshot.generated_text && (
        <p style={{ marginBottom: '10px', fontSize: '9.5pt', lineHeight: '1.55', textAlign: 'justify' as const, whiteSpace: 'pre-wrap' }}>{snapshot.generated_text}</p>
      )}

      {/* Vehicle info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={SECTION_LABEL}>Vehicle Information</div>
        <table style={INFO_TABLE_STYLE}>
          <tbody>
            <tr>
              <td style={LABEL_CELL}>Year</td>
              <td style={VALUE_CELL}>{d.vehicleYear}</td>
              <td style={LABEL_CELL}>Make</td>
              <td style={VALUE_CELL}>{d.vehicleMake}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Model</td>
              <td style={VALUE_CELL}>{d.vehicleModel}</td>
              <td style={LABEL_CELL}>Color</td>
              <td style={VALUE_CELL}>{d.vehicleColor}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Plate</td>
              <td style={VALUE_CELL}>{d.vehiclePlate}</td>
              <td style={LABEL_CELL}>VIN</td>
              <td style={{ ...VALUE_CELL, fontFamily: '"Courier New", monospace', fontSize: '8.5pt' }}>{d.vin}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Impounded</td>
              <td style={VALUE_CELL}>{d.impoundDate} at {d.impoundTime}</td>
              <td style={LABEL_CELL}>Location</td>
              <td style={VALUE_CELL}>{d.towLocation}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Reason</td>
              <td style={VALUE_CELL} colSpan={3}>{d.towReason}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Owner info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={SECTION_LABEL}>Registered Owner</div>
        <table style={INFO_TABLE_STYLE}>
          <tbody>
            <tr>
              <td style={LABEL_CELL}>Name</td>
              <td style={VALUE_CELL}>{d.ownerName}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Address</td>
              <td style={VALUE_CELL}>{d.ownerAddress}</td>
            </tr>
            <tr>
              <td style={LABEL_CELL}>Phone</td>
              <td style={VALUE_CELL}>{d.ownerPhone}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Lienholder info — only if applicable */}
      {hasLienholder && (
        <div style={{ marginBottom: '12px' }}>
          <div style={SECTION_LABEL}>Lienholder</div>
          <table style={INFO_TABLE_STYLE}>
            <tbody>
              <tr>
                <td style={LABEL_CELL}>Name</td>
                <td style={VALUE_CELL}>{d.lienholderName}</td>
              </tr>
              <tr>
                <td style={LABEL_CELL}>Address</td>
                <td style={VALUE_CELL}>{d.lienholderAddress}</td>
              </tr>
              <tr>
                <td style={LABEL_CELL}>Phone</td>
                <td style={VALUE_CELL}>{d.lienholderPhone}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Contact details */}
      {(d.companyName || d.companyPhone) && (
        <div style={{ marginTop: '6px', padding: '8px 10px', background: '#f0f2f5', border: '1px solid #ccc', borderRadius: '4px', fontSize: '9pt' }}>
          <strong style={{ color: '#1a2744' }}>Contact:</strong> {d.companyName}
          {d.companyPhone && ` — ${d.companyPhone}`}
          {d.companyAddress && <div style={{ marginTop: '2px', color: '#555' }}>{d.companyAddress}</div>}
        </div>
      )}

      {/* Signature lines */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ borderTop: '1px solid #000', width: '2.8in', paddingTop: '4px', fontSize: '8.5pt', color: '#555' }}>Authorized Signature</div>
        <div style={{ borderTop: '1px solid #000', width: '2in', paddingTop: '4px', fontSize: '8.5pt', color: '#555' }}>Date</div>
      </div>
    </div>
  );
}
