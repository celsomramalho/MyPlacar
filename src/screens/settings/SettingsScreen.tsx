
import React, { useState, useEffect, useRef } from 'react';
import { GameState, MatchHistoryItem, MatchSettings, UserProfile, Partner, TournamentEvent } from '../types';
import { ProfileScreen } from './ProfileScreen';
import { HelpScreen } from './HelpScreen';
import { SettingsHeader } from './settings/SettingsHeader';
import { TeamSection } from './settings/TeamSection';
import { HistorySection } from './settings/HistorySection';
import { SettingsTabs } from './settings/SettingsTabs';

interface Props {
  history: MatchHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<MatchHistoryItem[]>>;
  onDeleteMatch: (id: string) => void;
  onDeleteManyMatches: (ids: Set<string>) => void;
  onBack: () => void;
  onNewGame: () => void;
  gameState: GameState | null;
  settings: MatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<MatchSettings>>;
  onStart: () => void; 
  onPlayShortcut: () => void;
  onOpenRules: () => void;
  activeTab: 'config' | 'history' | 'help' | 'profile';
  setActiveTab: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  onViewMap: (matchId: string | null) => void;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  onSaveProfile: () => void;
  onLogout: () => void;
  onGoAtAdmin?: () => void;
  onGoToScoreboard: () => void;
  isSettingsInicialSaved: boolean;
  isSettingsRegrasSaved?: boolean;
  isProfileSaved?: boolean;
  canStartMatch: boolean;
  onGoAdmin?: () => void;
  onSyncAll?: (force?: boolean) => void;
  onDownloadHistory?: () => void;
  cloudMatchesCount?: number;
  isDownloading?: boolean;
  isSyncingAll?: boolean;
  onOpenPartners?: () => void;
  partners: Partner[];
  onAutoRegisterPartner: (pin: string, field: string) => Promise<string | null>;
  onDeletePartners?: (ids: Set<string>) => void;
  cloudLiveExists?: boolean;
  onCheckUpdate?: () => Promise<string | boolean>;
  setIsUpdatingVersion?: (val: boolean) => void;
  onOpenLiveControl?: () => void;
  role?: 'owner' | 'observer' | 'spectator';
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  onJoinTournament: () => void;
  onExitTournament: () => void;
}

export const SettingsScreen: React.FC<Props> = (props) => {
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const prevTabRef = useRef(props.activeTab);

  // MC1: Salvamento automático ao sair da aba perfil
  useEffect(() => {
    if (prevTabRef.current === 'profile' && props.activeTab !== 'profile' && props.isProfileSaved === false) {
      props.onSaveProfile();
    }
    prevTabRef.current = props.activeTab;
  }, [props.activeTab, props.isProfileSaved, props.onSaveProfile]);

  const renderActiveContent = () => {
    switch (props.activeTab) {
      case 'profile':
        return <ProfileScreen 
          profile={props.userProfile} 
          setProfile={props.setUserProfile} 
          onSave={async () => props.onSaveProfile()} 
          onLogout={props.onLogout} 
          onGoAdmin={props.onGoAdmin} 
          onCheckUpdate={props.onCheckUpdate}
          setIsUpdatingVersion={props.setIsUpdatingVersion}
          settings={props.settings}
          setSettings={props.setSettings}
        />;
      case 'history':
        return (
          <HistorySection 
            history={props.history} 
            searchQuery="" 
            setSearchQuery={() => {}} 
            isSyncingAll={props.isSyncingAll || false} 
            onSyncAll={props.onSyncAll || (() => {})} 
            onDownloadHistory={props.onDownloadHistory}
            cloudMatchesCount={props.cloudMatchesCount}
            isDownloading={props.isDownloading}
            onDeleteMatch={props.onDeleteMatch} 
            onViewMap={props.onViewMap} 
            selectedMatches={selectedMatches} 
            setSelectedMatches={setSelectedMatches} 
          />
        );
      case 'help':
        return <HelpScreen profile={props.userProfile} onNavigateToTab={props.setActiveTab} onOpenRules={props.onOpenRules} onPlay={props.onPlayShortcut} canStartMatch={props.canStartMatch} />;
      case 'config':
      default:
        return <TeamSection 
          settings={props.settings} 
          setSettings={props.setSettings} 
          onStartMatch={props.onStart} 
          gameState={props.gameState} 
          onOpenPartners={props.onOpenPartners} 
          partners={props.partners}
          onAutoRegisterPartner={props.onAutoRegisterPartner}
          cloudLiveExists={props.cloudLiveExists}
          userProfile={props.userProfile}
          activeEvent={props.activeEvent}
          userEntryDate={props.userEntryDate}
          onJoinTournament={props.onJoinTournament}
          onExitTournament={props.onExitTournament}
        />;
    }
  };

  const showHeader = props.activeTab !== 'help';

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative overflow-hidden">
      {showHeader && (
        <SettingsHeader 
          isSelectionMode={selectedMatches.size > 0} 
          selectedCount={selectedMatches.size} 
          activeTab={props.activeTab} 
          onLogout={props.onLogout} 
          onStart={props.onPlayShortcut} 
          onDeleteSelected={() => { props.onDeleteManyMatches(selectedMatches); setSelectedMatches(new Set()); }} 
          onClearSelection={() => setSelectedMatches(new Set())} 
          isSettingsInicialSaved={props.isSettingsInicialSaved} 
          isProfileSaved={props.isProfileSaved}
          canStartMatch={props.canStartMatch}
          isMirroringActive={props.gameState?.isMirroringActive || props.cloudLiveExists}
          onOpenLiveControl={props.onOpenLiveControl}
          role={props.role}
        />
      )}
      <div className={`flex-1 overflow-y-auto ${props.activeTab === 'help' ? 'p-0' : 'p-5'} pb-32 no-scrollbar`}>
        <div className={props.activeTab === 'help' ? "w-full h-full" : "max-w-md mx-auto"}>
          {renderActiveContent()}
        </div>
      </div>
      <SettingsTabs 
        activeTab={props.activeTab} 
        setActiveTab={props.setActiveTab} 
        onOpenRules={props.onOpenRules} 
        isSettingsInicialSaved={props.isSettingsInicialSaved}
        isSettingsRegrasSaved={props.isSettingsRegrasSaved}
        isProfileSaved={props.isProfileSaved}
        isMirroringActive={props.gameState?.isMirroringActive || props.cloudLiveExists}
      />
    </div>
  );
};
