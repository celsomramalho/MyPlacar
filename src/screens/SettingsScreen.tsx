import React, { useState, useEffect, useRef } from 'react';
import type { Partner, QueuePlayer } from '@modules/partners';
import type { MatchHistoryItem } from '@modules/history';
import { HistorySection } from '@modules/history';
import { GameState, MatchSettings, UserProfile, TournamentEvent } from '../types.ts';
import { ProfileScreen } from './ProfileScreen.tsx';
import { HelpScreen } from './HelpScreen.tsx';
import { SettingsHeader } from './settings/SettingsHeader.tsx';
import { TeamSection } from './settings/TeamSection.tsx';
import { SettingsTabs } from './settings/SettingsTabs.tsx';
import { getDb } from '@infra/firebase';
import { doc, getDocFromServer, setDoc } from 'firebase/firestore';

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
  onSaveProfile: () => Promise<void>;
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
  playerQueue: QueuePlayer[];
  onAutoRegisterPartner: (pin: string, field: string) => Promise<string | null>;
  onDeletePartners?: (ids: Set<string>) => void;
  cloudLiveExists?: boolean;
  onCheckUpdate?: () => Promise<string | boolean>;
  setIsUpdatingVersion?: (val: boolean) => void;
  onOpenLiveControl?: () => void;
  role?: 'owner' | 'judge' | 'observer' | 'spectator';
  onOpenCommunications: () => void;
  unreadCount: number;
  onOpenMenu: () => void;
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  onJoinTournament: () => void;
  onExitTournament: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
  onNavigateToTab?: (tab: 'config' | 'history' | 'help' | 'profile' | 'regras') => void;
  appUrl: string;
  onVersionTap?: () => void;
}

// ─── Aprovação de login do relógio ────────────────────────────────────────────
const WatchLoginApproval: React.FC<{ userProfile: UserProfile }> = ({ userProfile }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleApprove = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 4) { setErrorMsg('Digite o código de 4 letras'); return; }
    const db = getDb();
    if (!db) { setErrorMsg('Sem conexão com o banco de dados'); return; }
    setStatus('loading');
    setErrorMsg('');
    try {
      const tokenRef = doc(db, 'watch_tokens', trimmed);
      // getDocFromServer ignora cache — garante que o token existe de verdade
      const snap = await getDocFromServer(tokenRef);
      if (!snap.exists()) { setStatus('error'); setErrorMsg('Código não encontrado'); return; }
      const data = snap.data();
      if (data.status !== 'pending') { setStatus('error'); setErrorMsg('Código já utilizado ou expirado'); return; }
      if (Date.now() > data.expiresAt) { setStatus('error'); setErrorMsg('Código expirado'); return; }
      // setDoc com merge evita problemas de permissão do updateDoc em docs criados por não-autenticados
      await setDoc(tokenRef, {
        status: 'approved',
        email: userProfile.email,
        pin: userProfile.pin,
        rememberMe: true,
        profile: {
          name: userProfile.name,
          nickname: userProfile.nickname,
          email: userProfile.email,
          pin: userProfile.pin,
          phone: userProfile.phone,
          isProfileComplete: userProfile.isProfileComplete,
          authMethod: userProfile.authMethod,
          planType: userProfile.planType,
        },
        approvedAt: Date.now(),
      }, { merge: true });
      setStatus('success');
      setCode('');
    } catch (e) {
      console.error('[WatchLoginApproval] Erro ao aprovar token:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Erro: ${msg.includes('permission') || msg.includes('PERMISSION') ? 'Permissão negada no banco de dados — verifique as regras do Firestore' : msg}`);
      setStatus('error');
    }
  };

  return (
    <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
      <p className="text-xs font-black text-blue-800">🕐 Login rápido para relógio</p>
      <p className="text-[11px] font-bold text-blue-500">Digite o código exibido no relógio para aprovar o acesso</p>
      {status === 'success' ? (
        <div className="flex items-center gap-2 py-2">
          <span className="text-green-600 font-black text-sm">✓ Relógio autorizado com sucesso!</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setStatus('idle'); setErrorMsg(''); }}
            maxLength={4}
            placeholder="Ex: K7X2"
            className="flex-1 h-11 bg-white border border-blue-200 rounded-xl px-3 font-black text-lg text-center text-blue-800 uppercase tracking-widest outline-none"
          />
          <button
            onClick={handleApprove}
            disabled={status === 'loading' || code.length !== 4}
            className="h-11 px-5 bg-blue-600 text-white rounded-xl font-black text-sm active:scale-95 disabled:opacity-50"
          >
            {status === 'loading' ? '...' : 'OK'}
          </button>
        </div>
      )}
      {errorMsg && <p className="text-xs font-bold text-red-500">{errorMsg}</p>}
    </div>
  );
};

export const SettingsScreen: React.FC<Props> = (props) => {
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const teamSectionRef = useRef<{ triggerStart: () => void }>(null);
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
        return (
          <>
            <ProfileScreen 
              profile={props.userProfile} 
              setProfile={props.setUserProfile} 
              onSave={props.onSaveProfile}
              onLogout={props.onLogout} 
              onGoAdmin={props.onGoAdmin} 
              onCheckUpdate={props.onCheckUpdate}
              setIsUpdatingVersion={props.setIsUpdatingVersion}
              settings={props.settings}
              setSettings={props.setSettings}
              onVersionTap={props.onVersionTap}
            />
            <WatchLoginApproval userProfile={props.userProfile} />
          </>
        );
      case 'history':
        return (
          <HistorySection 
            appUrl={props.appUrl}
            history={props.history} 
            searchQuery="" 
            setSearchQuery={() => {}} 
            isSyncingAll={props.isSyncingAll || false} 
            onSyncAll={props.onSyncAll || (() => {})} 
            onDownloadHistory={props.onDownloadHistory}
            cloudMatchesCount={props.cloudMatchesCount}
            isDownloading={props.isDownloading}
            onDeleteMatch={props.onDeleteMatch} 
            onViewMap={(id: string) => props.onViewMap(id)} 
            selectedMatches={selectedMatches} 
            setSelectedMatches={setSelectedMatches} 
          />
        );
      case 'help':
        return <HelpScreen profile={props.userProfile} onNavigateToTab={props.setActiveTab} onOpenRules={props.onOpenRules} onPlay={props.onPlayShortcut} canStartMatch={props.canStartMatch} />;
      case 'config':
      default:
        return <TeamSection 
          ref={teamSectionRef}
          settings={props.settings} 
          setSettings={props.setSettings} 
          onStartMatch={props.onStart} 
          onOpenPartners={props.onOpenPartners} 
          onAutoRegisterPartner={props.onAutoRegisterPartner}
          userProfile={props.userProfile}
          onJoinTournament={props.onJoinTournament}
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
          onStart={props.onPlayShortcut} 
          onDeleteSelected={() => { props.onDeleteManyMatches(selectedMatches); setSelectedMatches(new Set()); }} 
          onClearSelection={() => setSelectedMatches(new Set())} 
          isSettingsInicialSaved={props.isSettingsInicialSaved} 
          isProfileSaved={props.isProfileSaved}
          canStartMatch={props.canStartMatch}
          isMirroringActive={props.gameState?.isMirroringActive || props.cloudLiveExists}
          onOpenLiveControl={props.onOpenLiveControl}
          role={props.role}
          onOpenCommunications={props.onOpenCommunications}
          unreadCount={props.unreadCount}
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
        onOpenMenu={props.onOpenMenu}
        isOfflineMode={props.isOfflineMode}
      />
    </div>
  );
};
