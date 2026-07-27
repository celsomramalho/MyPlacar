import { useEffect, useRef, useCallback, useState } from 'react';
import { GameState, GeminiVoiceName, GeminiPersona, ErrorSoundType } from '../../../../types.ts';
import { isTennisTieBreak } from '@modules/game/domain/tennisEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Shared audio infra (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

let sharedAudioContext: AudioContext | null = null;
let hardwareInitialized = false;

export const getSharedAudioContext = () => {
  if (!sharedAudioContext) {
    const AudioContextClass = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass({ sampleRate: 24000 });
    }
  }
  return sharedAudioContext;
};

export const unlockAudio = async () => {
  const ctx = getSharedAudioContext();
  const synth = globalThis.speechSynthesis || (window as unknown as { webkitSynthesis?: SpeechSynthesis }).webkitSynthesis;
  try {
    if (ctx && ctx.state === 'suspended') await ctx.resume();
    if (synth) {
      synth.cancel();
      const ut = new SpeechSynthesisUtterance('');
      ut.volume = 0;
      synth.speak(ut);
    }
    hardwareInitialized = true;
    return true;
  } catch {
    return false;
  }
};

export const playErrorBeep = (type: ErrorSoundType = 'baixo') => {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    const playTone = (freq: number, duration: number, startTime: number = ctx.currentTime) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    switch (type) {
      case 'agudo':    playTone(880, 0.2); break;
      case 'duplo':    playTone(440, 0.1); playTone(440, 0.1, ctx.currentTime + 0.15); break;
      case 'discreto': playTone(600, 0.05); break;
      case 'baixo':
      default:         playTone(150, 0.3); break;
    }
  } catch (e) {
    console.warn('Falha ao tocar beep de erro', e);
  }
};

export const speakSystem = (text: string, voiceURI: string | undefined, volume: number): Promise<void> => {
  return new Promise((resolve) => {
    const win = window as unknown as { AndroidTTS?: { speak: (t: string) => void } };
    if (win.AndroidTTS && typeof win.AndroidTTS.speak === 'function') {
      win.AndroidTTS.speak(text);
      setTimeout(resolve, text.length * 80 + 500);
      return;
    }
    const synth = globalThis.speechSynthesis || (window as unknown as { webkitSpeechSynthesis?: SpeechSynthesis }).webkitSpeechSynthesis;
    if (!synth) { resolve(); return; }
    synth.cancel();
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.volume = volume / 100;
      utterance.rate = 1.1;
      const voices = synth.getVoices();
      const voice = voices.find((v: SpeechSynthesisVoice) => v.voiceURI === voiceURI) ||
                    voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('pt')) ||
                    voices[0];
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    }, 100);
  });
};

