export interface MatchRulesConfig {
  setsCount: 1 | 3 | 5;
  gamesPerSet: number;
  noAd: boolean;
  switchSidesOdd: boolean;
  tieBreak: boolean;
  tieBreakAt: '3-3' | '4-4' | '5-5' | '6-6' | '7-7' | '8-8' | string;
  tieBreakPoints: number;
  tieBreakWinByTwo: boolean;
  superTieBreakFinalSet?: boolean;
  /** Modo de pontuação do Pickleball: side-out (tradicional) ou rally (ponto é ponto). */
  pickleballScoringMode?: 'side-out' | 'rally';
}

export interface MatchRulesPreset {
  id: string;
  name: string;
  description: string;
  rules: MatchRulesConfig;
  sportId?: 'beach-tennis' | 'tennis' | 'pickleball' | string;
  isSystem?: boolean;
}

export type EventPhaseCategory = 'groups' | 'playoffs' | 'semifinal' | 'final';

export interface EventSportRules {
  defaultRules: MatchRulesConfig;
  customPhasesEnabled?: boolean;
  phaseRules?: {
    groups?: MatchRulesConfig;
    playoffs?: MatchRulesConfig;
    semifinal?: MatchRulesConfig;
    final?: MatchRulesConfig;
  };
}

export const SYSTEM_RULE_PRESETS: MatchRulesPreset[] = [
  // ── Beach Tennis ─────────────────────────────────────────────────────────────
  {
    id: 'beach_tennis_standard',
    name: 'Beach tênis · Padrão (TB no 5-5)',
    description: '1 set de 6 games · No-ad · TB no 5-5 (7 pts)',
    sportId: 'beach-tennis',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 6,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '5-5',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'beach_tennis_itf',
    name: 'Beach tênis · Oficial ITF / CBT (TB no 6-6)',
    description: '1 set de 6 games · No-ad · TB no 6-6 (7 pts)',
    sportId: 'beach-tennis',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 6,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'beach_tennis_short_set',
    name: 'Beach tênis · Short set (4 games)',
    description: '1 set de 4 games · No-ad · TB no 4-4 (7 pts)',
    sportId: 'beach-tennis',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 4,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '4-4',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'beach_tennis_best3_super_tb',
    name: 'Beach tênis · Melhor de 3 sets (com super TB)',
    description: 'Sets a 6 · No-ad · TB no 5-5 · 3º set super TB (10 pts)',
    sportId: 'beach-tennis',
    isSystem: true,
    rules: {
      setsCount: 3,
      gamesPerSet: 6,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '5-5',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: true,
    },
  },

  // ── Tennis ───────────────────────────────────────────────────────────────────
  {
    id: 'tennis_cbt_best3_super_tb',
    name: 'Tênis · Melhor de 3 sets (com super TB)',
    description: 'Sets a 6 · Com vantagem · TB no 6-6 · 3º set super TB (10 pts)',
    sportId: 'tennis',
    isSystem: true,
    rules: {
      setsCount: 3,
      gamesPerSet: 6,
      noAd: false,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: true,
    },
  },
  {
    id: 'tennis_cbt_best3_full',
    name: 'Tênis · Melhor de 3 sets completos',
    description: '3 sets a 6 games · Com vantagem · TB no 6-6 (7 pts)',
    sportId: 'tennis',
    isSystem: true,
    rules: {
      setsCount: 3,
      gamesPerSet: 6,
      noAd: false,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'tennis_pro_set_8',
    name: 'Tênis · Pro set (1 set longo a 8 games)',
    description: '1 set longo a 8 games · No-ad · TB no 7-7 (7 pts)',
    sportId: 'tennis',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 8,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '7-7',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'tennis_single_set_6_ad',
    name: 'Tênis · 1 set tradicional com vantagem',
    description: '1 set a 6 games · Com vantagem · TB no 6-6 (7 pts)',
    sportId: 'tennis',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 6,
      noAd: false,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
    },
  },
  {
    id: 'tennis_fast4',
    name: 'Tênis · Fast4 (melhor de 3 a 4 games)',
    description: 'Sets curtos a 4 games · No-ad · TB no 3-3 (7 pts)',
    sportId: 'tennis',
    isSystem: true,
    rules: {
      setsCount: 3,
      gamesPerSet: 4,
      noAd: true,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '3-3',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: true,
    },
  },

  // ── Pickleball ───────────────────────────────────────────────────────────────
  {
    id: 'pickleball_best3_11',
    name: 'Pickleball · Tradicional (melhor de 3 a 11 pts)',
    description: '3 sets a 11 pts · Side-out · Dif. de 2 pts',
    sportId: 'pickleball',
    isSystem: true,
    rules: {
      setsCount: 3,
      gamesPerSet: 11,
      noAd: false,
      switchSidesOdd: false,
      tieBreak: false,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
      pickleballScoringMode: 'side-out',
    },
  },
  {
    id: 'pickleball_single_15',
    name: 'Pickleball · 1 game até 15 pts',
    description: '1 set a 15 pts · Troca de lado nos 8 pts · Dif. de 2 pts',
    sportId: 'pickleball',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 15,
      noAd: false,
      switchSidesOdd: false,
      tieBreak: false,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
      pickleballScoringMode: 'rally',
    },
  },
  {
    id: 'pickleball_single_21',
    name: 'Pickleball · 1 game até 21 pts (rally)',
    description: '1 set a 21 pts · Rally scoring · Dif. de 2 pts',
    sportId: 'pickleball',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 21,
      noAd: false,
      switchSidesOdd: false,
      tieBreak: false,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
      pickleballScoringMode: 'rally',
    },
  },
  {
    id: 'pickleball_single_11',
    name: 'Pickleball · 1 game rápido até 11 pts',
    description: '1 set a 11 pts · Rally scoring · Dif. de 2 pts',
    sportId: 'pickleball',
    isSystem: true,
    rules: {
      setsCount: 1,
      gamesPerSet: 11,
      noAd: false,
      switchSidesOdd: false,
      tieBreak: false,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
      pickleballScoringMode: 'rally',
    },
  },
];

