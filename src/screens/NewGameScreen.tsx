import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Activity, ChevronDown, Play, Trophy, LayoutGrid, Settings, Mic, Sun, Volume2, Clock, Plus, Minus, ChevronUp, Watch, Target, Sparkles, Check, Ticket, X, WifiOff, Moon } from 'lucide-react';
import { Toggle } from '../components/Toggle';
import { MatchSettings, SportType, GameState, TournamentEvent, TieBreakAt, TieBreakSideSwitchMode, SportDefinition } from '../types';
import { useGame } from '@modules/game';
import { ScoreboardIcon } from '../components/ScoreboardIcon';
import { DEFAULT_PICKLEBALL_SETTINGS, DEFAULT_TENNIS_SETTINGS, SPORT_GROUPS, SPORT_LIST } from '../constants';
import { applyGoldenRule } from '../utils/formatters';
import { isWatchDevice } from '../utils/device';
import { getDb } from '@infra/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { LazySportIcon } from '../components/LazySportIcon';
import { Button } from '../components/Button';
import { SettingsTabs } from './settings/SettingsTabs';

interface Props {
  baseSettings: MatchSettings; 
  settings: MatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<MatchSettings>>;
  onSportChange?: (sport: SportType) => void;
  onBack: () => void;
  onHome: () => void;
  onGoToScoreboard: () => void;
  onNavigateToTab?: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  gameState: GameState | null;
  onStartMatch: () => void;
  onPlayShortcut: () => void;
  isSettingsRegrasSaved: boolean;
  isSettingsInicialSaved: boolean;
  canStartMatch: boolean;
  cloudLiveExists?: boolean;
  onOpenLiveControl?: () => void;
  isController?: boolean;
  activeEvent: TournamentEvent | null;
  onJoinTournament?: () => void;
  onExitTournament?: () => void;
  onOpenMenu?: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
  onVersionTap?: () => void;
}

type DbCategory = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
};

type DbSport = {
  id: string;
  name: string;
  url: string;
  group: string;
  engine: string;
  isActive: boolean;
};

