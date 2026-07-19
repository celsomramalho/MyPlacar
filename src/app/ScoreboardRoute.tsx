import React from 'react';
import { ScoreboardScreen } from '@modules/game/screens/ScoreboardScreen';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { useScoreboardEngine } from '@modules/game/hooks/useScoreboardEngine';
import { useVoiceControl } from '@modules/game/presentation/hooks/useVoiceControl';
import { useLiveActions } from '@modules/live';
import { useJudgeLookup } from '@modules/live/hooks/useJudgeLookup';
import type { Tab } from '../types';

interface ScoreboardRouteProps {
  appUrl: string;
  deviceId: string;
  currentFullDeviceName: string;
  isOfflineMode: boolean;
  onExitOffline: () => void;
  onOpenMenu: () => void;
  setActiveTab: (tab: Tab) => void;
  /** Setter do AppScreenRouter — ativa o LiveControlOverlay em modo "confirmar exclusão de juiz" */
  setInitialConfirmDeleteJudge: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Conecta ScoreboardScreen a todos os hooks de contexto (useGame, useLive, useUI, …).
 * O AppScreenRouter passa apenas as props que vivem fora dos contextos (appUrl, deviceId, …).
 */
export function ScoreboardRoute({
  appUrl,
  deviceId,
  currentFullDeviceName,
  isOfflineMode,
  onExitOffline,
  onOpenMenu,
  setActiveTab,
  setInitialConfirmDeleteJudge,
}: ScoreboardRouteProps) {
  const {
    userProfile,
    setMatchSettings,
    gameState,
    setGameState,
    handleLeaveLive,
    handleCloseCloudLive,
    handleScoreUpdate,
    handleCorrectScore,
    handleUndo,
    handleAddJudge,
    handleResetMatch,
  } = useGame();

  const {
    setActiveLives,
    setCloudLiveExists,
    isOriginalOwner,
    isCommandOwner,
    livePapel,
    isJudgeOnline,
    resolveTargetPin,
  } = useLive();

  const {
    setCurrentScreen,
    setModalConfig,
    setShowLiveControlOverlay,
    judgePinInput,
    setJudgePinInput,
    setJudgeNicknameLookup,
    setIsSearchingJudgePin,
    judgeNicknameLookup,
    isSearchingJudgePin,
    isSavingJudge,
    isSettingsInicialSaved,
    isSettingsRegrasSaved,
    setIsSelectingJudge,
    isRecoveryFromMatchOver,
  } = useUI();

  const { handleTogglePause, handleSmartSwitchServer, handleSwapSides, handleToggleGender } = useScoreboardEngine();
  const { voiceLogs, setVoiceLogs } = useVoiceControl();

  useJudgeLookup({ judgePinInput, setIsSearchingJudgePin, setJudgeNicknameLookup });

  const { handleToggleMirroring, handleConfirmMatch } = useLiveActions({
    gameState,
    setGameState,
    userProfile,
    deviceId,
    currentFullDeviceName,
    isOriginalOwner,
    isCommandOwner,
    livePapel,
    resolveTargetPin,
    setModalConfig,
    setCloudLiveExists,
    setActiveLives,
    setMatchSettings,
  });

  const isAdmin = userProfile.isAdmin === true;

  // ── Handlers de navegação (C2: diálogos por papel) ──────────────────────────
  const liveAtiva =
    gameState?.isMirroringActive &&
    !(gameState.isMirroringActive && gameState.isLiveClosed) &&
    !gameState.isConfirmedFinished;

  const makeExitHandler = (dest: 'new-game' | 'settings') => () => {
    if (liveAtiva) {
      if (isOriginalOwner && isCommandOwner) {
        setModalConfig({
          title: 'Você é o proprietário',
          message: 'A live continua ativa mesmo depois que você sair. O que deseja fazer?',
          confirmLabel: 'Sair da tela (live continua)',
          onConfirm: () => { setModalConfig(null); setCurrentScreen(dest); },
          onCancel: () => setModalConfig(null),
        });
      } else if (isCommandOwner) {
        setCurrentScreen(dest);
      } else {
        handleLeaveLive(); setCurrentScreen(dest);
      }
    } else {
      handleLeaveLive(); setCurrentScreen(dest);
    }
  };

  return (
    <ScoreboardScreen
      appUrl={appUrl}
      onScoreUpdate={handleScoreUpdate}
      judgePinInput={judgePinInput}
      setJudgePinInput={setJudgePinInput}
      isSearchingJudgePin={isSearchingJudgePin}
      judgeNicknameLookup={judgeNicknameLookup}
      isSavingJudge={isSavingJudge}
      onAddJudge={() =>
        handleAddJudge(judgePinInput, judgeNicknameLookup).then(() => {
          setJudgePinInput('');
          setJudgeNicknameLookup('');
        })
      }
      onDeleteJudge={() => { setInitialConfirmDeleteJudge(true); setShowLiveControlOverlay(true); }}
      isJudgeOnline={isJudgeOnline}
      onSelectJudgeFromPartners={() => { setIsSelectingJudge(true); setCurrentScreen('partners'); }}
      onUndo={handleUndo}
      onSwitchServer={handleSmartSwitchServer}
      onSwapSides={handleSwapSides}
      onToggleGender={handleToggleGender}
      onTogglePause={handleTogglePause}
      onBack={makeExitHandler('new-game')}
      onHome={makeExitHandler('settings')}
      onNavigateToTab={t => {
        if (t === 'regras') {
          setCurrentScreen('new-game');
        } else {
          setActiveTab(t);
          setCurrentScreen('settings');
        }
      }}
      isSettingsInicialSaved={isSettingsInicialSaved}
      isSettingsRegrasSaved={isSettingsRegrasSaved}
      onToggleMirroring={handleToggleMirroring}
      onCorrectScore={(type, value) => handleCorrectScore(type, value, { forceLocal: isOfflineMode })}
      isAdmin={isAdmin}
      onConfirmMatch={handleConfirmMatch}
      isRecoveryFromMatchOver={isRecoveryFromMatchOver}
      currentDeviceId={deviceId}
      currentDeviceFullLabel={currentFullDeviceName}
      onOpenLiveControl={() => setShowLiveControlOverlay(true)}
      onDeleteLive={() => {
        setModalConfig({
          title: 'Encerrar a live?',
          message: 'Todos os participantes perderão a conexão.',
          confirmLabel: 'Encerrar',
          variant: 'danger',
          onConfirm: async () => { setModalConfig(null); await handleCloseCloudLive(); },
          onCancel: () => setModalConfig(null),
        });
      }}
      onResetMatch={handleResetMatch}
      onOpenMenu={onOpenMenu}
      isOfflineMode={isOfflineMode}
      onExitOffline={onExitOffline}
      onToggleWatchMode={() => {
        setMatchSettings(prev => ({ ...prev, isWatchMode: !prev.isWatchMode }));
        setGameState(p =>
          p ? { ...p, matchConfig: { ...p.matchConfig, isWatchMode: !p.matchConfig.isWatchMode } } : null
        );
      }}
      onToggleScoreboardMode={() => {
        setMatchSettings(prev => ({ ...prev, isScoreboardMode: !prev.isScoreboardMode }));
        setGameState(p =>
          p ? { ...p, matchConfig: { ...p.matchConfig, isScoreboardMode: !p.matchConfig.isScoreboardMode } } : null
        );
      }}
      voiceLogs={voiceLogs}
      setVoiceLogs={setVoiceLogs}
    />
  );
}