export const getDefaultRulesForSport = (sportId?: string): MatchRulesConfig => {
  if (sportId === 'pickleball') {
    return {
      setsCount: 1,
      gamesPerSet: 11,
      noAd: false,
      switchSidesOdd: false,
      tieBreak: false,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: false,
      pickleballScoringMode: 'rally',
    };
  }
  if (sportId === 'tennis') {
    return {
      setsCount: 3,
      gamesPerSet: 6,
      noAd: false,
      switchSidesOdd: true,
      tieBreak: true,
      tieBreakAt: '6-6',
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      superTieBreakFinalSet: true,
    };
  }
  // Beach tennis (padrão)
  return {
    setsCount: 1,
    gamesPerSet: 6,
    noAd: true,
    switchSidesOdd: true,
    tieBreak: true,
    tieBreakAt: '5-5',
    tieBreakPoints: 7,
    tieBreakWinByTwo: true,
    superTieBreakFinalSet: false,
  };
};

const CUSTOM_PRESETS_STORAGE_KEY = 'myplacar_custom_match_rule_presets';

export const loadCustomPresets = (): MatchRulesPreset[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCustomPreset = (preset: MatchRulesPreset): MatchRulesPreset[] => {
  const existing = loadCustomPresets().filter((p) => p.id !== preset.id);
  const updated = [...existing, preset];
  try {
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erro ao salvar preset personalizado:', err);
  }
  return updated;
};

export const deleteCustomPreset = (presetId: string): MatchRulesPreset[] => {
  const existing = loadCustomPresets().filter((p) => p.id !== presetId);
  try {
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.error('Erro ao excluir preset personalizado:', err);
  }
  return existing;
};

export const getAllPresets = (): MatchRulesPreset[] => {
  return [...SYSTEM_RULE_PRESETS, ...loadCustomPresets()];
};

export const getPhaseCategory = (phase?: string): EventPhaseCategory => {
  if (!phase) return 'groups';
  const p = phase.toLowerCase().trim();
  if (p === 'final' || p === '3lugar' || p.includes('final') || p.includes('3lugar')) return 'final';
  if (p === 'semifinal' || p.includes('semi')) return 'semifinal';
  if (p === 'quartas' || p === 'oitavas' || p.includes('playoff') || p.includes('eliminat')) return 'playoffs';
  return 'groups';
};

export const resolveMatchRules = (
  sportRules?: EventSportRules | null,
  phase?: string,
  fallbackSetsCount: 1 | 3 | 5 = 1,
  fallbackGamesPerSet = 6,
  sportId?: string
): MatchRulesConfig => {
  const defaultRules: MatchRulesConfig =
    sportRules?.defaultRules ??
    (sportId
      ? getDefaultRulesForSport(sportId)
      : {
          setsCount: fallbackSetsCount,
          gamesPerSet: fallbackGamesPerSet,
          noAd: true,
          switchSidesOdd: true,
          tieBreak: true,
          tieBreakAt: '5-5',
          tieBreakPoints: 7,
          tieBreakWinByTwo: true,
          superTieBreakFinalSet: false,
        });

  if (!sportRules?.customPhasesEnabled || !sportRules.phaseRules) {
    return defaultRules;
  }

  const phaseCategory = getPhaseCategory(phase);
  const phaseSpecific = sportRules.phaseRules[phaseCategory];

  return phaseSpecific ?? defaultRules;
};
