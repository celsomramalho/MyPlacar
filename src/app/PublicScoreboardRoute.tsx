import React from 'react';
import { ScoreboardScreen } from '@modules/game/screens/ScoreboardScreen';
import { useGame } from '@modules/game';
import { Loader2 } from 'lucide-react';

interface PublicScoreboardRouteProps {
  appUrl: string;
}

export function PublicScoreboardRoute({ appUrl }: PublicScoreboardRouteProps) {
  const { gameState } = useGame();

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-slate-900">
        <Loader2 className="animate-spin text-white w-10 h-10" />
      </div>
    );
  }

  return (
    <ScoreboardScreen
      appUrl={appUrl}
      onScoreUpdate={() => {}}
      onUndo={() => {}}
      onSwitchServer={() => {}}
      onTogglePause={() => {}}
      onBack={() => {}}
      onHome={() => {}}
      onToggleMirroring={() => {}}
      onToggleWatchMode={() => {}}
      isSettingsInicialSaved={false}
      isSettingsRegrasSaved={false}
      isAdmin={false}
    />
  );
}
