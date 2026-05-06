
import { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceCommands, PointType } from '../types.ts';

// Declarações locais da Web Speech API — não incluídas no lib.dom.d.ts padrão do TypeScript
interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number; }
interface SpeechRecognitionResult { readonly isFinal: boolean; readonly length: number; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { readonly length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { readonly error: string; readonly message: string; }

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface UseGeminiRefereeProps {
  onScoreP1: (type: PointType, text: string) => void;
  onScoreP2: (type: PointType, text: string) => void;
  onUndo: (text: string) => void;
  onRawTranscript?: (text: string) => void;
  onSwitchServer: () => void;
  onKeepAlive?: () => void;
  onAnnounceScore: () => void;
  onCommandError?: (text: string) => void;
  isEnabled: boolean;
  p1Name?: string;
  p2Name?: string;
  p1Partner?: string;
  p2Partner?: string;
  p1Color?: string;
  p2Color?: string;
  server: 1 | 2;
  servingOrderOffset: number;
  voiceCommands: VoiceCommands;
  actionCooldownSec: number;
  stateLockoutSec: number;
}

const FONETICA = {
    ponto: ['ponto', 'ponte', 'ponta', 'pinto'],
    ace: ['ace', 'aice', 'aize', 'ease', 'as', 'ice', 'ase', 'ês', 'es', 'ise'],
    saque: ['saque', 'saqui', 'sacou', 'sac'],
    falta: ['falta', 'erro', 'errado', 'errar'],
    sacador: ['sacador', 'servidor', 'quem saca', 'quem sacou', 'sacando'],
    contra: ['contra', 'recebedor', 'quem recebe', 'contira', 'contar'],
    voltar: ['voltar', 'desfazer', 'corrigir', 'corrige', 'último'],
    trocar: ['trocar', 'inverter', 'mudar', 'vira'],
    placar: ['placar', 'quanto', 'score'],
    conectivos: ['e', 'com', 'mais']
};

export const useGeminiReferee = ({ 
    onScoreP1, onScoreP2, onUndo, onRawTranscript, onSwitchServer, onAnnounceScore, onCommandError,
    isEnabled, p1Name, p2Name, p1Partner, p2Partner, p1Color, p2Color, server, voiceCommands, actionCooldownSec
}: UseGeminiRefereeProps) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRunRef = useRef<boolean>(false); // controla se onend deve reiniciar
  const isStartingRef = useRef<boolean>(false); // guard: true entre start() e onstart — impede stop() prematuro
  const lastActionTimeRef = useRef<number>(0);
  const lastProcessedTextRef = useRef<string>('');

  const callbacksRef = useRef({ 
      onScoreP1, onScoreP2, onUndo, onRawTranscript, onSwitchServer, onAnnounceScore, onCommandError,
      p1Name, p2Name, p1Partner, p2Partner, p1Color, p2Color, server, voiceCommands,
      actionCooldownSec
  });

  useEffect(() => {
    callbacksRef.current = { 
        onScoreP1, onScoreP2, onUndo, onRawTranscript, onSwitchServer, onAnnounceScore, onCommandError,
        p1Name, p2Name, p1Partner, p2Partner, p1Color, p2Color, server, voiceCommands,
        actionCooldownSec
    };
  }, [onScoreP1, onScoreP2, onUndo, onRawTranscript, onSwitchServer, onAnnounceScore, onCommandError, p1Name, p2Name, p1Partner, p2Partner, p1Color, p2Color, server, voiceCommands, actionCooldownSec]);

