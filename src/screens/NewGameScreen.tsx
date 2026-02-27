
import React, { useEffect, useState, useMemo } from 'react';
import { Activity, ChevronDown, Play, Trophy, LayoutGrid, Settings, Mic, Sun, Volume2, Clock, Plus, Minus, ChevronUp, User, HelpCircle, Watch, Target, Sparkles, Antenna, Check, Ticket, X, Loader2, Share2, Copy, QrCode } from 'lucide-react';
import { Toggle } from '../components/Toggle';
import { MatchSettings, SportType, GameState, TournamentEvent, UserProfile } from '../types';
import { ScoreboardIcon } from '../components/ScoreboardIcon';
import { DEFAULT_PICKLEBALL_SETTINGS, DEFAULT_TENNIS_SETTINGS, SPORT_GROUPS, SPORT_LIST } from '../constants';
import { applyGoldenRule } from '../utils/formatters';
import { getDb } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { LazySportIcon } from '../components/LazySportIcon';
import { Button } from '../components/Button';
import { LiveIndicator } from '../components/LiveIndicator';

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
  role?: 'owner' | 'observer' | 'spectator';
  activeEvent: TournamentEvent | null;
  // Alterado para () => void para consistência com as outras telas
  onJoinTournament?: () => void;
  onExitTournament?: () => void;
  userProfile: UserProfile;
}

