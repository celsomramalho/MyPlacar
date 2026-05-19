import { useUI } from '@modules/ui';
import { useGame } from '@modules/game';
import type { MatchSettings } from '../types.ts';

type VoicePrefs = Pick<
  MatchSettings,
  'voiceEnabled' | 'voiceScoring' | 'selectedVoiceURI' | 'useGeminiVoice' | 'volume'
>;

/** Prefs de voz (`matchSettings`) + logs de comando (`UIContext`). Announcers ficam no ScoreboardScreen. */
export function useVoiceControl() {
  const { voiceLogs, setVoiceLogs } = useUI();
  const { matchSettings, setMatchSettings } = useGame();

  const voicePrefs: VoicePrefs = {
    voiceEnabled: matchSettings.voiceEnabled,
    voiceScoring: matchSettings.voiceScoring,
    selectedVoiceURI: matchSettings.selectedVoiceURI,
    useGeminiVoice: matchSettings.useGeminiVoice,
    volume: matchSettings.volume,
  };

  const setVoicePrefs = (patch: Partial<VoicePrefs>) => {
    setMatchSettings((prev) => ({ ...prev, ...patch }));
  };

  return { voiceLogs, setVoiceLogs, voicePrefs, setVoicePrefs };
}
