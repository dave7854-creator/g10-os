import { useState } from 'react';
import { X, FileSignature, User, Weight, DollarSign, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui';
import type { WorkflowType, WorkflowData } from '@/types';

export function WorkflowModal({
  workflowType,
  statusName,
  onClose,
  onConfirm,
}: {
  workflowType: WorkflowType;
  statusName: string;
  onClose: () => void;
  onConfirm: (data: WorkflowData, notes: string) => void;
}) {
  const [notes, setNotes] = useState('');

  const [releaseFee, setReleaseFee] = useState('');
  const [signature, setSignature] = useState('');

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const [yard, setYard] = useState('');
  const [weight, setWeight] = useState('');
  const [payout, setPayout] = useState('');

  const handleConfirm = () => {
    let data: WorkflowData = {};
    if (workflowType === 'release') {
      data = { release: { releaseFee: Number(releaseFee) || 0, signature } };
    } else if (workflowType === 'sold') {
      data = { sold: { buyerName, buyerPhone, salePrice: Number(salePrice) || 0 } };
    } else if (workflowType === 'scrapped') {
      data = { scrapped: { yard, weight: Number(weight) || 0, payout: Number(payout) || 0 } };
    }
    onConfirm(data, notes);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Set to "{statusName}"</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {workflowType === 'release' && (
            <>
              <Field icon={DollarSign} label="Release Fee ($)" value={releaseFee} onChange={setReleaseFee} type="number" placeholder="0.00" />
              <Field icon={FileSignature} label="Signature" value={signature} onChange={setSignature} placeholder="Sign here..." />
            </>
          )}

          {workflowType === 'sold' && (
            <>
              <Field icon={User} label="Buyer Name" value={buyerName} onChange={setBuyerName} placeholder="Full name" />
              <Field icon={Phone} label="Buyer Phone" value={buyerPhone} onChange={setBuyerPhone} placeholder="Phone number" />
              <Field icon={DollarSign} label="Sale Price ($)" value={salePrice} onChange={setSalePrice} type="number" placeholder="0.00" />
            </>
          )}

          {workflowType === 'scrapped' && (
            <>
              <Field icon={MapPin} label="Scrap Yard" value={yard} onChange={setYard} placeholder="Yard name" />
              <Field icon={Weight} label="Weight (lbs)" value={weight} onChange={setWeight} type="number" placeholder="0" />
              <Field icon={DollarSign} label="Payout ($)" value={payout} onChange={setPayout} type="number" placeholder="0.00" />
            </>
          )}

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">Notes (optional)</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this status change..."
              rows={3}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all resize-none"
            />
          </div>

          <Button onClick={handleConfirm} size="lg" className="w-full">
            Confirm Status Change
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon, label, value, onChange, type = 'text', placeholder,
}: {
  icon: typeof User; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">{label}</p>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-10 pr-3 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
        />
      </div>
    </div>
  );
}
