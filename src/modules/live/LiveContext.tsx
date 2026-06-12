import React, { createContext, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { doc, setDoc, updateDoc, deleteField, FieldValue } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import type { ControllerRecord, GameState, LiveLogEntry, LivePapel, LiveType } from '../../types.ts';
import type { LiveContextValue, LiveProviderProps } from './types.ts';
import { getPersistedLiveOwnerPin } from './liveHelpers.ts';
import { isWatchDevice } from '@shared/utils/device';

// ─── Contexto ─────────────────────────────────────────────────────────────────
// Valor padrão é undefined — o hook useLive() vai detectar se está fora do Provider.
export const LiveContext = createContext<LiveContextValue | undefined>(undefined);

// ─── LiveProvider ─────────────────────────────────────────────────────────────
// Responsabilidades centralizadas aqui:
//   1. Estados reativos da live (activeLives, cloudLiveExists, liveLogs, fbSyncStatus).
//   2. Refs de ciclo de vida compartilhados com o App.tsx via contexto.
//   3. Cálculo de papéis e permissões (isOriginalOwner, livePapel, indicatorRole…).
//   4. Saída segura do usuário (performExit) + listeners de visibilidade/unload.
//
// O que NÃO está aqui (intencionalmente):
//   - Handlers de ação Firebase (handleControlLive, handleCloseCloudLive…) — dependem
//     de estado do App.tsx (setGameState, setCurrentScreen, etc.) e seriam acoplamento
//     reverso se migrados agora. Candidatos a extração futura se esses estados também
//     migrarem para um contexto próprio (ex: GameContext).
export const LiveProvider: React.FC<LiveProviderProps> = ({
  children,
  deviceId,
  userProfile,
  gameState,
  gameStateRef,
}) => {
  // ── Estados principais ──────────────────────────────────────────────────────
  const [activeLives, setActiveLives] = useState<GameState[]>([]);
  const [cloudLiveExists, setCloudLiveExists] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const [fbSyncStatus, setFbSyncStatus] = useState<{ team: 1 | 2; seq: number; isObserver: boolean } | null>(null);

  // ── Refs de ciclo de vida ───────────────────────────────────────────────────
  // activeLivesRef: espelho síncrono de activeLives para uso em closures estáveis.
  // Necessário porque performExit e handlers no App.tsx não podem depender do
  // estado reativo diretamente (causaria recriação do exitTimer a cada ponto marcado).
  const activeLivesRef = useRef<GameState[]>([]);
  useEffect(() => { activeLivesRef.current = activeLives; }, [activeLives]);

  // tookControlAtRef / lostControlAtRef: timestamps de troca de controle.
  // Usados para grace periods dentro de performExit:
  //   - justTookControl (15s): evita fechar a live logo após assumir o controle.
  //   - justLostControl (30s): evita fechar a live logo após ceder o controle a outro device.
  // Escritos pelo App.tsx (handleControlLive / onSnapshot) via ref exposto no contexto.
  const tookControlAtRef = useRef<number>(0);
  const lostControlAtRef = useRef<number>(0);

  // isClosingLiveRef: flag de encerramento INTENCIONAL iniciado por este device.
  // Sem ela, o onSnapshot do owner receberia de volta o isLiveClosed: true que
  // ele mesmo escreveu e o ignoraria como "artefato de reload". Com a flag,
  // o onSnapshot sabe que deve processar o encerramento normalmente.
  // Escrito pelo handleCloseCloudLive no App.tsx.
  const isClosingLiveRef = useRef<boolean>(false);

  // lastFbScoreKeyRef: chave do último score enviado ao Firebase.
  // Impede que o loop de sync periódico reenvie o mesmo placar duas vezes seguidas.
  const lastFbScoreKeyRef = useRef<string>('');

  // fbSyncTimerRef: handle do timer do indicador visual de sincronismo (ex: ícone piscando).
  // Mantido aqui para que o App.tsx possa cancelar o timer ao fechar a live.
  const fbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hasAutoEnabledScoreboardRef: guard de idempotência — ativa modo placar automático
  // no máximo uma vez por sessão de observer. Evita loop de ativação/desativação.
  const hasAutoEnabledScoreboardRef = useRef(false);

  // ── useMemo: isOriginalOwner ────────────────────────────────────────────────
  // "Este device é o dono original desta live?"
  // Cascata de fontes em ordem decrescente de confiabilidade:
  //   1. gameState.ownerDeviceId  — gravado na criação; fonte primária e imutável.
  //   2. activeLives[].ownerDeviceId — cobre a janela em que gameState ainda não carregou.
  //   3. PIN do usuário vs ownerPin — compatibilidade com lives antigas (sem ownerDeviceId).
  //      Neste fallback, verifica também que nenhum outro device com ownerDeviceId diferente
  //      compartilha o mesmo ownerPin — evita falso positivo em multi-device.
  //
  // ⚠️ IMPORTANTE: isOriginalOwner NÃO é usado dentro de performExit.
  // O performExit recalcula a mesma lógica via refs (isOwnerViaRef) para evitar
  // closure stale — o useMemo captura o valor no momento da criação do useEffect,
  // mas os refs refletem o valor atual no momento da saída. São intencionalmente
  // duplicados e devem permanecer sincronizados se a lógica de owner mudar.
  const isOriginalOwner = useMemo(() => {
    if (isWatchDevice()) return false;
    if (gameState?.ownerDeviceId) return gameState.ownerDeviceId === deviceId;
    if (activeLives.some(l => l.ownerDeviceId === deviceId)) return true;
    if (!userProfile.pin) return false;
    const myPin = userProfile.pin.toUpperCase();
    if (activeLives.some(l => l.ownerPin?.toUpperCase() === myPin)) {
      return !activeLives.some(
        l => l.ownerDeviceId && l.ownerDeviceId !== deviceId && l.ownerPin?.toUpperCase() === myPin
      );
    }
    return false;
  }, [gameState?.ownerDeviceId, activeLives, deviceId, userProfile.pin]);

  // ── useMemo: isCurrentController ───────────────────────────────────────────
  // "Este device é o commandOwnerId no gameState LOCAL?"
  // Leitura puramente local — responde instantaneamente, sem aguardar Firebase.
  // Usado para decisões de UI imediatas (ex: mostrar botões de pontuação).
  // Distinção em relação a isActiveController: veja comentário abaixo.
  const isCurrentController = useMemo(
    () => gameState?.commandOwnerId === deviceId,
    [gameState?.commandOwnerId, deviceId]
  );

  // ── useMemo: isActiveController ────────────────────────────────────────────
  // "Este device é o controller ativo segundo o Firebase (activeLives)?"
  // Diferença semântica vs isCurrentController:
  //   - isCurrentController: lê gameState LOCAL — verdade imediata, pode estar desatualizado.
  //   - isActiveController: lê activeLives (snapshot Firebase) — verdade confirmada, com latência.
  // Usa deviceId (não pin) para suportar múltiplos dispositivos do mesmo usuário.
  // Fallback local: cobre a janela de latência logo após criar/assumir a live,
  // antes de o onSnapshot da collection retornar com os dados atualizados.
  const isActiveController = useMemo(() => {
    if (activeLives.some(l => l.commandOwnerId === deviceId)) return true;
    if (
      gameState?.isMirroringActive &&
      gameState?.commandOwnerId === deviceId &&
      (gameState?.ownerDeviceId === deviceId || !gameState?.ownerDeviceId)
    ) return true;
    return false;
  }, [activeLives, deviceId, gameState?.isMirroringActive, gameState?.commandOwnerId, gameState?.ownerDeviceId]);

  // ── useMemo: isCommandOwner ─────────────────────────────────────────────────
  // "Este device pode enviar comandos de jogo (pontuar, desfazer)?"
  // true se não há live ativa (modo offline, sempre pode comandar)
  //   OU se este device é o controller atual.
  // Alias semântico de isCurrentController para contextos onde a ausência de live
  // também deve liberar os controles — evita condicionais espalhadas na UI.
  const isCommandOwner = useMemo(() => {
    if (!gameState || !gameState.isMirroringActive) return true;
    return isCurrentController;
  }, [gameState?.isMirroringActive, isCurrentController]);

  // ── useMemo: livePapel ──────────────────────────────────────────────────────
  // Papel permanente do dispositivo na live: owner | judge | observer | spectator.
  // 'spectator' quando não há live ativa.
  const livePapel = useMemo((): LivePapel => {
    const liveIsActiveLocally = gameState?.isMirroringActive && !gameState?.isLiveClosed;
    const effectivelyHasLive = cloudLiveExists || liveIsActiveLocally;
    if (!effectivelyHasLive) return 'spectator';
    if (activeLives.some(l => l.ownerDeviceId === deviceId)) return 'owner';
    if (liveIsActiveLocally && gameState?.ownerDeviceId === deviceId && gameState?.commandOwnerId === deviceId) return 'owner';
    const myPin = userProfile.pin?.toUpperCase();
    // Legado: live sem ownerDeviceId, só identifica como owner se não for relógio
    // (relógio tem o mesmo ownerPin do dono mas deviceId diferente — não é o owner).
    if (myPin && !isWatchDevice() && activeLives.some(l => l.ownerPin?.toUpperCase() === myPin && !l.ownerDeviceId)) return 'owner';
    if (myPin && activeLives.some(l => l.judgePin?.toUpperCase() === myPin)) return 'judge';
    return 'observer';
  }, [cloudLiveExists, userProfile.pin, activeLives, deviceId, gameState?.isMirroringActive, gameState?.isLiveClosed, gameState?.ownerDeviceId, gameState?.commandOwnerId]);

  // ── useMemo: liveStatus ─────────────────────────────────────────────────────
  const liveStatus = useMemo((): LiveType => {
    return isActiveController ? 'controller' : 'watcher';
  }, [isActiveController]);

  // ── useMemo: indicatorRole ──────────────────────────────────────────────────
  const indicatorRole = useMemo((): 'owner' | 'judge' | 'observer' => {
    if (!isActiveController) return 'observer';
    // Observador que assumiu o controle não se torna juiz — preserva seu papel real.
    return livePapel === 'owner' ? 'owner' : livePapel === 'judge' ? 'judge' : 'observer';
  }, [isActiveController, livePapel]);

  // ── useMemo: isJudgeOnline ──────────────────────────────────────────────────
  // true se há um controller com role 'judge' cujo lastSeen < 30s.
  // ⚠️ Date.now() é capturado no momento do cálculo do memo, não em tempo real.
  // O valor só é recalculado quando gameState.controllers muda (nova presença do Firestore).
  // Isso é aceitável: a presença é atualizada pelo Firebase a cada ~15–20s,
  // então a janela de imprecisão é pequena e o comportamento é consistente.
  const isJudgeOnline = useMemo(() => {
    const judgePin = gameState?.judge?.pin || gameState?.judgePin;
    if (!judgePin || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some(
      (c: ControllerRecord) => c.role === 'judge' && (now - (c.lastSeen || 0)) < 30000
    );
  }, [gameState?.judge, gameState?.judgePin, gameState?.controllers]);

  // ── useMemo: isOwnerOnline ──────────────────────────────────────────────────
  // true se há um controller com isOwner:true cujo lastSeen < 60s (janela maior que a do juiz).
  // Mesma limitação de isJudgeOnline: Date.now() é fixo no momento do cálculo.
  // Recalcula a cada novo snapshot de gameState.controllers.
  const isOwnerOnline = useMemo(() => {
    if (!gameState?.ownerPin || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some(
      (c: ControllerRecord) => c.isOwner && (now - c.lastSeen) < 60000
    );
  }, [gameState?.ownerPin, gameState?.controllers]);

  // ── useCallback: resolveTargetPin ───────────────────────────────────────────
  // Fonte única de verdade para o PIN do owner alvo de escritas no Firestore.
  // Ordem de prioridade:
  //   1. judgeMatch.ownerPin — se o PIN logado é juiz designado daquela live
  //   2. myPin — live própria do usuário logado
  // Não usa PIN arbitrário salvo/local para evitar escritas em live_matches/{pin}
  // de outro usuário quando não há live autorizada.
  const resolveTargetPin = useCallback((context: string): string | null => {
    const myPin = userProfile.pin?.toUpperCase();
    const isJudgeForLive = (live: GameState) =>
      !!myPin &&
      (live.judgePin?.toUpperCase() === myPin || live.judge?.pin?.toUpperCase() === myPin);
    const judgeMatch = activeLives.find(isJudgeForLive);
    if (judgeMatch?.ownerPin) return judgeMatch.ownerPin.toUpperCase();
    if (gameState?.ownerPin?.toUpperCase() === myPin) return myPin;
    if (gameState?.ownerPin && isJudgeForLive(gameState)) return gameState.ownerPin.toUpperCase();
    const persisted = getPersistedLiveOwnerPin();
    if (persisted?.toUpperCase() === myPin) return myPin;
    if (isOriginalOwner && myPin) return myPin;
    console.error(`[resolveTargetPin:${context}] Não foi possível determinar o ownerPin — escrita abortada.`);
    return null;
  }, [userProfile.pin, activeLives, gameState?.ownerPin, isOriginalOwner]);

  // ── useEffect: performExit + visibilitychange / beforeunload ─────────────────
  // Gerencia a saída segura do usuário da live.
  //
  // Por que lemos estado via REFS e não via closure?
  // O useEffect é criado uma vez (dep array estável). Se lesse activeLives/gameState
  // diretamente, o React recriaria os listeners a cada mudança de estado, cancelando
  // o exitTimer em andamento e potencialmente vazando handlers antigos.
  // Com refs, os listeners são criados uma única vez e sempre leem o valor atual.
  //
  // Por que isOwnerViaRef é recalculado aqui em vez de usar isOriginalOwner?
  // isOriginalOwner é um useMemo capturado no momento da criação deste useEffect.
  // Na saída do app, esse valor pode estar desatualizado (stale closure).
  // isOwnerViaRef relê ownerDeviceId e ownerPin diretamente de gameStateRef.current,
  // garantindo que a decisão de fechar/manter a live usa o estado real do momento.
  // As duas lógicas DEVEM permanecer sincronizadas: se a regra de "quem é owner"
  // mudar em isOriginalOwner, o bloco isOwnerViaRef abaixo deve ser atualizado junto.
  //   - visibilitychange: sinal mais confiável em mobile (iOS/Android)
  //     → grace period de 2500ms para distinguir reload de saída real
  //   - beforeunload: cobre desktop e serve como fallback
  //
  // gameState e activeLives NÃO entram no dep array — são lidos via ref
  // para que o handler não seja recriado (e o exitTimer cancelado) a cada ponto.
  useEffect(() => {
    const performExit = async () => {
      // Se a flag 'alive' existe, o app foi montado recentemente — é um reload,
      // não uma saída definitiva. Consome a flag e aborta para não fechar a live.
      try {
        if (sessionStorage.getItem('myPlacar_alive')) {
          sessionStorage.removeItem('myPlacar_alive');
          return;
        }
      } catch {}

      // Lê estado atual via refs — evita closure stale e mantém o dep array estável.
      const gs = gameStateRef.current;
      const lives = activeLivesRef.current;
      if (!gs?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
      const db = getDb();
      if (!db) return;
      const { doc, setDoc, updateDoc, deleteField } = await import('firebase/firestore');
      const myPin = userProfile.pin?.toUpperCase();
      const judgeMatch = lives.find(
        l => l.judgePin?.toUpperCase() === myPin || l.judge?.pin?.toUpperCase() === myPin,
      );

      // Calcula isOwner via refs (não via closure) — evita stale value em devices
      // secundários do mesmo usuário que ainda não receberam o snapshot com ownerDeviceId.
      // Exclui relógio desta definição para ele nunca fechar a live.
      const gsOwnerDeviceId = gs.ownerDeviceId;
      const isOwnerByDeviceId = !isWatchDevice() && !!gsOwnerDeviceId && gsOwnerDeviceId === deviceId;
      const isOwnerByPin = !isWatchDevice() && !gsOwnerDeviceId &&
        gs.ownerPin?.toUpperCase() === myPin &&
        !lives.some(l => l.ownerDeviceId && l.ownerDeviceId !== deviceId && l.ownerPin?.toUpperCase() === myPin);
      const isOwnerViaRef = isOwnerByDeviceId || isOwnerByPin;

      // Usa apenas PIN autorizado: live própria do usuário logado ou live onde ele é juiz.
      const targetPin = (judgeMatch && judgeMatch.ownerPin)
        ? judgeMatch.ownerPin.toUpperCase()
        : (isOwnerViaRef && myPin ? myPin : null);
      if (!targetPin) return;

      const isController = gs.commandOwnerId === deviceId;

      // Grace period de 30s após perder o controle.
      const justLostControl = (Date.now() - lostControlAtRef.current) < 30000;
      // Grace period de 15s após assumir o controle.
      const justTookControl = (Date.now() - tookControlAtRef.current) < 15000;

      // Regra: o owner só fecha a live via performExit se ELE é o controller ativo.
      // Se outro device (relógio, juiz) está controlando, o owner saindo da tela
      // apenas remove sua presença — a live continua sob o controle do outro device.
      if (isOwnerViaRef && isController && !justLostControl && !justTookControl) {
        // Owner saiu sendo o controller ativo: verifica se há judge ou outro owner ativo.
        const hasActiveJudge = !!(gs.judgePin && Object.values(gs.controllers || {}).some(
          (c: ControllerRecord) => c.role === 'judge' && (Date.now() - (c.lastSeen || 0)) < 60000
        ));
        const controllersEntries = Object.entries(gs.controllers || {});
        const hasActiveOwnerDevice = controllersEntries.some(([id, c]) =>
          id !== deviceId &&
          (c as ControllerRecord).role === 'owner' &&
          (Date.now() - ((c as ControllerRecord).lastSeen || 0)) < 60000
        );

        if (hasActiveJudge || hasActiveOwnerDevice) {
          // Há outro device ativo — apenas remove a presença deste
          const presenceUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
            [`controllers.${deviceId}`]: deleteField(),
            commandOwnerId: null,
            commandOwner: null,
          };
          updateDoc(doc(db, 'live_matches', targetPin), presenceUpdate).catch(() => {});
        } else {
          // Owner era o único controlador ativo — fecha a live
          setDoc(doc(db, 'live_matches', targetPin), { isLiveClosed: true, isMirroringActive: false }, { merge: true }).catch(() => {});
        }
      } else if (isOwnerViaRef && !isController) {
        // Owner saiu mas NÃO era o controller — apenas remove sua presença.
        // A live continua ativa sob controle do outro device.
        updateDoc(doc(db, 'live_matches', targetPin), {
          [`controllers.${deviceId}`]: deleteField(),
        }).catch(() => {});
      } else {
        // Judge ou observer saiu — remove apenas o registro deste device via field-path.
        // Se era o controller ativo, libera o controle (commandOwnerId = null).
        const presenceUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
          [`controllers.${deviceId}`]: deleteField(),
        };
        if (isController) {
          presenceUpdate.commandOwnerId = null;
          presenceUpdate.commandOwner = null;
        }
        updateDoc(doc(db, 'live_matches', targetPin), presenceUpdate).catch(() => {});
      }
    };

    // visibilitychange é o sinal mais confiável em mobile (iOS/Android).
    // Grace period de 2500ms: se o app voltar para 'visible' dentro desse tempo
    // (ex: reload/atualização de PWA), o performExit é cancelado e a live
    // NÃO é fechada prematuramente no Firebase.
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        exitTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden') performExit();
        }, 2500);
      } else {
        // Usuário voltou para o app dentro do grace period — cancela o fechamento
        if (exitTimer !== null) {
          clearTimeout(exitTimer);
          exitTimer = null;
        }
      }
    };

    // beforeunload cobre desktop e serve como fallback.
    // Se a flag myPlacar_pwa_updating estiver ativa, é um reload de atualização
    // de PWA — não fechar a live (o app vai reabrir em segundos).
    const handleBeforeUnload = () => {
      try {
        if (sessionStorage.getItem('myPlacar_pwa_updating')) return;
      } catch {}
      performExit();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (exitTimer !== null) clearTimeout(exitTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('beforeunload', handleBeforeUnload);
    };
  // gameState e activeLives removidos do dep array — lidos via ref dentro de performExit,
  // evitando que o handler seja recriado (e o exitTimer cancelado) a cada ponto marcado.
  }, [userProfile.pin, userProfile.email, deviceId, isOriginalOwner, gameStateRef]);

  const value: LiveContextValue = {
    activeLives, setActiveLives,
    cloudLiveExists, setCloudLiveExists,
    liveLogs, setLiveLogs,
    fbSyncStatus, setFbSyncStatus,
    activeLivesRef,
    tookControlAtRef,
    lostControlAtRef,
    isClosingLiveRef,
    lastFbScoreKeyRef,
    fbSyncTimerRef,
    hasAutoEnabledScoreboardRef,
    livePapel,
    liveStatus,
    isOriginalOwner,
    isActiveController,
    isCurrentController,
    isCommandOwner,
    indicatorRole,
    isJudgeOnline,
    isOwnerOnline,
    resolveTargetPin,
  };

  return (
    <LiveContext.Provider value={value}>
      {children}
    </LiveContext.Provider>
  );
};
