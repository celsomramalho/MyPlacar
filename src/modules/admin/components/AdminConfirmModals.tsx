export type AdminDeleteConfirm = {
  type: 'category' | 'sport' | 'expired_lives' | 'event' | 'inactive_lives_config';
  id: string;
  count?: number;
};

interface AdminConfirmModalsProps {
  showClearCache: boolean;
  showFixLegacyMatches: boolean;
  deleteConfirm: AdminDeleteConfirm | null;
  showUnsavedChanges?: boolean;
  onCancelClearCache: () => void;
  onConfirmClearCache: () => void;
  onCancelFixLegacyMatches: () => void;
  onConfirmFixLegacyMatches: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onCancelUnsavedChanges?: () => void;
  onConfirmUnsavedChanges?: () => void;
  onSaveAndExitUnsavedChanges?: () => void;
  isSavingEvent?: boolean;
}

const AdminModalFrame = ({
  title,
  message,
  cancelLabel = 'Cancelar',
  confirmLabel,
  confirmClassName,
  onCancel,
  onConfirm,
  saveAndExitLabel,
  onSaveAndExit,
  isSaving = false,
}: {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmClassName: string;
  onCancel: () => void;
  onConfirm: () => void;
  saveAndExitLabel?: string;
  onSaveAndExit?: () => void;
  isSaving?: boolean;
}) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] p-8 max-sm w-full shadow-2xl space-y-6">
      <h3 className="text-xl font-black text-black">{title}</h3>
      <p className="text-black font-bold text-sm">{message}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={onCancel} disabled={isSaving} className="flex-1 min-w-[120px] py-4 bg-gray-100 text-black rounded-2xl font-black text-xs disabled:opacity-50">{cancelLabel}</button>
        {onSaveAndExit && <button onClick={onSaveAndExit} disabled={isSaving} className="flex-1 min-w-[120px] py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs disabled:opacity-50">{isSaving ? 'Salvando...' : saveAndExitLabel}</button>}
        <button onClick={onConfirm} disabled={isSaving} className={`flex-1 min-w-[120px] py-4 text-white rounded-2xl font-black text-xs disabled:opacity-50 ${confirmClassName}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const getDeleteTitle = (deleteConfirm: AdminDeleteConfirm) => {
  if (deleteConfirm.type === 'expired_lives') return 'Limpar transmissões?';
  if (deleteConfirm.type === 'inactive_lives_config') {
    const word = (deleteConfirm.count ?? 0) === 1 ? 'transmissão inativa' : 'transmissões inativas';
    return `Limpar ${deleteConfirm.count ?? 0} ${word}?`;
  }
  if (deleteConfirm.type === 'event') return 'Excluir evento?';
  return 'Excluir item?';
};

const getDeleteMessage = (deleteConfirm: AdminDeleteConfirm) => {
  if (deleteConfirm.type === 'expired_lives') {
    return 'Esta ação removerá permanentemente todas as partidas ao vivo com mais de 24 horas.';
  }
  if (deleteConfirm.type === 'inactive_lives_config') {
    const hours = deleteConfirm.id;
    return `Esta ação removerá permanentemente todas as transmissões ativas que estão sem pontuação ou interação por mais de ${hours} ${Number(hours) === 1 ? 'hora' : 'horas'}.`;
  }
  return 'Esta ação não pode ser desfeita e removerá o item permanentemente.';
};

export const AdminConfirmModals = ({
  showClearCache,
  showFixLegacyMatches,
  deleteConfirm,
  showUnsavedChanges,
  onCancelClearCache,
  onConfirmClearCache,
  onCancelFixLegacyMatches,
  onConfirmFixLegacyMatches,
  onCancelDelete,
  onConfirmDelete,
  onCancelUnsavedChanges,
  onConfirmUnsavedChanges,
  onSaveAndExitUnsavedChanges,
  isSavingEvent,
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

    {showUnsavedChanges && (
      <AdminModalFrame
        title="Alterações não salvas"
        message="Você fez alterações nas configurações do evento que ainda não foram salvas. Deseja realmente sair e descartar as alterações?"
        cancelLabel="Continuar editando"
        confirmLabel="Sair sem salvar"
        confirmClassName="bg-red-500"
        saveAndExitLabel="Salvar e sair"
        onSaveAndExit={onSaveAndExitUnsavedChanges}
        isSaving={isSavingEvent}
        onCancel={onCancelUnsavedChanges || (() => {})}
        onConfirm={onConfirmUnsavedChanges || (() => {})}
      />
    )}
  </>
);
