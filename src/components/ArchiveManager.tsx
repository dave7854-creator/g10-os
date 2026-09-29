import { useState } from 'react';
import { Archive, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

// ===== CONFIRM DELETE DIALOG =====
// Shared two-step confirmation dialog for single delete and bulk delete-all.
// Used by both the main app (VehiclesScreen) and the towing module.

export type ConfirmDeleteState = null | { type: 'delete'; id: string; name: string } | { type: 'deleteAll'; count: number };

export function ConfirmDeleteDialog({
  state,
  deleting,
  itemLabel,
  onCancel,
  onConfirm,
}: {
  state: Exclude<ConfirmDeleteState, null>;
  deleting: boolean;
  itemLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const isBulk = state.type === 'deleteAll';
  const title = isBulk ? `Delete All Archived ${itemLabel}?` : `Delete ${itemLabel}?`;
  const message = isBulk
    ? `This will permanently delete all ${state.count} archived ${itemLabel.toLowerCase()}. This action cannot be undone. All information, photos, documents, and history will be permanently deleted.`
    : `This action cannot be undone. All information, photos, documents, and history will be permanently deleted.`;

  const handleConfirm = () => {
    if (isBulk && !confirmed) {
      setConfirmed(true);
    } else {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-sm bg-slate-900 rounded-3xl border border-slate-700/50 p-6 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white mt-3">{title}</h2>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </div>

        {isBulk && (
          <p className={`text-xs text-center rounded-xl py-2 px-3 border transition-colors ${
            confirmed
              ? 'text-red-400 bg-red-500/10 border-red-500/30'
              : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
          }`}>
            {confirmed
              ? `Click "Delete Permanently" again to confirm. This will remove all ${state.count} archived ${itemLabel.toLowerCase()}.`
              : `This will remove every ${itemLabel.toLowerCase()} currently in the archive.`}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { setConfirmed(false); onCancel(); }}
            disabled={deleting}
            className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={16} /> Delete Permanently
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== ARCHIVE TOGGLE BUTTON =====
// The amber pill button that toggles showing archived items.
export function ArchiveToggleButton({
  active,
  count,
  onClick,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
        active ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
      }`}
    >
      <Archive size={14} />
      Archived {count > 0 && `(${count})`}
    </button>
  );
}

// ===== DELETE ALL ARCHIVED BUTTON =====
// The red "Delete All" button shown when archived items are visible.
export function DeleteAllArchivedButton({
  count,
  itemLabel,
  onClick,
}: {
  count: number;
  itemLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl active:scale-[0.98] transition-transform"
    >
      <Trash2 size={14} /> Delete All Archived {itemLabel} ({count})
    </button>
  );
}

// ===== ARCHIVE ITEM ACTIONS =====
// The "Restore to Active" and "Delete Permanently" buttons shown on archived item cards.
export function ArchiveItemActions({
  onRestore,
  onDelete,
}: {
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-2 mb-2">
      <button
        onClick={onRestore}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-semibold active:scale-95 transition-transform"
      >
        <RotateCcw size={14} /> Restore to Active
      </button>
      <button
        onClick={onDelete}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs font-semibold active:scale-95 transition-transform"
      >
        <Trash2 size={14} /> Delete Permanently
      </button>
    </div>
  );
}