export const NewGameScreen: React.FC<Props> = ({ settings, setSettings, onSportChange, onPlayShortcut, isSettingsRegrasSaved, isSettingsInicialSaved, onBack, canStartMatch, onNavigateToTab, gameState, cloudLiveExists, onOpenLiveControl, role, activeEvent, onJoinTournament, onExitTournament, userProfile }) => {
  const [activeGroupId, setActiveGroupId] = useState<string>(() => (SPORT_LIST.find(s => s.id === settings.sportType)?.group as string) || 'raquetes');
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbSports, setDbSports] = useState<any[]>([]);
  const [isGeneralOpen, setIsGeneralOpen] = useState(false);

  const isLiveActive = useMemo(() => {
    return !!(gameState?.isMirroringActive || cloudLiveExists);
  }, [gameState?.isMirroringActive, cloudLiveExists]);

  const isReadOnly = useMemo(() => {
    return !!cloudLiveExists && role !== 'owner';
  }, [cloudLiveExists, role]);

  useEffect(() => {
    const fetchData = async () => {
      const db = getDb();
      if (!db) return;
      try {
        const catSnap = await getDocs(collection(db, "category_icons"));
        const sportSnap = await getDocs(collection(db, "sport_icons"));
        const cats: any[] = [];
        catSnap.forEach(doc => cats.push({ id: doc.id, isActive: true, ...doc.data() }));
        const sports: any[] = [];
        sportSnap.forEach(doc => sports.push({ id: doc.id, isActive: true, ...doc.data() }));
        const finalCats = cats.length > 0 ? cats : SPORT_GROUPS.map(g => ({ id: g.id, name: g.name, url: g.icon, isActive: true }));
        const finalSports = sports.length > 0 ? sports : SPORT_LIST.map(s => ({ id: s.id, name: s.name, url: s.defaultIcon, group: s.group, engine: s.engine, isActive: true }));
        setDbCategories(finalCats.filter(c => c.isActive !== false));
        setDbSports(finalSports.filter(s => s.isActive !== false));
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (settings.gamesPerSet === 4 && settings.tieBreakAt !== '3-3') {
      setSettings(prev => prev.tieBreakAt !== '3-3' ? { ...prev, tieBreakAt: '3-3' } : prev);
    } else if (settings.gamesPerSet === 6 && settings.tieBreakAt === '3-3') {
      setSettings(prev => prev.tieBreakAt === '3-3' ? { ...prev, tieBreakAt: '6-6' } : prev);
    }
  }, [settings.gamesPerSet, settings.tieBreakAt, setSettings]);

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
      goldenRuleEnabled: settings.goldenRuleEnabled
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
    const finalSettings = { ...nextSettings, ...globalSettings, sportType: sportId };
    setSettings(finalSettings);
    if (onSportChange) onSportChange(sportId);
  };

  const gr = settings.goldenRuleEnabled;

  return (
    <div className="min-h-screen bg-[#E5E7EB] flex flex-col relative font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="flex-1 flex items-center">
          {isLiveActive && (
            <LiveIndicator 
              onClick={onOpenLiveControl} 
              role={role} 
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-colors duration-500 relative ${isSettingsRegrasSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
            <Settings size={22} />
            {isSettingsRegrasSaved && isLiveActive && (
              <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </div>
          <h1 className="text-base font-black text-black">Regras</h1>
        </div>
        <div className="flex-1 flex justify-end">
          <button onClick={onPlayShortcut} disabled={!canStartMatch} className={`p-2 active:scale-90 transition-all ${canStartMatch ? 'text-emerald-500' : 'text-slate-200 opacity-50'}`}>
            <Play size={28} fill="currentColor" />
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 pt-6 pb-40 space-y-6 max-w-2xl mx-auto w-full no-scrollbar overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><Watch size={20} className="text-indigo-600" /><h2 className="text-sm font-black text-black">Otimização para relógios</h2></div>
          <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-4">
            <Toggle id="toggle-watchmode" label="Modo relógio (interface gigante)" checked={settings.isWatchMode || false} onChange={v => { 
                const next = {...settings, isWatchMode: v};
                setSettings(next); 
                localStorage.setItem('myPlacarSettings', JSON.stringify(next)); 
            }} />
            <p className="text-[10px] font-bold text-black leading-tight px-1">Ideal para telas de 200x200px. Divide a tela em dois botões massivos.</p>
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
                    key={num} onClick={() => setSettings({...settings, sets: num as any})} className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${Number(settings.sets) === num ? 'bg-blue-600 text-white shadow-md' : 'text-black'}`}>{num}</button>
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
              <div className="space-y-3 pt-2 border-t border-gray-50">
                <span className="text-sm font-black text-black block">Tipo de saque</span>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    disabled={isReadOnly}
                    onClick={() => setSettings({...settings, pickleballServiceMode: 'switch-side'})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.pickleballServiceMode === 'switch-side' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>Sacador troca de lado</button>
                  <button 
                    disabled={isReadOnly}
                    onClick={() => setSettings({...settings, pickleballServiceMode: 'alternate-server'})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.pickleballServiceMode === 'alternate-server' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>Sacador não troca de lado</button>
                </div>
              </div>
            )}
            {settings.sportType !== 'pickleball' && <Toggle disabled={isReadOnly} id="toggle-noad" label="Sem vantagem (no-ad)" checked={settings.noAd} onChange={v => setSettings({...settings, noAd: v})} />}
            {settings.sportType !== 'pickleball' && <Toggle disabled={isReadOnly} id="toggle-switchside" label="Troca de lado no ímpar" checked={settings.switchSidesOdd} onChange={v => setSettings({...settings, switchSidesOdd: v})} />}
          </div>
        </div>

        <div className={`bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-6 ${isReadOnly ? 'opacity-70 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><Target size={20} /></div><h2 className="text-sm font-black text-black">Tie break</h2></div>
          <Toggle disabled={isReadOnly} id="toggle-tb" label="Habilitar tie break" checked={settings.tieBreak} onChange={v => setSettings({...settings, tieBreak: v})} />
          {settings.tieBreak && (
            <div className="space-y-6 animate-in slide-in-from-top-4">
              {settings.sportType !== 'pickleball' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-black">Set: quando</span>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                    {['3-3', '5-5', '6-6'].map(val => {
                      const isOptionDisabled = (settings.gamesPerSet === 4 && val !== '3-3') || (settings.gamesPerSet === 6 && val === '3-3') || isReadOnly;
                      if (isOptionDisabled && !isReadOnly) return null;
                      return <button disabled={isReadOnly} key={val} onClick={() => setSettings({...settings, tieBreakAt: val as any})} className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${settings.tieBreakAt === val ? 'bg-blue-600 text-white shadow-md' : 'text-black'}`}>{val}</button>;
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
                      <button disabled={isReadOnly} key={opt.id === null ? 'none' : opt.id} onClick={() => setSettings({...settings, tieBreakSideSwitchMode: opt.id as any})} className={`py-4 px-2 rounded-2xl text-[11px] font-black transition-all border ${settings.tieBreakSideSwitchMode === opt.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-black border-transparent'}`}>{opt.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-2"><Sparkles size={20} className="text-blue-500" /><h2 className="text-sm font-black text-black">Narrador contextual (ia)</h2></div>
          <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-white/50 space-y-4">
            <Toggle id="toggle-gemini-voice" label="Ativar inteligência artificial" checked={settings.useGeminiVoice} onChange={v => setSettings({...settings, useGeminiVoice: v})} />
            <p className="text-[10px] font-bold text-black leading-tight px-1">Voz humana e inteligente que narra os pontos com emoção e contexto real.</p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-2 shadow-sm border border-white space-y-2">
          <button onClick={() => setIsGeneralOpen(!isGeneralOpen)} className="w-full flex items-center justify-between p-4 px-6 text-black">
             <div className="flex items-center gap-3"><Settings size={20} /><span className="text-sm font-black">Configurações locais</span></div>
             {isGeneralOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          {isGeneralOpen && (
            <div className="px-4 pb-6 space-y-6 animate-in slide-in-from-top-2">
              <div className="bg-white/50 rounded-[2rem] p-5 shadow-xs border border-white space-y-4">
                 <div className="flex items-center gap-3 mb-2"><Mic size={18} className="text-indigo-500" /><span className="text-sm font-black text-black">Voz e narração</span></div>
                 <Toggle id="toggle-voice-cmd" label="Comandos de voz" checked={settings.voiceEnabled} onChange={v => setSettings({...settings, voiceEnabled: v})} />
                 <Toggle id="toggle-voice-scoring" label="Narrar placar" checked={settings.voiceScoring} onChange={v => setSettings({...settings, voiceScoring: v})} />
              </div>
              
              <div className="bg-white/50 rounded-[2rem] p-5 shadow-xs border border-white space-y-8">
                <div className="space-y-4">
                  <span className="text-sm font-black text-gray-700">Brilho da tela</span>
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
                  <span className="text-sm font-black text-gray-700">Volume do áudio</span>
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
              </div>

              <div className="bg-white/50 rounded-[2rem] p-5 shadow-xs border border-white space-y-4">
                <div className="flex items-center gap-3 mb-2"><Clock size={18} className="text-indigo-600" /><h2 className="text-sm font-black text-black">Latência</h2></div>
                <div className="space-y-8">
                  <div className="space-y-4">
                    <span className="text-sm font-black text-gray-700">Debounce de ação</span>
                    <div className="flex items-center gap-4">
                      <Clock size={16} className="text-gray-400" /><input type="range" min="1" max="10" value={settings.actionCooldown} onChange={e => setSettings({...settings, actionCooldown: parseInt(e.target.value)})} className="flex-1 accent-indigo-600 h-1.5 bg-gray-200 rounded-full appearance-none" /><span className="text-xs font-bold text-gray-600 min-w-[20px]">{settings.actionCooldown}s</span>
                    </div>
                    <p className="text-[11px] font-bold text-gray-400 leading-tight">Tempo mínimo entre os pontos para evitar duplicação em redes lentas.</p>
                  </div>
                  <div className="space-y-4">
                    <span className="text-sm font-black text-gray-700">Trava de estado</span>
                    <div className="flex items-center gap-4">
                      <Clock size={16} className="text-gray-400" /><input type="range" min="1" max="10" value={settings.stateLockout} onChange={e => setSettings({...settings, stateLockout: parseInt(e.target.value)})} className="flex-1 accent-indigo-600 h-1.5 bg-gray-200 rounded-full appearance-none" /><span className="text-xs font-bold text-gray-600 min-w-[20px]">{settings.stateLockout}s</span>
                    </div>
                    <p className="text-[11px] font-bold text-gray-400 leading-tight">Bloqueio de voz após falar o placar para evitar eco.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-4 pt-3 pb-10 flex justify-between items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button onClick={() => onNavigateToTab?.('config')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${isSettingsInicialSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
            <ScoreboardIcon className="w-6 h-6" />
            {isSettingsInicialSaved && isLiveActive && (
              <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                <Check size={8} strokeWidth={4} />
              </div>
            )}
          </div>
          <span className="text-[10px] font-black text-black">Início</span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-100 scale-110">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-colors duration-500 relative ${isSettingsRegrasSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
            <Settings size={22} />
            {isSettingsRegrasSaved && isLiveActive && (
              <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                <Check size={8} strokeWidth={4} />
              </div>
            )}
          </div>
          <span className="text-[10px] font-black text-black">Regras</span>
        </button>
        <button onClick={() => onNavigateToTab?.('history')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40"><Clock size={22} className="text-black" /><span className="text-[10px] font-black text-black">Histórico</span></button>
        <button onClick={() => onNavigateToTab?.('profile')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40"><User size={22} className="text-black" /><span className="text-[10px] font-black text-black">Perfil</span></button>
        <button onClick={() => onNavigateToTab?.('help')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40"><HelpCircle size={22} className="text-black" /><span className="text-[10px] font-black text-black">Ajuda</span></button>
      </nav>
    </div>
  );
};
