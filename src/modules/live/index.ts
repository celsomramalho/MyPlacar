// Barrel de exportações do módulo Live.
// Importar daqui em vez dos arquivos internos garante encapsulamento.

export { LiveContext, LiveProvider } from './LiveContext.tsx';
export { useLive } from './useLive.ts';
export type { LiveContextValue, LiveProviderProps } from './types.ts';
export {
  persistLiveOwnerPin,
  getPersistedLiveOwnerPin,
  clearLiveOwnerPin,
  assertOwnerPin,
} from './liveHelpers.ts';
