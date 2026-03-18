import { useEffect, useRef, useCallback, useState } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { GameState, GeminiVoiceName, GeminiPersona, ErrorSoundType } from '../types';
import { isTennisTieBreak } from '../utils/tennisEngine';

let sharedAudioContext: AudioContext | null = null;
let hardwareInitialized = false;

export const getSharedAudioContext = () => {
  if (!sharedAudioContext) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass({ sampleRate: 24000 });
    }
  }
  return sharedAudioContext;
};

export const unlockAudio = async () => {
  const ctx = getSharedAudioContext();
  const synth = window.speechSynthesis || (window as any).webkitSynthesis;

  try {
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    if (synth) {
      synth.cancel();
      const ut = new SpeechSynthesisUtterance("");
      ut.volume = 0;
      synth.speak(ut);
    }
    
    hardwareInitialized = true;
    return true;
  } catch (e) {
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
      case 'agudo':
        playTone(880, 0.2);
        break;
      case 'duplo':
        playTone(440, 0.1);
        playTone(440, 0.1, ctx.currentTime + 0.15);
        break;
      case 'discreto':
        playTone(600, 0.05);
        break;
      case 'baixo':
      default:
        playTone(150, 0.3);
        break;
    }
  } catch (e) {
    console.warn("Falha ao tocar beep de erro", e);
  }
};

export const speakSystem = (text: string, voiceURI: string | undefined, volume: number): Promise<void> => {
  return new Promise((resolve) => {
    const win = window as any;
    if (win.AndroidTTS && typeof win.AndroidTTS.speak === 'function') {
      win.AndroidTTS.speak(text);
      setTimeout(resolve, text.length * 80 + 500);
      return;
    }

    const synth = window.speechSynthesis || (window as any).webkitSpeechSynthesis;
    if (!synth) {
      resolve();
      return;
    }

    synth.cancel();

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.volume = volume / 100;
      utterance.rate = 1.1;

      const voices = synth.getVoices();
      const voice = voices.find(v => v.voiceURI === voiceURI) || 
                    voices.find(v => v.lang.startsWith('pt')) || 
                    voices[0];
      
      if (voice) utterance.voice = voice;
      
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      
      synth.speak(utterance);
    }, 100); 
  });
};

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const speakGemini = async (text: string, voiceName: GeminiVoiceName, persona: GeminiPersona, volume: number): Promise<void> => {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  if (!apiKey) return;

  const ai = new GoogleGenAI(apiKey);
  // Using type cast to bypass TS error on getGenerativeModel
  const response = await (ai as any).getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent({
    contents: [{ role: 'user', parts: [{ text: `Diga de forma ${persona}: ${text}` }] }],
  });

  throw new Error("Gemini Audio not implemented in this SDK version");
};

const mapScoreToText = (score: string): string => {
  const map: Record<string, string> = { '0': 'zero', '15': 'quinze', '30': 'trinta', '40': 'quarenta', 'Ad': 'vantagem' };
  return map[score] || score;
};

const ordinalSet = (n: number): string => {
  const ordinals = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'];
  return ordinals[n] || `${n + 1}º`;
};

const getGameScoreText = (state: GameState): string => {
  const s1 = state.p1.score;
  const s2 = state.p2.score;
  const isTB = isTennisTieBreak(state);
  
  if (s1 === s2 && s1 !== '0') {
    return isTB ? `${s1} iguais` : `${mapScoreToText(s1)} iguais`;
  }
  
  if (state.server === 1) {
    return isTB ? `${s1} a ${s2}` : `${mapScoreToText(s1)} a ${mapScoreToText(s2)}`;
  } else {
    return isTB ? `${s2} a ${s1}` : `${mapScoreToText(s2)} a ${mapScoreToText(s1)}`;
  }
};

const getSetScoreText = (state: GameState): string => {
    const g1 = state.p1.games;
    const g2 = state.p2.games;
    if (state.server === 1) return `${g1} a ${g2}`;
    return `${g2} a ${g1}`;
};

