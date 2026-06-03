import { useMemo } from 'react';
import { applyGoldenRule } from '@shared/utils/formatters';

/**
 * Retorna o nome completo do dispositivo formatado pela golden rule.
 * Extrai o `useMemo` que vivia em `AppContent`.
 */
export function useAppDeviceName(deviceLabel: string | undefined, nickname: string | undefined): string {
  return useMemo(() => {
    const label = deviceLabel || 'Aparelho';
    const nick = nickname || 'Usuário';
    return applyGoldenRule(`${label} - ${nick}`, true);
  }, [deviceLabel, nickname]);
}