export const speakGemini = (
  _text: string,
  _voiceName: GeminiVoiceName,
  _persona: GeminiPersona,
  _volume: number
): Promise<void> => {
  return Promise.reject(new Error('Gemini TTS nao implementado nesta versao do SDK'));
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — texto
// ─────────────────────────────────────────────────────────────────────────────

const ORDINALS = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'];
const ordinalSet = (n: number): string => ORDINALS[n] ?? `${n + 1}o`;

const NUM_WORDS: Record<number, string> = {
  0: 'zero', 1: 'um', 2: 'dois', 3: 'tres', 4: 'quatro',
  5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
};
const numToWord = (n: number): string => NUM_WORDS[n] ?? n.toString();

/**
 * Fonética pt-BR de "tie-break" para engines TTS.
 * "tái-breique" é pronunciado corretamente pelo Google, Microsoft e Apple TTS pt-BR.
 * Mude aqui para ajustar a pronúncia globalmente.
 */
export const TIE_BREAK_TTS = 'tái-breique';

/**
 * Fonética pt-BR de "ace" para engines TTS.
 * "éis" reproduz a pronúncia inglesa usada pelos narradores esportivos brasileiros.
 * Mude aqui para ajustar globalmente.
 */
export const ACE_TTS = 'eisse';

/** "saque do João" ou "saque da Salete" — usa gênero explícito do GameState; heurística só como fallback */
const saquePrep = (name: string, gender?: 'M' | 'F'): string => {
  const feminine = gender === 'F' ||
    (gender == null && /[aáàãâéèêíìîóòõôúùû]$/i.test(name.trim()));
  return feminine ? `da ${name}` : `do ${name}`;
};

/** Retorna o gênero do sacador atual conforme servingOrderOffset */
const getServerGender = (state: GameState): 'M' | 'F' | undefined => {
  const { p1, p2, servingOrderOffset, matchConfig } = state;
  if (matchConfig.isDoubles) {
    switch (servingOrderOffset % 4) {
      case 0: return p1.gender;
      case 1: return p2.gender;
      case 2: return p1.partnerGender;
      case 3: return p2.partnerGender;
    }
  }
  return servingOrderOffset % 2 === 0 ? p1.gender : p2.gender;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — sacador
// offset: 0=J1(time1) 1=J2(time2) 2=J3/parceiro-time1 3=J4/parceiro-time2
// ─────────────────────────────────────────────────────────────────────────────

const getServerName = (state: GameState): string => {
  const { p1, p2, servingOrderOffset, matchConfig } = state;
  if (matchConfig.isDoubles) {
    switch (servingOrderOffset % 4) {
      case 0: return p1.name;
      case 1: return p2.name;
      case 2: return p1.partnerName || p1.name;
      case 3: return p2.partnerName || p2.name;
    }
  }
  return servingOrderOffset % 2 === 0 ? p1.name : p2.name;
};

/** [games do sacador, games do recebedor] */
const getGamesFromServer = (state: GameState): [number, number] =>
  state.server === 1
    ? [state.p1.games, state.p2.games]
    : [state.p2.games, state.p1.games];

/** [sets ganhos pelo sacador, sets ganhos pelo recebedor] */
const getSetsWonFromServer = (state: GameState): [number, number] => {
  const p1Sets = state.p1.sets.filter((s, i) => s > (state.p2.sets[i] ?? 0)).length;
  const p2Sets = state.p2.sets.filter((s, i) => s > (state.p1.sets[i] ?? 0)).length;
  return state.server === 1 ? [p1Sets, p2Sets] : [p2Sets, p1Sets];
};

/** Placar do ultimo set encerrado, perspectiva do sacador atual */
const getLastSetScoreFromServer = (state: GameState): [number, number] => {
  const idx = state.p1.sets.length - 1;
  if (idx < 0) return [0, 0];
  const s1 = state.p1.sets[idx];
  const s2 = state.p2.sets[idx];
  return state.server === 1 ? [s1, s2] : [s2, s1];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — placar do game
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_MAP: Record<string, string> = {
  '0': 'zero', '15': 'quinze', '30': 'trinta', '40': 'quarenta', 'Ad': 'vantagem',
};
const mapScore = (s: string): string => SCORE_MAP[s] ?? s;

const getGameScoreText = (state: GameState): string => {
  const { p1, p2, server } = state;
  const serverScore   = server === 1 ? p1.score : p2.score;
  const receiverScore = server === 1 ? p2.score : p1.score;
  const serverName    = getServerName(state);
  const receiverName  = server === 1 ? p2.name : p1.name;

  if (serverScore === '40' && receiverScore === '40') return 'quarenta iguais';
  if (serverScore === '30' && receiverScore === '30') return 'trinta iguais';
  if (serverScore === '15' && receiverScore === '15') return 'quinze iguais';
  if (serverScore === 'Ad')   return `vantagem ${serverName}`;
  if (receiverScore === 'Ad') return `vantagem ${receiverName}`;
  return `${mapScore(serverScore)} a ${mapScore(receiverScore)}`;
};

const getTieBreakScoreText = (state: GameState): string => {
  const srv = state.server === 1 ? state.p1.score : state.p2.score;
  const rcv = state.server === 1 ? state.p2.score : state.p1.score;
  return `${srv} a ${rcv}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — set point / match point
// ─────────────────────────────────────────────────────────────────────────────

const isTennisSport = (state: GameState) =>
  state.matchConfig.sportType === 'tennis' || state.matchConfig.sportType === 'beach-tennis';

const wouldWinSet = (winnerGames: number, loserGames: number, gamesLimit: number): boolean => {
  const wg = winnerGames + 1;
  if (wg >= gamesLimit && wg >= loserGames + 2) return true;
  if (wg > gamesLimit) return true;
  return false;
};

const whoHasSetPoint = (state: GameState): 1 | 2 | null => {
  if (!isTennisSport(state) || state.isMatchOver) return null;
  const isTB = isTennisTieBreak(state);
  const { p1, p2, matchConfig } = state;

  if (isTB) {
    const target = Number(matchConfig.tieBreakPoints) || 7;
    const s1 = parseInt(p1.score) || 0;
    const s2 = parseInt(p2.score) || 0;
    if (matchConfig.tieBreakWinByTwo) {
      if (s1 >= target - 1 && s1 >= s2 + 1) return 1;
      if (s2 >= target - 1 && s2 >= s1 + 1) return 2;
    } else {
      if (s1 === target - 1) return 1;
      if (s2 === target - 1) return 2;
    }
    return null;
  }

  const gamesLimit = Number(matchConfig.gamesPerSet) || 6;
  const checkSetPoint = (scorer: 1 | 2): boolean => {
    const sScore = scorer === 1 ? p1.score : p2.score;
    const oScore = scorer === 1 ? p2.score : p1.score;
    const sGames = scorer === 1 ? p1.games : p2.games;
    const oGames = scorer === 1 ? p2.games : p1.games;
    if (!wouldWinSet(sGames, oGames, gamesLimit)) return false;
    if (sScore === '40' && oScore !== 'Ad' && oScore !== '40') return true;
    if (sScore === 'Ad') return true;
    if (matchConfig.noAd && sScore === '40' && oScore === '40') return true;
    return false;
  };

  if (checkSetPoint(1)) return 1;
  if (checkSetPoint(2)) return 2;
  return null;
};

const whoHasMatchPoint = (state: GameState): 1 | 2 | null => {
  if (!isTennisSport(state) || state.isMatchOver) return null;
  const setsToWin = Math.ceil((state.matchConfig.setsToWin ?? 1));
  const setsNeeded = Math.ceil(setsToWin / 2) || 1;
  const p1SetsWon = state.p1.sets.filter((s, i) => s > (state.p2.sets[i] ?? 0)).length;
  const p2SetsWon = state.p2.sets.filter((s, i) => s > (state.p1.sets[i] ?? 0)).length;
  const setPoint = whoHasSetPoint(state);
  if (p1SetsWon === setsNeeded - 1 && setPoint === 1) return 1;
  if (p2SetsWon === setsNeeded - 1 && setPoint === 2) return 2;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — troca de lado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Troca de lado em game normal.
 * Regra: switchSidesOdd=true -> troca quando total de games do set eh impar.
 * totalGamesInSet = soma dos games do set ATUAL (ja incluindo o game recem-ganho).
 */
const shouldSwitchSidesNewGame = (state: GameState, totalGamesInSet: number): boolean => {
  if (!state.matchConfig.switchSidesOdd) return false;
  return totalGamesInSet % 2 !== 0;
};

/**
 * Troca de lado no tie-break conforme tieBreakSideSwitchMode.
 * '1_6': 1o ponto e depois a cada 6 (total 1,7,13...)
 * '1_4': 1o ponto e depois a cada 4 (total 1,5,9...)
 * '1_2': todo ponto impar (total 1,3,5...)
 *  null: nunca
 */
const shouldSwitchSidesTieBreak = (state: GameState): boolean => {
  const mode = state.matchConfig.tieBreakSideSwitchMode;
  if (!mode) return false;
  const s1 = parseInt(state.p1.score) || 0;
  const s2 = parseInt(state.p2.score) || 0;
  const total = s1 + s2;
  if (total === 0) return false;
  switch (mode) {
    case '1_6': return total === 1 || (total > 1 && (total - 1) % 6 === 0);
    case '1_4': return total === 1 || (total > 1 && (total - 1) % 4 === 0);
    case '1_2': return total % 2 === 1;
    default:    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Nomes dos vencedores
// ─────────────────────────────────────────────────────────────────────────────

const getWinnerNames = (state: GameState): string => {
  const p1SetsWon = state.p1.sets.filter((s, i) => s > (state.p2.sets[i] ?? 0)).length;
  const p2SetsWon = state.p2.sets.filter((s, i) => s > (state.p1.sets[i] ?? 0)).length;
  const p1Wins = p1SetsWon > p2SetsWon;
  if (state.matchConfig.isDoubles) {
    if (p1Wins) {
      const partner = state.p1.partnerName ? ` e ${state.p1.partnerName}` : '';
      return `${state.p1.name}${partner}`;
    } else {
      const partner = state.p2.partnerName ? ` e ${state.p2.partnerName}` : '';
      return `${state.p2.name}${partner}`;
    }
  }
  return p1Wins ? state.p1.name : state.p2.name;
};

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER TENIS / BEACH TENIS
// ─────────────────────────────────────────────────────────────────────────────

interface AnnounceContext {
  prevPointCount: number;
  prevSet: number;
  prevIsTB: boolean;
  isMatchStart: boolean;
}

export const buildAnnouncementTennis = (
  state: GameState,
  ctx: AnnounceContext
): string | null => {
  const { prevPointCount, prevSet, prevIsTB, isMatchStart } = ctx;
  const currentPointCount = state.pointHistory?.length ?? 0;
  const currentIsTB = isTennisTieBreak(state);
  const serverName = getServerName(state);

  // A) Inicio da partida
  if (isMatchStart) {
    return `Partida iniciada, placar do game zero a zero, saque ${saquePrep(serverName, getServerGender(state))}.`;
  }

  // Correcao (undo)
  if (currentPointCount < prevPointCount) {
    const gameScore = getGameScoreText(state);
    return `Placar corrigido, placar do game ${gameScore}, saque ${saquePrep(serverName, getServerGender(state))}.`;
  }

  // E) Fim da partida
  if (state.isMatchOver) {
    const [servSets, recvSets] = getSetsWonFromServer(state);
    const winners = getWinnerNames(state);
    return `Fim da partida, placar ${numToWord(servSets)} a ${numToWord(recvSets)}, vencedores ${winners}.`;
  }

  // D) Fim do set / inicio do proximo
  if (state.currentSet !== prevSet) {
    const finishedSetIdx = state.currentSet - 1;
    const [servLastSet, recvLastSet] = getLastSetScoreFromServer(state);
    const totalGamesFinished = (state.p1.sets[finishedSetIdx] ?? 0) + (state.p2.sets[finishedSetIdx] ?? 0);
    const sideSwitch = shouldSwitchSidesNewGame(state, totalGamesFinished) ? ' Troca de lado.' : '';
    return (
      `Fim do ${ordinalSet(finishedSetIdx)} set, ` +
      `placar ${numToWord(servLastSet)} a ${numToWord(recvLastSet)}, ` +
      `inicio do ${ordinalSet(state.currentSet)} set, ` +
      `placar do game zero a zero, saque ${saquePrep(serverName, getServerGender(state))}.` +
      sideSwitch
    );
  }

  // H) Inicio do tie-break
  if (!prevIsTB && currentIsTB) {
    const [gamesServ, gamesRecv] = getGamesFromServer(state);
    return (
      `Placar do set ${numToWord(gamesServ)} a ${numToWord(gamesRecv)}, ` +
      `inicio do ${TIE_BREAK_TTS}, zero a zero, saque ${saquePrep(serverName, getServerGender(state))}.`
    );
  }

  // I) Durante o tie-break
  if (currentIsTB) {
    const tbScore = getTieBreakScoreText(state);
    const sideSwitch = shouldSwitchSidesTieBreak(state) ? ', troca de lado' : '';
    return `${tbScore}, saque ${saquePrep(serverName, getServerGender(state))}${sideSwitch}.`;
  }

  // B) Inicio de game (nao o primeiro da partida)
  const isNewGame = state.p1.score === '0' && state.p2.score === '0';
  if (isNewGame) {
    const [gamesServ, gamesRecv] = getGamesFromServer(state);
    const totalGames = gamesServ + gamesRecv;
    const sideSwitch = shouldSwitchSidesNewGame(state, totalGames) ? ' Troca de lado.' : '';
    return (
      `Placar do set ${numToWord(gamesServ)} a ${numToWord(gamesRecv)}, ` +
      `placar do game zero a zero, saque ${saquePrep(serverName, getServerGender(state))}.` +
      sideSwitch
    );
  }

  // G) Match point (tem prioridade sobre set point)
  const matchPointTeam = whoHasMatchPoint(state);
  if (matchPointTeam !== null) {
    const mpName = matchPointTeam === 1 ? state.p1.name : state.p2.name;
    const gameScore = getGameScoreText(state);
    const [gamesServ, gamesRecv] = getGamesFromServer(state);
    return `Match point ${mpName}! Placar do set ${numToWord(gamesServ)} a ${numToWord(gamesRecv)}, placar do game ${gameScore}.`;
  }

  // F) Set point
  const setPointTeam = whoHasSetPoint(state);
  if (setPointTeam !== null) {
    const spName = setPointTeam === 1 ? state.p1.name : state.p2.name;
    const gameScore = getGameScoreText(state);
    const [gamesServ, gamesRecv] = getGamesFromServer(state);
    return `Set point ${spName}! Placar do set ${numToWord(gamesServ)} a ${numToWord(gamesRecv)}, placar do game ${gameScore}.`;
  }

  // C) Durante o game
  const lastPoint = state.pointHistory?.[state.pointHistory.length - 1];
  const gameScore = getGameScoreText(state);
  const sportType = state.matchConfig.sportType;
  if (lastPoint?.type === 'ace')   return `${ACE_TTS}! Placar do game ${gameScore}.`;
  if (lastPoint?.type === 'fault') {
    const faultLabel = sportType === 'beach-tennis' ? 'Erro de saque' : 'Dupla falta';
    return `${faultLabel}, placar do game ${gameScore}.`;
  }
  return `Placar do game ${gameScore}.`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const announcedStartMatchIds = new Set<string>();

export const useScoreAnnouncer = (gameState: GameState) => {
  const [isAnnouncing, setIsAnnouncing] = useState(false);

  const prevPointCount     = useRef(gameState?.pointHistory?.length ?? 0);
  const prevIsTB           = useRef(false);
  const prevServer         = useRef(gameState.server);
  const prevOffset         = useRef(gameState.servingOrderOffset);
  const prevSet            = useRef(gameState.currentSet);
  const prevP1Gender = useRef(gameState.p1?.gender);
  const prevP2Gender = useRef(gameState.p2?.gender);
  const announcedStartFor  = useRef<string | null>(null);
  const announcedFinishFor = useRef<string | null>(null);
  const lastAnnouncedText  = useRef<string>('');
  const lastChangeTime = useRef<number>(0);
  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // startAnnounceTimer: debounce para o anúncio de início de partida no modo live.
  // Evita que múltiplas recriações do `announce` callback (causadas por sync de configs
  // do Firestore) disparem o anúncio de "partida iniciada" várias vezes.
  const startAnnounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    voiceScoring, useGeminiVoice, geminiVoiceName, geminiPersona,
    selectedVoiceURI, volume, sportType,
  } = gameState.matchConfig;

  const announce = useCallback(async (text: string) => {
    if (!text || !voiceScoring) return;
    if (text === lastAnnouncedText.current) return;
    lastAnnouncedText.current = text;
    setIsAnnouncing(true);
    if (!hardwareInitialized) await unlockAudio();
    try {
      if (useGeminiVoice) {
        try { await speakGemini(text, geminiVoiceName, geminiPersona, volume); }
        catch { await speakSystem(text, selectedVoiceURI, volume); }
      } else {
        await speakSystem(text, selectedVoiceURI, volume);
      }
    } finally {
      setIsAnnouncing(false);
    }
  }, [voiceScoring, useGeminiVoice, geminiVoiceName, geminiPersona, selectedVoiceURI, volume]);

  // Ref sempre atualizada com o `announce` mais recente — permite que o useEffect
  // principal chame a versão atual sem precisar listá-la como dependência.
  const announceRef = useRef(announce);
  useEffect(() => { announceRef.current = announce; }, [announce]);

  // Botao manual de anuncio do placar completo
  // Anúncio manual — apenas tênis/beach tênis.
  // Pickleball usa usePickleballAnnouncer.announceFullScore.
  const announceFullScore = useCallback(() => {
    if (!isTennisSport(gameState)) return;
    const isTB = isTennisTieBreak(gameState);
    const serverName = getServerName(gameState);
    const [gamesServ, gamesRecv] = getGamesFromServer(gameState);
    let text: string;
    if (isTB) {
      const tbScore = getTieBreakScoreText(gameState);
      text = `${TIE_BREAK_TTS}, ${tbScore}, saque ${saquePrep(serverName, getServerGender(gameState))}.`;
    } else {
      const gameScore = getGameScoreText(gameState);
      text = (
        `Placar do set ${numToWord(gamesServ)} a ${numToWord(gamesRecv)}, ` +
        `placar do game ${gameScore}, saque ${saquePrep(serverName, getServerGender(gameState))}.`
      );
    }
    lastAnnouncedText.current = '';
    announce(text);
  }, [gameState, announce]);

  // Limpa os timers de debounce se o componente for desmontado
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (startAnnounceTimer.current) clearTimeout(startAnnounceTimer.current);
    };
  }, []);

  // Effect unico com cascata de prioridade
  useEffect(() => {
    // Pickleball é tratado exclusivamente em usePickleballAnnouncer.ts
    if (!isTennisSport(gameState)) return;

    const currentPointCount = gameState?.pointHistory?.length ?? 0;
    const currentIsTB = isTennisTieBreak(gameState);

    // Se o gender mudou (usuário alterou na tela de nomes e clicou Play),
    // só reseta o guard se a partida ainda não teve seu início anunciado.
    const genderChanged = prevP1Gender.current !== undefined &&
      (prevP1Gender.current !== gameState.p1?.gender || prevP2Gender.current !== gameState.p2?.gender);
    if (genderChanged && currentPointCount === 0 && !announcedStartMatchIds.has(gameState.matchId)) {
      announcedStartFor.current = null;
      lastAnnouncedText.current = '';
    }
    prevP1Gender.current = gameState.p1?.gender;
    prevP2Gender.current = gameState.p2?.gender;

    // Inicio da partida — anunciado no máximo UMA vez por matchId.
    // No modo live, usa debounce de 800ms para absorver os múltiplos setGameState
    // disparados pela inicialização do Firestore (pending write + confirmação do servidor).
    if (currentPointCount === 0 && announcedStartFor.current !== gameState.matchId && !announcedStartMatchIds.has(gameState.matchId)) {
      announcedStartFor.current = gameState.matchId;
      announcedStartMatchIds.add(gameState.matchId);
      prevPointCount.current = 0;
      prevSet.current = gameState.currentSet;
      prevIsTB.current = false;
      prevServer.current = gameState.server;
      prevOffset.current = gameState.servingOrderOffset;
      // Captura snapshot do gameState para o texto (evita closure stale)
      const capturedState = gameState;
      const scheduleStart = () => {
        if (startAnnounceTimer.current) clearTimeout(startAnnounceTimer.current);
        startAnnounceTimer.current = setTimeout(() => {
          const text = buildAnnouncementTennis(capturedState, {
            prevPointCount: 0, prevSet: capturedState.currentSet, prevIsTB: false, isMatchStart: true,
          });
          if (text) announceRef.current(text);
        }, capturedState.isMirroringActive ? 800 : 0);
      };
      scheduleStart();
      return;
    }

    const pointChanged  = currentPointCount !== prevPointCount.current;
    const serverChanged = gameState.server !== prevServer.current;
    if (!pointChanged && !serverChanged) return;

    // Controle de anúncios em rajada (reconexão / perda de sincronismo)
    const now = Date.now();
    const elapsed = now - lastChangeTime.current;
    lastChangeTime.current = now;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    const isBatchUpdate = (currentPointCount - prevPointCount.current) > 1;
    const isRapidSequence = elapsed < 2000 && gameState.isMirroringActive && currentPointCount > 0;

    if (isBatchUpdate || isRapidSequence) {
      // Sincroniza referências para evitar que o próximo ponto síncrono dispare anúncios velhos
      prevPointCount.current  = currentPointCount;
      prevIsTB.current        = currentIsTB;
      prevServer.current      = gameState.server;
      prevOffset.current      = gameState.servingOrderOffset;
      prevSet.current         = gameState.currentSet;

      // Agenda o anúncio do placar final consolidado
      debounceTimer.current = setTimeout(() => {
        announceFullScore();
      }, 1500);
      return;
    }

    // Fim da partida
    if (gameState.isMatchOver && announcedFinishFor.current !== gameState.matchId) {
      announcedFinishFor.current = gameState.matchId;
      const text = buildAnnouncementTennis(gameState, {
        prevPointCount: prevPointCount.current, prevSet: prevSet.current,
        prevIsTB: prevIsTB.current, isMatchStart: false,
      });
      if (text) announce(text);
      prevPointCount.current  = currentPointCount;
      prevIsTB.current        = currentIsTB;
      prevServer.current      = gameState.server;
      prevOffset.current      = gameState.servingOrderOffset;
      prevSet.current         = gameState.currentSet;
      return;
    }

    // Todos os outros eventos
    const text = buildAnnouncementTennis(gameState, {
      prevPointCount: prevPointCount.current, prevSet: prevSet.current,
      prevIsTB: prevIsTB.current, isMatchStart: false,
    });
    if (text) announce(text);

    prevPointCount.current  = currentPointCount;
    prevIsTB.current        = currentIsTB;
    prevServer.current      = gameState.server;
    prevOffset.current      = gameState.servingOrderOffset;
    prevSet.current         = gameState.currentSet;

  }, [
    // IMPORTANTE: só pointHistory.length e matchId como gatilhos primários.
    // p1.score, p2.score, server e servingOrderOffset mudam no mesmo batch que
    // pointHistory.length ao fim de um game — mantê-los aqui dispara o effect
    // duas vezes e gera anúncios duplicados. Toda informação necessária já está
    // no gameState completo capturado dentro do effect.
    // gender: incluído para re-anunciar corretamente quando o usuário muda o
    // gênero na tela de nomes e clica Play sem iniciar nova partida.
    // NOTA: `announce` foi removido das deps intencionalmente — o announceRef
    // garante que sempre usamos a versão mais recente sem re-executar o effect
    // por mudanças de configuração de voz (que causavam anúncios duplicados no live).
    gameState?.pointHistory?.length,
    gameState.isMatchOver,
    gameState.matchId,
    gameState.p1?.gender,
    gameState.p2?.gender,
    sportType,
  ]);

  return { announceFullScore, isAnnouncing };
};
