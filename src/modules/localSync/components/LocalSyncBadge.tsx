// ─── src/modules/localSync/components/LocalSyncBadge.tsx ─────────────────────
// Badge/indicador pequeno para o ScoreboardScreen mostrar o status do
// espelhamento local. Semelhante ao LiveIndicator do modo online.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Gamepad2, Eye, WifiOff, Loader2 } from 'lucide-react';
import type { LocalSyncStatus, LocalSyncRole } from '@infra/network/LocalSyncService';

interface Props {
  role: LocalSyncRole;
  status: LocalSyncStatus;
  pin: string | null;
  onClick?: () => void;
}

export const LocalSyncBadge: React.FC<Props> = ({ role, status, pin, onClick }) => {
  if (role === 'none' || status === 'idle') return null;

  const isConnected = status === 'connected';
  const isWaiting = status === 'waiting_mirror' || status === 'connecting';
  const isError = status === 'error' || status === 'disconnected';

  const roleLabel = role === 'controller' ? 'Ctrl' : 'Espelho';

  return (
    <button
      onClick={onClick}
      id="btn-local-sync-badge"
      title={`Modo Lite Offline - ${roleLabel} - PIN: ${pin ?? ''}`}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold transition-all active:scale-95 ${
        isConnected
          ? 'border-green-500/40 bg-green-500/10 text-green-400'
          : isError
          ? 'border-red-500/40 bg-red-500/10 text-red-400'
          : 'border-orange-500/40 bg-orange-500/10 text-orange-400'
      }`}
    >
      {isError ? (
        <WifiOff size={12} />
      ) : isWaiting ? (
        <Loader2 size={12} className="animate-spin" />
      ) : role === 'controller' ? (
        <Gamepad2 size={12} />
      ) : (
        <Eye size={12} />
      )}
      <span>{roleLabel}</span>
      {isWaiting && pin && <span className="opacity-70">#{pin}</span>}
    </button>
  );
};