export const NewGameScreen: React.FC<Props> = ({ settings, setSettings, onSportChange, onPlayShortcut, isSettingsRegrasSaved, isSettingsInicialSaved, canStartMatch, onNavigateToTab, gameState, cloudLiveExists, onOpenLiveControl, isController, onOpenMenu, isOfflineMode, onExitOffline, onHome }) => {
  const { userProfile } = useGame();
  const [activeGroupId, setActiveGroupId] = useState<string>(() => (SPORT_LIST.find(s => s.id === settings.sportType)?.group as string) || 'raquetes');
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [dbSports, setDbSports] = useState<DbSport[]>([]);
  const [isGeneralOpen, setIsGeneralOpen] = useState(false);

  const [resetPressProgress, setResetPressProgress] = useState(0);
  const resetPressTimerRef = useRef<number | null>(null);
  const resetProgressIntervalRef = useRef<number | null>(null);

  const startResetPress = () => {
    if (!onExitOffline) return;
    setResetPressProgress(0);
    const startTime = Date.now();
    resetProgressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setResetPressProgress(Math.min((elapsed / 3000) * 100, 100));
    }, 50);
    resetPressTimerRef.current = setTimeout(() => {
      stopResetPress();
      onExitOffline();
    }, 3000);
  };

  const stopResetPress = () => {
    if (resetPressTimerRef.current) clearTimeout(resetPressTimerRef.current);
    if (resetProgressIntervalRef.current) clearInterval(resetProgressIntervalRef.current);
    setResetPressProgress(0);
  };

  const isLiveActive = useMemo(() => {
    return !!(gameState?.isMirroringActive || cloudLiveExists);
  }, [gameState?.isMirroringActive, cloudLiveExists]);

  const isReadOnly = useMemo(() => {
    return !!cloudLiveExists && !isController;
  }, [cloudLiveExists, isController]);

  useEffect(() => {
    if (isOfflineMode || !userProfile?.email) {
      // 1ª opção: cache da última sessão online (reflete o que o admin configurou)
      const cachedCats  = localStorage.getItem('myPlacar_ActiveCategories');
      const cachedSports = localStorage.getItem('myPlacar_ActiveSports');
      if (cachedCats && cachedSports) {
        try {
          setDbCategories(JSON.parse(cachedCats));
          setDbSports(JSON.parse(cachedSports));
          return;
        } catch (_) { /* cache corrompido — cai no fallback abaixo */ }
      }
      // 2º fallback: constants (nunca foi online ou cache inválido)
      setDbCategories(SPORT_GROUPS.filter(g => g.isActive !== false).map(g => ({ id: g.id, name: g.name, url: g.icon, isActive: true })));
      setDbSports(SPORT_LIST.filter(s => s.isActive !== false).map(s => ({ id: s.id, name: s.name, url: s.defaultIcon, group: s.group, engine: s.engine, isActive: true })));
      return;
    }
    const fetchData = async () => {
      const db = getDb();
      if (!db) return;
      try {
        const catSnap = await getDocs(collection(db, "category_icons"));
        const sportSnap = await getDocs(collection(db, "sport_icons"));
            const cats: DbCategory[] = [];
        catSnap.forEach(doc => cats.push({ id: doc.id, isActive: true, ...doc.data() } as DbCategory));
        const sports: DbSport[] = [];
        sportSnap.forEach(doc => sports.push({ id: doc.id, isActive: true, ...doc.data() } as DbSport));
        const finalCats: DbCategory[] = cats.length > 0 ? cats : SPORT_GROUPS.map(g => ({ id: g.id, name: g.name, url: g.icon, isActive: true }));
        const finalSports: DbSport[] = sports.length > 0 ? sports : SPORT_LIST.map(s => ({ id: s.id, name: s.name, url: s.defaultIcon, group: s.group, engine: s.engine, isActive: true }));
        const activeCats   = finalCats.filter(c => c.isActive !== false);
        const activeSports = finalSports.filter(s => s.isActive !== false);
        setDbCategories(activeCats);
        setDbSports(activeSports);
        // Persiste para uso offline — reflete sempre a última config do admin
        localStorage.setItem('myPlacar_ActiveCategories', JSON.stringify(activeCats));
        localStorage.setItem('myPlacar_ActiveSports',     JSON.stringify(activeSports));
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, [userProfile?.email, isOfflineMode]);

  useEffect(() => {
    if (settings.gamesPerSet === 4 && settings.tieBreakAt !== '3-3') {
      setSettings(prev => prev.tieBreakAt !== '3-3' ? { ...prev, tieBreakAt: '3-3' } : prev);
    } else if (settings.gamesPerSet === 6 && settings.tieBreakAt === '3-3') {
      setSettings(prev => prev.tieBreakAt === '3-3' ? { ...prev, tieBreakAt: '6-6' } : prev);
    }
  }, [settings.gamesPerSet, settings.tieBreakAt, setSettings]);

  // Zera tie-break automaticamente quando sets muda para 1 (apenas para esportes que não são tênis/beach-tênis)
  useEffect(() => {
    const isTennisSport = settings.sportType === 'tennis' || settings.sportType === 'beach-tennis';
    if (settings.sets === 1 && settings.tieBreak && !isTennisSport) {
      setSettings(prev => ({ ...prev, tieBreak: false }));
    }
  }, [settings.sets, settings.tieBreak, settings.sportType, setSettings]);

  const handleSportSelect = (sportId: string) => {
    if (isReadOnly) return;
    const globalSettings = {
      voiceEnabled: settings.voiceEnabled,
      voiceScoring: settings.voiceScoring,
      useGeminiVoice: settings.useGeminiVoice,
      geminiVoiceName: settings.geminiVoiceName,
      geminiPersona: settings.geminiPersona,
      selectedVoiceURI: settings.selectedVoiceURI,
      brightness: settings.brightness,
      volume: settings.volume,
      actionCooldown: settings.actionCooldown,
      stateLockout: settings.stateLockout,
      isWatchMode: settings.isWatchMode,
      errorSoundType: settings.errorSoundType,
      goldenRuleEnabled: settings.goldenRuleEnabled,
      // Preserva nomes e cores ao trocar de esporte
      p1Name: settings.p1Name,
      p1Partner: settings.p1Partner,
      p2Name: settings.p2Name,
      p2Partner: settings.p2Partner,
      p1Color: settings.p1Color,
      p2Color: settings.p2Color,
      p1Verified: settings.p1Verified,
      p1PartnerVerified: settings.p1PartnerVerified,
      p2Verified: settings.p2Verified,
      p2PartnerVerified: settings.p2PartnerVerified,
    };
    if (settings.sportType) localStorage.setItem(`myPlacar_SavedSettings_${settings.sportType}`, JSON.stringify(settings));
    const def = dbSports.find(s => s.id === sportId);
    if (!def) return;
    let nextSettings: MatchSettings;
    const saved = localStorage.getItem(`myPlacar_SavedSettings_${sportId}`);
    if (saved) {
      try { nextSettings = JSON.parse(saved); } catch (e) { const engineDefaults = def.engine === 'tennis' ? DEFAULT_TENNIS_SETTINGS : DEFAULT_PICKLEBALL_SETTINGS; nextSettings = { ...engineDefaults, sportType: sportId }; }
    } else {
      const engineDefaults = def.engine === 'tennis' ? DEFAULT_TENNIS_SETTINGS : DEFAULT_PICKLEBALL_SETTINGS;
      nextSettings = { ...engineDefaults, sportType: sportId };
    }
    if (sportId === 'pickleball' && nextSettings.tieBreakPoints === 7) nextSettings.tieBreakPoints = 15;

    // Overrides por esporte — aplicados APÓS o globalSettings para garantir
    // que sempre prevalecem sobre o localStorage e o estado anterior do usuário.
    const sportOverrides: Partial<MatchSettings> = {};
    if (sportId === 'tennis') {
      sportOverrides.sets = 1;
      sportOverrides.noAd = false;
    }
    if (sportId === 'beach-tennis') {
      sportOverrides.sets = 1;
      sportOverrides.noAd = true;
    }
    if (sportId === 'pickleball') {
      sportOverrides.sets = 1;
      sportOverrides.gamesPerSet = 21;
    }

    const finalSettings = { ...nextSettings, ...globalSettings, ...sportOverrides, sportType: sportId };
    setSettings(finalSettings);
    if (onSportChange) onSportChange(sportId);
  };

  const gr = settings.goldenRuleEnabled;

  return (
    <div className="min-h-screen bg-[#E5E7EB] flex flex-col relative font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-50 relative">
        <div className="flex items-center gap-3">
          {!isOfflineMode && (
            <button onClick={onHome} className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-500 relative ${isSettingsInicialSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              <ScoreboardIcon className="w-6 h-6" />
              {isSettingsInicialSaved && isLiveActive && <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100"><Check size={8} strokeWidth={4} /></div>}
            </button>
          )}
          {isOfflineMode && (
            <button 
              onPointerDown={startResetPress}
              onPointerUp={stopResetPress}
              onPointerLeave={stopResetPress}
              className="w-10 h-10 rounded-full flex items-center justify-center text-black bg-yellow-500 shadow-md border-2 border-white relative overflow-hidden active:scale-95 transition-transform"
            >
              {resetPressProgress > 0 && (
                <div 
                  className="absolute inset-0 bg-black/10 origin-left transition-all duration-75" 
                  style={{ transform: `scaleX(${resetPressProgress / 100})` }} 
                />
              )}
              <WifiOff size={22} className="relative z-10" />
            </button>
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-colors duration-500 relative ${isSettingsRegrasSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
            <Settings size={22} />
            {isSettingsRegrasSaved && isLiveActive && (
              <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </div>
          <h1 className="text-base font-black text-black flex items-center gap-2">
            Regras
          </h1>
        </div>
        <div className="flex-1 flex justify-end">
          <button onClick={onPlayShortcut} disabled={!canStartMatch} className={`p-2 active:scale-90 transition-all ${canStartMatch ? 'text-emerald-500' : 'text-slate-200 opacity-50'}`}>
            <Play size={28} fill="currentColor" />
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 pt-6 pb-40 space-y-6 max-w-2xl mx-auto w-full no-scrollbar overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><Watch size={20} className="text-indigo-600" /><h2 className="text-sm font-black text-black">Otimização do placar</h2></div>
          <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-4">
            <Toggle 
              id="toggle-watchmode" 
              label="Modo relógio" 
              checked={isOfflineMode ? true : (settings.isWatchMode || false)} 
              disabled={isWatchDevice() && !!isOfflineMode}
              onChange={v => { 
                const next = {...settings, isWatchMode: v, isScoreboardMode: v ? false : settings.isScoreboardMode};
                setSettings(next); 
                localStorage.setItem('myPlacarSettings', JSON.stringify(next)); 
              }} 
            />
            <Toggle 
              id="toggle-scoreboardmode" 
              label="Modo placar" 
              checked={settings.isScoreboardMode || false} 
              disabled={isWatchDevice()}
              onChange={v => { 
                const next = {...settings, isScoreboardMode: v, isWatchMode: v ? false : settings.isWatchMode};
                setSettings(next); 
                localStorage.setItem('myPlacarSettings', JSON.stringify(next)); 
              }} 
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><LayoutGrid size={20} className="text-blue-600" /><h2 className="text-sm font-black text-black">Categorias</h2></div>
          <div className={`bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 flex items-center justify-between ${isReadOnly ? 'opacity-70 grayscale-[0.3]' : ''}`}>
            <div className="flex-1 space-y-1">
              <div className="relative">
                <select 
                  disabled={isReadOnly}
                  value={activeGroupId} onChange={(e) => setActiveGroupId(e.target.value)} className="w-full h-14 bg-gray-100/50 rounded-2xl px-5 text-sm font-black text-black appearance-none outline-none pr-10 disabled:cursor-not-allowed">
                  {dbCategories.map(g => <option key={g.id} value={g.id}>{applyGoldenRule(g.name, gr)}</option>)}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-black pointer-events-none" />
              </div>
            </div>
            <div className="ml-4 w-20 h-20 flex items-center justify-center bg-white rounded-3xl shadow-xs border border-gray-100 overflow-hidden text-5xl">
               {(() => {
                 const cat = dbCategories.find(c => c.id === activeGroupId);
                 const icon = cat?.url || '📁';
                 return icon.startsWith('http') || icon.startsWith('data') ? <img src={icon} className="w-full h-full object-cover" /> : icon;
               })()}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><Trophy size={20} className="text-emerald-600" /><h2 className="text-sm font-black text-black">Esportes</h2></div>
          <div className={`bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 flex items-center justify-between ${isReadOnly ? 'opacity-70 grayscale-[0.3]' : ''}`}>
            <div className="flex-1 space-y-1">
              <div className="relative">
                <select 
                  disabled={isReadOnly}
                  value={settings.sportType} onChange={(e) => handleSportSelect(e.target.value)} className="w-full h-14 bg-gray-100/50 rounded-2xl px-5 text-sm font-black text-black appearance-none outline-none pr-10 disabled:cursor-not-allowed">
                  {dbSports.filter(s => s.group === activeGroupId).map(s => <option key={s.id} value={s.id}>{applyGoldenRule(s.name, gr)}</option>)}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-black pointer-events-none" />
              </div>
            </div>
            <LazySportIcon sportId={settings.sportType} defaultIcon={dbSports.find(s => s.id === settings.sportType)?.url || '🎾'} className="ml-4 w-20 h-20 bg-white rounded-3xl shadow-xs border border-gray-100 text-5xl" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><Activity size={20} className="text-red-500" /><h2 className="text-sm font-black text-black">Regras da partida</h2></div>
          <div className={`bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-6 ${isReadOnly ? 'opacity-70 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-black">Set melhor de</span>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(settings.sportType === 'pickleball' ? [1, 3] : [1, 3, 5]).map(num => (
                  <button 
                    disabled={isReadOnly}
                    key={num} onClick={() => setSettings({...settings, sets: num as 1 | 3 | 5})} className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${Number(settings.sets) === num ? 'bg-blue-600 text-white shadow-md' : 'text-black'}`}>{num}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-black">{settings.sportType === 'pickleball' ? 'Pontos por game' : 'Games por set'}</span>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(settings.sportType === 'pickleball' ? [11, 15, 21] : [4, 6]).map(num => (
                  <button 
                    disabled={isReadOnly}
                    key={num} onClick={() => setSettings({...settings, gamesPerSet: num})} className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${Number(settings.gamesPerSet) === num ? 'bg-blue-600 text-white shadow-md' : 'text-black'}`}>{num}</button>
                ))}
              </div>
            </div>
            {settings.sportType === 'pickleball' && (
              <div className="space-y-3 pt-2 border-t border-gray-50">
                <span className="text-sm font-black text-black block">Tipo de pontuação</span>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    disabled={isReadOnly}
                    onClick={() => setSettings({...settings, pickleballScoringMode: 'side-out'})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.pickleballScoringMode === 'side-out' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>Tradicional (Side-out)</button>
                  <button 
                    disabled={isReadOnly}
                    onClick={() => setSettings({...settings, pickleballScoringMode: 'rally'})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.pickleballScoringMode === 'rally' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>Rally (Ponto é ponto)</button>
                </div>
              </div>
            )}
            {settings.sportType === 'pickleball' && <Toggle disabled={isReadOnly} id="toggle-winbytwo-main" label="Diferença de 2 pontos" checked={settings.tieBreakWinByTwo} onChange={v => setSettings({...settings, tieBreakWinByTwo: v})} />}
            {settings.sportType === 'pickleball' && (
              <Toggle disabled={isReadOnly} id="toggle-pickleball-service-mode" label="Tipo de sacador: sacador troca de lado" checked={settings.pickleballServiceMode === 'switch-side'} onChange={v => setSettings({...settings, pickleballServiceMode: v ? 'switch-side' : 'alternate-server'})} />
            )}
            {settings.sportType !== 'pickleball' && <Toggle disabled={isReadOnly || settings.sportType === 'beach-tennis'} id="toggle-noad" label="Sem vantagem (no-ad)" checked={settings.noAd} onChange={v => setSettings({...settings, noAd: v})} />}
            {settings.sportType !== 'pickleball' && <Toggle disabled={isReadOnly} id="toggle-switchside" label="Troca de lado no ímpar" checked={settings.switchSidesOdd} onChange={v => setSettings({...settings, switchSidesOdd: v})} />}
          </div>
        </div>

        <div className={`bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-6 ${isReadOnly ? 'opacity-70 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><Target size={20} /></div><h2 className="text-sm font-black text-black">Tie break</h2></div>
          <Toggle disabled={isReadOnly || (settings.sets === 1 && settings.sportType !== 'tennis' && settings.sportType !== 'beach-tennis')} id="toggle-tb" label="Habilitar tie break" checked={settings.tieBreak} onChange={v => setSettings({...settings, tieBreak: v})} />
          {settings.tieBreak && (
            <div className="space-y-6 animate-in slide-in-from-top-4">
              {settings.sportType !== 'pickleball' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-black">Set: quando</span>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                    {['3-3', '5-5', '6-6'].map(val => {
                      const isOptionDisabled = (settings.gamesPerSet === 4 && val !== '3-3') || (settings.gamesPerSet === 6 && val === '3-3') || isReadOnly;
                      if (isOptionDisabled && !isReadOnly) return null;
                      return <button disabled={isReadOnly} key={val} onClick={() => setSettings({...settings, tieBreakAt: val as TieBreakAt})} className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${settings.tieBreakAt === val ? 'bg-blue-600 text-white shadow-md' : 'text-black'}`}>{val}</button>;
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-black">Pontos tie break</span>
                <div className="flex items-center bg-gray-100 rounded-xl px-2 py-1 gap-4">
                  <button disabled={isReadOnly} onClick={() => setSettings({...settings, tieBreakPoints: Math.max(1, settings.tieBreakPoints - 1)})} className="p-1 text-black active:scale-75 transition-all"><Minus size={16} /></button>
                  <span className="text-sm font-black text-black w-4 text-center">{settings.tieBreakPoints}</span>
                  <button disabled={isReadOnly} onClick={() => setSettings({...settings, tieBreakPoints: settings.tieBreakPoints + 1})} className="p-1 text-black active:scale-75 transition-all"><Plus size={16} /></button>
                </div>
              </div>
              <Toggle disabled={isReadOnly} id="toggle-winbytwo" label="Diferença de 2 pontos" checked={settings.tieBreakWinByTwo} onChange={v => setSettings({...settings, tieBreakWinByTwo: v})} />
              {settings.sportType !== 'pickleball' && (
                <div className="space-y-3">
                  <span className="text-sm font-black text-black block">Troca de lado no tie break</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ id: '1_6', label: '1 + soma de 6 pts' }, { id: '1_4', label: '1 + 4 pts' }, { id: '1_2', label: '1 + 2 pts (Ímpar)' }, { id: null, label: 'Não trocar' }].map(opt => (
                      <button disabled={isReadOnly} key={opt.id === null ? 'none' : opt.id} onClick={() => setSettings({...settings, tieBreakSideSwitchMode: opt.id as TieBreakSideSwitchMode})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.tieBreakSideSwitchMode === opt.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>{opt.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!isOfflineMode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2"><Sparkles size={20} className="text-blue-500" /><h2 className="text-sm font-black text-black">Narrador contextual (ia)</h2></div>
            <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-4">
              <Toggle id="toggle-gemini-voice" label="Ativar inteligência artificial" checked={settings.useGeminiVoice} onChange={v => setSettings({...settings, useGeminiVoice: v})} />
              <p className="text-[10px] font-bold text-black leading-tight px-1">Voz humana e inteligente que narra os pontos com emoção e contexto real.</p>
            </div>
          </div>
        )}

        {!isOfflineMode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2"><Mic size={20} className="text-blue-500" /><h2 className="text-sm font-black text-black">Voz e narração</h2></div>
            <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-4">
              <Toggle id="toggle-voice-cmd" label="Comandos de voz" checked={settings.voiceEnabled} onChange={v => setSettings({...settings, voiceEnabled: v})} />
              <Toggle id="toggle-voice-scoring" label="Narrar placar" checked={settings.voiceScoring} onChange={v => setSettings({...settings, voiceScoring: v})} />
            </div>
          </div>
        )}

        {!isOfflineMode && (
          <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-2 shadow-sm border border-white space-y-2">
            <button onClick={() => setIsGeneralOpen(!isGeneralOpen)} className="w-full flex items-center justify-between p-4 px-6 text-black">
               <div className="flex items-center gap-3"><Settings size={20} /><span className="text-sm font-black">Configurações locais</span></div>
               {isGeneralOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {isGeneralOpen && (
              <div className="px-4 pb-6 space-y-6 animate-in slide-in-from-top-2">
                <div className="bg-white/50 rounded-[2rem] p-5 shadow-xs border border-white space-y-8">
                  <div className="space-y-4">
                    <span className="text-sm font-black text-black">Brilho da tela</span>
                    <div className="flex items-center gap-4">
                      <Sun size={18} className="text-orange-400 shrink-0" />
                      <input 
                        type="range" min="10" max="100" 
                        value={settings.brightness} 
                        onChange={e => setSettings({...settings, brightness: parseInt(e.target.value)})} 
                        className="flex-1 accent-orange-400 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer" 
                      />
                      <span className="text-xs font-black text-gray-600 min-w-[35px] text-right">{settings.brightness}%</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <span className="text-sm font-black text-black">Volume do áudio</span>
                    <div className="flex items-center gap-4">
                      <Volume2 size={18} className="text-emerald-500 shrink-0" />
                      <input 
                        type="range" min="0" max="100" 
                        value={settings.volume} 
                        onChange={e => setSettings({...settings, volume: parseInt(e.target.value)})} 
                        className="flex-1 accent-emerald-500 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer" 
                      />
                      <span className="text-xs font-black text-gray-600 min-w-[35px] text-right">{settings.volume}%</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Moon size={16} className="text-indigo-400 shrink-0" />
                      <span className="text-sm font-black text-black">Escurecer tela</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {([10, 15, 20] as const).map(sec => (
                        <button
                          key={sec}
                          onClick={() => setSettings({...settings, screenDimTimeout: sec})}
                          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${(settings.screenDimTimeout || 10) === sec ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] font-bold text-gray-400 leading-tight">Tempo sem interação até a tela escurecer no modo relógio.</p>
                  </div>
                </div>

                <div className="bg-white/50 rounded-[2rem] p-5 shadow-xs border border-white space-y-4">
                  <div className="flex items-center gap-3 mb-2"><Clock size={18} className="text-indigo-600" /><span className="text-sm font-black text-black">Latência</span></div>
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <span className="text-sm font-black text-black">Debounce de ação</span>
                      <div className="flex items-center gap-4">
                        <Clock size={16} className="text-gray-400" /><input type="range" min="1" max="10" value={settings.actionCooldown} onChange={e => setSettings({...settings, actionCooldown: parseInt(e.target.value)})} className="flex-1 accent-indigo-600 h-1.5 bg-gray-200 rounded-full appearance-none" /><span className="text-xs font-black text-gray-600 min-w-[20px]">{settings.actionCooldown}s</span>
                      </div>
                      <p className="text-[11px] font-bold text-gray-400 leading-tight">Tempo mínimo entre os pontos para evitar duplicação em redes lentas.</p>
                    </div>
                    <div className="space-y-4">
                      <span className="text-sm font-black text-black">Trava de estado</span>
                      <div className="flex items-center gap-4">
                        <Clock size={16} className="text-gray-400" /><input type="range" min="1" max="10" value={settings.stateLockout} onChange={e => setSettings({...settings, stateLockout: parseInt(e.target.value)})} className="flex-1 accent-indigo-600 h-1.5 bg-gray-200 rounded-full appearance-none" /><span className="text-xs font-black text-gray-600 min-w-[20px]">{settings.stateLockout}s</span>
                      </div>
                      <p className="text-[11px] font-bold text-gray-400 leading-tight">Bloqueio de voz após falar o placar para evitar eco.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <SettingsTabs 
        activeTab="regras" 
        setActiveTab={onNavigateToTab || (() => {})} 
        onOpenRules={() => {}} 
        isSettingsRegrasSaved={isSettingsRegrasSaved}
        isSettingsInicialSaved={isSettingsInicialSaved}
        isMirroringActive={isLiveActive}
        onOpenMenu={onOpenMenu || (() => {})}
        isOfflineMode={isOfflineMode}
        onExitOffline={onExitOffline}
      />
    </div>
  );
};