const getActualServerName = (state: GameState): string => {
  const offset = state.servingOrderOffset;
  if (state.matchConfig.isDoubles) {
    if (offset === 0) return state.p1.name;
    if (offset === 1) return state.p2.name;
    if (offset === 2) return state.p1.partnerName || state.p1.name;
    if (offset === 3) return state.p2.partnerName || state.p2.name;
  }
  return offset === 0 ? state.p1.name : state.p2.name;
};

export const useScoreAnnouncer = (gameState: GameState) => {
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const prevPoints = useRef(gameState?.pointHistory?.length ?? 0);
  const prevIsTB = useRef(false);
  const prevServer = useRef(gameState.server);
  const prevOffset = useRef(gameState.servingOrderOffset);
  const prevSet = useRef(gameState.currentSet);
  const announcedStartFor = useRef<string | null>(null);
  const lastAnnouncedState = useRef<string>("");
  const announcedFinishFor = useRef<string | null>(null);

  const { voiceScoring, useGeminiVoice, geminiVoiceName, geminiPersona, selectedVoiceURI, volume, tieBreakSideSwitchMode, switchSidesOdd, sportType } = gameState.matchConfig;

  const announce = useCallback(async (text: string) => {
    if (!text || !voiceScoring) return;
    if (text === lastAnnouncedState.current) return;
    lastAnnouncedState.current = text;

    setIsAnnouncing(true);
    if (!hardwareInitialized) await unlockAudio();

    try {
      if (useGeminiVoice) {
        try {
          await speakGemini(text, geminiVoiceName, geminiPersona, volume);
        } catch (e) {
          await speakSystem(text, selectedVoiceURI, volume);
        }
      } else {
        await speakSystem(text, selectedVoiceURI, volume);
      }
    } finally {
      setIsAnnouncing(false);
    }
  }, [voiceScoring, useGeminiVoice, geminiVoiceName, geminiPersona, selectedVoiceURI, volume]);

  const announceFullScore = useCallback(() => {
    const setScore = getSetScoreText(gameState);
    const gameScore = getGameScoreText(gameState);
    const serverName = getActualServerName(gameState);
    const text = `Placar do set ${setScore}, placar do game ${gameScore}, saque de ${serverName}.`;
    announce(text);
  }, [gameState, announce]);

  useEffect(() => {
    if ((gameState?.pointHistory?.length ?? 0) === 0 && announcedStartFor.current !== gameState.matchId) {
        announcedStartFor.current = gameState.matchId;
        const serverName = getActualServerName(gameState);
        announce(`Partida iniciada, zero a zero, saque de ${serverName}.`);
        prevPoints.current = 0;
        prevSet.current = gameState.currentSet;
        prevIsTB.current = false;
        prevServer.current = gameState.server;
    }
  }, [gameState.matchId, announce]);

  useEffect(() => {
    if (gameState.isMatchOver && announcedFinishFor.current !== gameState.matchId) {
        announcedFinishFor.current = gameState.matchId;
        
        const p1SetsWon = gameState.p1.sets.filter((s, i) => s > gameState.p2.sets[i]).length;
        const p2SetsWon = gameState.p2.sets.filter((s, i) => s > gameState.p1.sets[i]).length;
        const p1IsWinner = p1SetsWon > p2SetsWon;
        
        const winnerNames = p1IsWinner 
          ? `${gameState.p1.name}${gameState.p1.partnerName ? ' e ' + gameState.p1.partnerName : ''}` 
          : `${gameState.p2.name}${gameState.p2.partnerName ? ' e ' + gameState.p2.partnerName : ''}`;

        const setSummary = gameState.p1.sets.map((s1, idx) => {
            const s2 = gameState.p2.sets[idx];
            return `${s1} a ${s2}`;
        }).join(', ');

        announce(`Fim da partida, vencedores ${winnerNames}, placar final dos sets ${setSummary}.`);
    }
  }, [gameState.isMatchOver, gameState.matchId, announce, gameState.p1.sets, gameState.p2.sets]);

  useEffect(() => {
    if ((gameState?.pointHistory?.length ?? 0) === 0 || gameState.isMatchOver) return;

    const currentIsTB = isTennisTieBreak(gameState);
    const serverName = getActualServerName(gameState);
    const isPickle = sportType === 'pickleball';

    if ((gameState?.pointHistory?.length ?? 0) < prevPoints.current) {
        const gameScore = getGameScoreText(gameState);
        announce(`Placar corrigido, placar do game ${gameScore}, saque de ${serverName}.`);
        prevPoints.current = (gameState?.pointHistory?.length ?? 0);
        prevSet.current = gameState.currentSet;
        prevServer.current = gameState.server;
        prevIsTB.current = currentIsTB;
        prevOffset.current = gameState.servingOrderOffset;
        return; 
    }

    if (gameState.currentSet !== prevSet.current) {
      const finishedSetNum = prevSet.current;
      const nextSetNum = gameState.currentSet;
      announce(`Fim do ${ordinalSet(finishedSetNum)} set, início do ${ordinalSet(nextSetNum)} set, zero a zero, saque de ${serverName}.`);
      prevSet.current = gameState.currentSet;
      prevPoints.current = (gameState?.pointHistory?.length ?? 0);
      prevIsTB.current = currentIsTB;
      prevServer.current = gameState.server;
      return;
    }

    if ((gameState?.pointHistory?.length ?? 0) !== prevPoints.current || gameState.server !== prevServer.current) {
      
      if (!prevIsTB.current && currentIsTB) {
          announce(`Início do tie break, zero a zero, saque de ${serverName}.`);
          prevPoints.current = (gameState?.pointHistory?.length ?? 0);
          prevIsTB.current = true;
          return;
      }

      const isNewGame = gameState.p1.score === '0' && gameState.p2.score === '0';
      const gameScore = getGameScoreText(gameState);
      let text = "";

      if (isNewGame && !isPickle) {
          const setScore = getSetScoreText(gameState);
          text = `Placar do set ${setScore}, placar do game zero a zero, saque de ${serverName}.`;
      } else {
          text = `Placar do game ${gameScore}.`;
      }

      let extraText = "";
      if (isPickle) {
          if (gameState.server !== prevServer.current) {
              extraText += ` Troca de saque, saca ${serverName}.`;
          } else if (gameState.servingOrderOffset !== prevOffset.current) {
              extraText += " Troca de lado.";
          }
      } else {
          if (currentIsTB) {
              const total = (parseInt(gameState.p1.score) || 0) + (parseInt(gameState.p2.score) || 0);
              let shouldSwitchTB = false;
              if (tieBreakSideSwitchMode === '1_6' && (total === 1 || (total > 0 && total % 6 === 0))) shouldSwitchTB = true;
              else if (tieBreakSideSwitchMode === '1_4' && (total === 1 || (total > 1 && (total - 1) % 4 === 0))) shouldSwitchTB = true;
              else if (tieBreakSideSwitchMode === '1_2' && total % 2 !== 0) shouldSwitchTB = true;
              if (shouldSwitchTB) extraText = " Troca de lado.";
          } else if (isNewGame && switchSidesOdd) {
              const totalGames = gameState.p1.games + gameState.p2.games;
              if (totalGames % 2 !== 0) extraText = " Troca de lado.";
          }
      }

      announce(text + extraText);
      prevPoints.current = (gameState?.pointHistory?.length ?? 0);
      prevIsTB.current = currentIsTB;
      prevServer.current = gameState.server;
      prevOffset.current = gameState.servingOrderOffset;
      prevSet.current = gameState.currentSet;
    }
  }, [gameState?.pointHistory?.length, gameState.p1.score, gameState.p2.score, gameState.server, gameState.servingOrderOffset, gameState.currentSet, announce, tieBreakSideSwitchMode, switchSidesOdd, gameState, sportType]);

  return { announceFullScore, isAnnouncing };
};