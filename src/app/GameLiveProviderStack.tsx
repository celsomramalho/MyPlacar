import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@modules/auth';
import { GameProvider, useGame } from '@modules/game';
import { LiveProvider } from '@modules/live';
import { LocalSyncProvider } from '@modules/localSync';
import type { GameState } from '../types.ts';
import { getDeviceId } from '@shared/utils/device';

/** Props que o LiveProvider precisa do Game — ciclo Game ↔ Live exige sync mínimo. */
export type LiveGameFeed = {
  userProfile: UserProfile;
  gameState: GameState | null;
  gameStateRef: React.RefObject<GameState | null>;
};

const EMPTY_PROFILE: UserProfile = {
  name: '',
  nickname: '',
  email: '',
  phone: '',
  pin: '',
  isProfileComplete: false,
  authMethod: 'pin',
};

const INITIAL_FEED: LiveGameFeed = {
  userProfile: EMPTY_PROFILE,
  gameState: null,
  gameStateRef: { current: null },
};

/**
 * UIProvider deve envolver esta árvore.
 * Ordem: Live → Game (GameContext usa useLive).
 */
export const GameLiveProviderStack: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceId = useMemo(() => getDeviceId(), []);
  const [feed, setFeed] = useState<LiveGameFeed>(INITIAL_FEED);

  const onFeed = useCallback((next: LiveGameFeed) => {
    setFeed((prev) => {
      if (
        prev.userProfile === next.userProfile &&
        prev.gameState === next.gameState &&
        prev.gameStateRef === next.gameStateRef
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  return (
    <LocalSyncProvider>
      <LiveProvider
        deviceId={deviceId}
        userProfile={feed.userProfile}
        gameState={feed.gameState}
        gameStateRef={feed.gameStateRef}
      >
        <GameProvider>
          <GameLivePropsSync onFeed={onFeed} />
          {children}
        </GameProvider>
      </LiveProvider>
    </LocalSyncProvider>
  );
};

/** Atualiza props do LiveProvider quando o GameContext hidrata (substitui GameBridge para feed). */
const GameLivePropsSync: React.FC<{ onFeed: (feed: LiveGameFeed) => void }> = ({ onFeed }) => {
  const { userProfile, gameState, gameStateRef } = useGame();

  useEffect(() => {
    onFeed({ userProfile, gameState, gameStateRef });
  }, [userProfile, gameState, gameStateRef, onFeed]);

  return null;
};
