export type AdminDeleteConfirm = {
  type: 'category' | 'sport' | 'expired_lives' | 'event';
  id: string;
};

interface AdminConfirmModalsProps {
  showClearCache: boolean;
  showFixLegacyMatches: boolean;
  deleteConfirm: AdminDeleteConfirm | null;
  onCancelClearCache: () => void;
  onConfirmClearCache: () => void;
  onCancelFixLegacyMatches: () => void;
  onConfirmFixLegacyMatches: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

const AdminModalFrame = ({
  title,
  message,
  cancelLabel = 'Cancelar',
  confirmLabel,
  confirmClassName,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmClassName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] p-8 max-sm w-full shadow-2xl space-y-6">
      <h3 className="text-xl font-black text-black">{title}</h3>
      <p className="text-black font-bold text-sm">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs">{cancelLabel}</button>
        <button onClick={onConfirm} className={`flex-1 py-4 text-white rounded-2xl font-black text-xs ${confirmClassName}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const getDeleteTitle = (deleteConfirm: AdminDeleteConfirm) => {
  if (deleteConfirm.type === 'expired_lives') return 'Limpar transmissões?';
  if (deleteConfirm.type === 'event') return 'Excluir evento?';
  return 'Excluir item?';
};

const getDeleteMessage = (deleteConfirm: AdminDeleteConfirm) =>
  deleteConfirm.type === 'expired_lives'
    ? 'Esta ação removerá permanentemente todas as partidas ao vivo com mais de 24 horas.'
    : 'Esta ação não pode ser desfeita e removerá o item permanentemente.';

export const AdminConfirmModals = ({
  showClearCache,
  showFixLegacyMatches,
  deleteConfirm,
  onCancelClearCache,
  onConfirmClearCache,
  onCancelFixLegacyMatches,
  onConfirmFixLegacyMatches,
  onCancelDelete,
  onConfirmDelete,
}: AdminConfirmModalsProps) => (
  <>
    {showClearCache && (
      <AdminModalFrame
        title="Limpar cache técnico?"
        message="Isso removerá dados temporários do banco de dados local e reiniciará o app. Útil para resolver erros de armazenamento (QuotaExceeded)."
        confirmLabel="Limpar e reiniciar"
        confirmClassName="bg-red-500"
        onCancel={onCancelClearCache}
        onConfirm={onConfirmClearCache}
      />
    )}

    {showFixLegacyMatches && (
      <AdminModalFrame
        title="Vincular partidas?"
        message="Esta ação vinculará todas as partidas sem dono ao e-mail administrativo."
        confirmLabel="Sim, vincular"
        confirmClassName="bg-blue-600"
        onCancel={onCancelFixLegacyMatches}
        onConfirm={onConfirmFixLegacyMatches}
      />
    )}

    {deleteConfirm && (
      <AdminModalFrame
        title={getDeleteTitle(deleteConfirm)}
        message={getDeleteMessage(deleteConfirm)}
        confirmLabel="Excluir"
        confirmClassName="bg-red-500"
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    )}
  </>
);