  const handleTranscriptResult = useCallback((text: string) => {
    const now = Date.now();
    const normalizedText = text.toLowerCase().trim();
    if (!normalizedText) return;

    if (normalizedText === lastProcessedTextRef.current && (now - lastActionTimeRef.current < 2000)) return;
    if (now - lastActionTimeRef.current < (callbacksRef.current.actionCooldownSec * 1000)) return;

    if (callbacksRef.current.onRawTranscript) callbacksRef.current.onRawTranscript(normalizedText);
    setTranscript(normalizedText);
    lastProcessedTextRef.current = normalizedText;

    const { onScoreP1, onScoreP2, onUndo, onSwitchServer, onAnnounceScore, p1Name, p2Name, p1Partner, p2Partner, p1Color, p2Color, server, voiceCommands } = callbacksRef.current;

    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const LIKE = (val: string, keywords: string[]) => {
      const normVal = normalize(val);
      return keywords.some(k => {
        const normK = normalize(k.trim());
        if (!normK) return false;
        const escapedK = normK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedK}\\b`, 'i');
        return regex.test(normVal);
      });
    };

    const execute = (fn: () => void) => { lastActionTimeRef.current = Date.now(); fn(); };

    const condicao_ap1 = normalizedText.includes('.') || LIKE(normalizedText, FONETICA.ponto);

    if (condicao_ap1) {
       if (LIKE(normalizedText, FONETICA.sacador)) { execute(() => server === 1 ? onScoreP1('rally', normalizedText) : onScoreP2('rally', normalizedText)); return; }
       if (LIKE(normalizedText, FONETICA.contra)) { execute(() => server === 1 ? onScoreP2('rally', normalizedText) : onScoreP1('rally', normalizedText)); return; }
       if (LIKE(normalizedText, FONETICA.ace) || LIKE(normalizedText, FONETICA.saque)) { execute(() => server === 1 ? onScoreP1('ace', normalizedText) : onScoreP2('ace', normalizedText)); return; }
       if (LIKE(normalizedText, FONETICA.voltar)) { execute(() => onUndo(normalizedText)); return; }
       if (LIKE(normalizedText, FONETICA.falta)) { execute(() => server === 1 ? onScoreP2('fault', normalizedText) : onScoreP1('fault', normalizedText)); return; }

       const getAlvos = (n?: string, p?: string, c?: string, t?: string) => {
           const alvos = new Set<string>();
           if (n) alvos.add(n.toLowerCase().trim().split(' ')[0]); 
           if (p) alvos.add(p.toLowerCase().trim().split(' ')[0]); 
           if (c) alvos.add(c.toLowerCase().trim());               
           if (t) { alvos.add(`time ${t}`); alvos.add(`t${t}`); alvos.add(`equipe ${t}`); }
           return Array.from(alvos);
       };

       const alvosP1 = getAlvos(p1Name, p1Partner, p1Color, "1");
       const alvosP2 = getAlvos(p2Name, p2Partner, p2Color, "2");

       const condicao_cvp2_p1 = LIKE(normalizedText, alvosP1);
       const condicao_cvp2_p2 = LIKE(normalizedText, alvosP2);

       if (condicao_cvp2_p1 && !condicao_cvp2_p2) { execute(() => onScoreP1('rally', normalizedText)); return; }
       if (condicao_cvp2_p2 && !condicao_cvp2_p1) { execute(() => onScoreP2('rally', normalizedText)); return; }
    } else {
       if (LIKE(normalizedText, FONETICA.saque) && LIKE(normalizedText, FONETICA.falta)) { execute(() => server === 1 ? onScoreP2('fault', normalizedText) : onScoreP1('fault', normalizedText)); return; }
       if (LIKE(normalizedText, voiceCommands.switchServer)) { execute(onSwitchServer); return; }
       if (LIKE(normalizedText, voiceCommands.scoreStatus)) { execute(onAnnounceScore); return; }
    }
  }, []);

  const initRecognition = useCallback(() => {
    const SpeechRecognition = (
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    );
    if (!SpeechRecognition) {
      setError("Reconhecimento de voz não suportado neste navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => { isStartingRef.current = false; setIsListening(true); };
    recognition.onend = () => {
      isStartingRef.current = false;
      setIsListening(false);
      // Reinicia automaticamente APENAS se shouldRunRef ainda está ativo
      // Usar recognitionRef aqui causava race condition: stop() zeraria o ref
      // após onend disparar, fazendo o reconhecimento reiniciar indevidamente
      if (shouldRunRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastIdx = event.results.length - 1;
      const text = event.results[lastIdx][0].transcript;
      handleTranscriptResult(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      isStartingRef.current = false;
      if (event.error === 'not-allowed') {
        setError("Permissão negada");
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    shouldRunRef.current = true;
    isStartingRef.current = true;
    try { recognition.start(); } catch { isStartingRef.current = false; }
  }, [handleTranscriptResult]);

  useEffect(() => {
    if (isEnabled) {
      initRecognition();
    } else {
      // Zera shouldRunRef ANTES de stop() para que onend não reinicie
      shouldRunRef.current = false;
      if (recognitionRef.current && !isStartingRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      } else if (recognitionRef.current && isStartingRef.current) {
        // recognition.start() foi chamado mas onstart ainda não disparou —
        // agenda o stop() para após o onstart para evitar estado inválido no browser
        const pendingRef = recognitionRef.current;
        pendingRef.onstart = () => {
          isStartingRef.current = false;
          pendingRef.onend = null;
          try { pendingRef.stop(); } catch {}
        };
        recognitionRef.current = null;
      }
      setIsListening(false);
    }

    return () => {
      shouldRunRef.current = false;
      if (recognitionRef.current && !isStartingRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      } else if (recognitionRef.current && isStartingRef.current) {
        const pendingRef = recognitionRef.current;
        pendingRef.onstart = () => {
          isStartingRef.current = false;
          pendingRef.onend = null;
          try { pendingRef.stop(); } catch {}
        };
        recognitionRef.current = null;
      }
    };
  }, [isEnabled, initRecognition]);

  const start = useCallback(() => {
    if (!isEnabled) return;
    if (!recognitionRef.current) {
      initRecognition();
    }
  }, [isEnabled, initRecognition]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    if (recognitionRef.current && !isStartingRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    } else if (recognitionRef.current && isStartingRef.current) {
      const pendingRef = recognitionRef.current;
      pendingRef.onstart = () => {
        isStartingRef.current = false;
        pendingRef.onend = null;
        try { pendingRef.stop(); } catch {}
      };
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, error, start, stop, transcript };
};
