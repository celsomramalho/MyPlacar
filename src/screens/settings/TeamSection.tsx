
import React, { useState, forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import { ArrowUpDown, Play, User, Users, ChevronDown, Camera, Dices, UserPlus, Loader2, Mic, ArrowRightLeft, Disc, ShieldCheck, Check, Antenna, Eraser, History, Trophy, Ticket, X, Share2, Copy } from 'lucide-react';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { MatchSettings, GameState, Partner, UserProfile, TournamentEvent } from '../../types';
import { formatPortugueseName } from '../../utils/formatters';
import { SPORT_LIST } from '../../constants';
import { getDb } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';

type Gender = 'M' | 'F';

const MarsIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5" /><path d="M15 3h6v6" /><path d="m21 3-6.5 6.5" />
  </svg>
);

const VenusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="5" /><path d="M12 14v7" /><path d="M9 18h6" />
  </svg>
);

const RaquetIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M11 11L4 18M4 18L3 21L6 20L11 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="15" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 6C12 6 13.5 9 15 9C16.5 9 18 6 18 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <path d="M15 3C15 3 12 4.5 12 6C12 7.5 15 9 15 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <circle cx="7" cy="11" r="2.5" fill="#bef264" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const guessGender = (name: string): Gender | undefined => {
  if (!name) return undefined;
  const firstWord = name.trim().split(' ')[0].toUpperCase();
  if (!firstWord || firstWord.length < 2) return undefined;
  const lastChar = firstWord.slice(-1);
  const femaleExceptions = ['ALICE', 'BEATRIZ', 'RAQUEL', 'ESTER', 'RUTE', 'IRIS'];
  if (femaleExceptions.includes(firstWord)) return 'F';
  return lastChar === 'A' ? 'F' : 'M';
};

const T1_COLORS = ['azul', 'amarelo', 'laranja', 'marrom'];
const T2_COLORS = ['vermelho', 'lilas', 'verde', 'roxo'];

const COLOR_LABELS: Record<string, string> = {
  azul: 'Azul', amarelo: 'Amarelo', laranja: 'Laranja', marrom: 'Marrom',
  vermelho: 'Vermelho', lilas: 'Lilás', verde: 'Verde', roxo: 'Roxo'
};

const SOLID_COLOR_STYLES: Record<string, string> = {
  amarelo: 'bg-yellow-500 text-white',
  azul: 'bg-blue-700 text-white',
  laranja: 'bg-orange-500 text-white',
  marrom: 'bg-amber-800 text-white',
  vermelho: 'bg-red-500 text-white',
  lilas: 'bg-violet-600 text-white',
  verde: 'bg-green-600 text-white',
  roxo: 'bg-purple-600 text-white',
};

const TEAM_IDENTITY_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  amarelo: { bg: 'bg-yellow-50/50', border: 'border-yellow-500', text: 'text-yellow-700' },
  azul: { bg: 'bg-blue-50/50', border: 'border-blue-600', text: 'text-blue-700' },
  laranja: { bg: 'bg-orange-50/50', border: 'border-orange-500', text: 'text-orange-700' },
  marrom: { bg: 'bg-amber-50/50', border: 'border-amber-800', text: 'text-amber-900' },
  lilas: { bg: 'bg-violet-50/50', border: 'border-violet-500', text: 'text-violet-700' },
  verde: { bg: 'bg-green-50/50', border: 'border-green-600', text: 'text-green-700' },
  vermelho: { bg: 'bg-red-50/50', border: 'border-red-600', text: 'text-red-700' },
  roxo: { bg: 'bg-purple-50/50', border: 'border-purple-600', text: 'text-purple-700' },
};

interface Props {
  settings: MatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<MatchSettings>>;
  onStartMatch: () => void;
  gameState: GameState | null;
  onOpenPartners?: () => void;
  partners: Partner[];
  onAutoRegisterPartner?: (pin: string, field: string) => Promise<string | null>;
  cloudLiveExists?: boolean;
  userProfile?: UserProfile;
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  // Alterado para () => void pois é usado para navegação e o App.tsx fornece () => void
  onJoinTournament: () => void;
  onExitTournament: () => void;
}

export const TeamSection = forwardRef<{ triggerStart: () => void }, Props>(({ settings, setSettings, onStartMatch, gameState, onOpenPartners, partners, onAutoRegisterPartner, cloudLiveExists, userProfile, activeEvent, userEntryDate, onJoinTournament, onExitTournament }, ref) => {
  const [genders, setGenders] = useState<Record<string, Gender>>({
    p1: 'M', p1Partner: 'M', p2: 'M', p2Partner: 'M'
  });
  const [isShuffling, setIsShuffling] = useState(false);
  const [dbSportsIcons, setDbSportsIcons] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const fetchIcons = async () => {
      const db = getDb();
      if (!db) return;
      const snap = await getDocs(collection(db, "sport_icons"));
      const icons: Record<string, string> = {};
      snap.forEach(d => { icons[d.id] = d.data().url; });
      setDbSportsIcons(icons);
    };
    fetchIcons();
  }, []);

  const canStart = useMemo(() => {
    const hasP1 = settings.p1Name.trim().length > 0;
    const hasP2 = settings.p2Name.trim().length > 0;
    if (!settings.isDoubles) return hasP1 && hasP2;
    const hasP1Partner = (settings.p1Partner || '').trim().length > 0;
    const hasP2Partner = (settings.p2Partner || '').trim().length > 0;
    return hasP1 && hasP1Partner && hasP2 && hasP2Partner;
  }, [settings.p1Name, settings.p1Partner, settings.p2Name, settings.p2Partner, settings.isDoubles]);

  const sportInfo = useMemo(() => {
    const sport = SPORT_LIST.find(s => s.id === settings.sportType);
    const admIcon = dbSportsIcons[settings.sportType] || settings.cloudSportIcons?.[settings.sportType] || settings.customSportIcons?.[settings.sportType];
    return {
      name: sport?.name || 'Partida',
      icon: admIcon || sport?.defaultIcon || '🎾'
    };
  }, [settings.sportType, settings.cloudSportIcons, settings.customSportIcons, dbSportsIcons]);

  const canShowMixed = useMemo(() => {
    if (!settings.isDoubles) return false;
    const gendersValues = [genders.p1, genders.p1Partner, genders.p2, genders.p2Partner];
    const males = gendersValues.filter(v => v === 'M').length;
    const females = gendersValues.filter(v => v === 'F').length;
    return males === 2 && females === 2;
  }, [settings.isDoubles, genders]);

  useImperativeHandle(ref, () => ({
    triggerStart: () => {
      if (canStart) onStartMatch();
    }
  }));

  const toggleGender = (key: string) => {
    setGenders(prev => ({ ...prev, [key]: prev[key] === 'M' ? 'F' : 'M' }));
  };

  const handleNameChange = (key: keyof MatchSettings, value: string) => {
    let finalValue = value;
    let isVerified = false;
    if (value.trim().toLowerCase() === 'eu' && userProfile?.nickname) {
        finalValue = userProfile.nickname;
        isVerified = true;
    }
    const formatted = formatPortugueseName(finalValue);
    const fieldPrefix = key.replace('Name', '');
    const verifiedKey = `${fieldPrefix}Verified` as keyof MatchSettings;
    
    const guessed = guessGender(formatted);
    if (guessed) {
      setGenders(prev => ({ ...prev, [fieldPrefix]: guessed }));
    }

    setSettings(prev => ({ ...prev, [key]: formatted, [verifiedKey]: isVerified }));
  };

  const handleComplexVoice = async (targetField: keyof MatchSettings, name1: string, name2: string) => {
    const fieldPrefix = targetField.replace('Name', '');
    const verifiedKey = `${fieldPrefix}Verified` as keyof MatchSettings;
    
    if (name2 && name2.length === 5 && !name2.includes(' ') && onAutoRegisterPartner) {
        const dbNickname = await onAutoRegisterPartner(name2, fieldPrefix);
        const finalName = dbNickname || name1 || name2; 
        const guessed = guessGender(finalName);
        if (guessed) setGenders(prev => ({ ...prev, [fieldPrefix]: guessed }));
        setSettings(prev => ({ ...prev, [targetField]: finalName, [verifiedKey]: !!dbNickname }));
        return;
    }

    let f1 = name1;
    let f2 = name2;
    let v1 = false;
    let v2 = false;

    if (f1.trim().toLowerCase() === 'eu' && userProfile?.nickname) { f1 = userProfile.nickname; v1 = true; }
    if (f2.trim().toLowerCase() === 'eu' && userProfile?.nickname) { f2 = userProfile.nickname; v2 = true; }

    const nf1 = formatPortugueseName(f1);
    const nf2 = formatPortugueseName(f2);

    const team = targetField.startsWith('p1') ? 1 : 2;
    if (team === 1) {
      if (nf1) {
        const g1 = guessGender(nf1);
        if (g1) setGenders(p => ({ ...p, p1: g1 }));
      }
      if (nf2) {
        const g2 = guessGender(nf2);
        if (g2) setGenders(p => ({ ...p, p1Partner: g2 }));
      }
      setSettings(prev => {
        if (nf1 && nf2) return { ...prev, p1Name: nf1, p1Partner: nf2, isDoubles: true, p1Verified: v1, p1PartnerVerified: v2 };
        return { ...prev, p1Name: nf1, p1Verified: v1 };
      });
    } else {
      if (nf1) {
        const g1 = guessGender(nf1);
        if (g1) setGenders(p => ({ ...p, p2: g1 }));
      }
      if (nf2) {
        const g2 = guessGender(nf2);
        if (g2) setGenders(p => ({ ...p, p2Partner: g2 }));
      }
      setSettings(prev => {
        if (nf1 && nf2) return { ...prev, p2Name: nf1, p2Partner: nf2, isDoubles: true, p2Verified: v1, p2PartnerVerified: v2 };
        return { ...prev, p2Name: nf1, p2Verified: v1 };
      });
    }
  };

  const handleT1ColorChange = (color: string) => {
    const index = T1_COLORS.indexOf(color);
    if (index !== -1) { setSettings(prev => ({ ...prev, p1Color: color, p2Color: T2_COLORS[index] })); }
  };

  const swapPlayersInTeam = (team: 1 | 2) => {
    setSettings(prev => {
      if (team === 1) {
        return { ...prev, p1Name: prev.p1Partner || '', p1Partner: prev.p1Name, p1Verified: prev.p1PartnerVerified, p1PartnerVerified: prev.p1Verified };
      } else {
        return { ...prev, p2Name: prev.p2Partner || '', p2Partner: prev.p2Name, p2Verified: prev.p2PartnerVerified, p2PartnerVerified: prev.p2Verified };
      }
    });
    setGenders(prev => {
      if (team === 1) return { ...prev, p1: prev.p1Partner, p1Partner: prev.p1 };
      return { ...prev, p2: prev.p2Partner, p2Partner: prev.p2 };
    });
  };

  const handleSwapTeams = () => {
    setSettings(prev => ({
      ...prev,
      p1Name: prev.p2Name, p1Partner: prev.p2Partner,
      p2Name: prev.p1Name, p2Partner: prev.p1Partner,
      p1Verified: prev.p2Verified, p1PartnerVerified: prev.p2PartnerVerified,
      p2Verified: prev.p1Verified, p2PartnerVerified: prev.p1PartnerVerified
    }));
    setGenders(prev => ({
      p1: prev.p2, p1Partner: prev.p2Partner,
      p2: prev.p1, p2Partner: prev.p1Partner
    }));
  };

  const randomizeServerOrder = async () => {
    if (isShuffling) return;
    setIsShuffling(true);
    if (settings.isDoubles) {
      for (let i = 0; i < 5; i++) { if (Math.random() > 0.5) swapPlayersInTeam(1); await new Promise(r => setTimeout(r, 90)); }
      for (let i = 0; i < 5; i++) { if (Math.random() > 0.5) swapPlayersInTeam(2); await new Promise(r => setTimeout(r, 90)); }
    } else {
      for (let i = 0; i < 5; i++) { handleSwapTeams(); await new Promise(r => setTimeout(r, 90)); }
    }
    setSettings(prev => ({ ...prev, initialServer: 1 }));
    setIsShuffling(false);
  };

  const randomizeFormation = () => {
    runMultiShuffle(() => {
      if (settings.isDoubles) {
        const all = [
          { n: settings.p1Name, g: genders.p1, v: settings.p1Verified },
          { n: settings.p1Partner || '', g: genders.p1Partner, v: settings.p1PartnerVerified },
          { n: settings.p2Name, g: genders.p2, v: settings.p2Verified },
          { n: settings.p2Partner || '', g: genders.p2Partner, v: settings.p2PartnerVerified }
        ].sort(() => Math.random() - 0.5);

        setSettings(prev => ({
          ...prev,
          p1Name: all[0].n, p1Partner: all[1].n,
          p2Name: all[2].n, p2Partner: all[3].n,
          p1Verified: all[0].v, p1PartnerVerified: all[1].v,
          p2Verified: all[2].v, p2PartnerVerified: all[3].v
        }));

        setGenders({
          p1: all[0].g,
          p1Partner: all[1].g,
          p2: all[2].g,
          p2Partner: all[3].g
        });
      }
    });
  };

  const randomizeMixed = () => {
    runMultiShuffle(() => {
      const all = [
        { n: settings.p1Name, g: genders.p1, v: settings.p1Verified },
        { n: settings.p1Partner || '', g: genders.p1Partner, v: settings.p1PartnerVerified },
        { n: settings.p2Name, g: genders.p2, v: settings.p2Verified },
        { n: settings.p2Partner || '', g: genders.p2Partner, v: settings.p2PartnerVerified }
      ];
      const m = all.filter(p => p.g === 'M').sort(() => Math.random() - 0.5);
      const f = all.filter(p => p.g === 'F').sort(() => Math.random() - 0.5);
      
      if (m.length === 2 && f.length === 2) {
        const res = [
          { n: m[0].n, g: m[0].g, v: m[0].v },
          { n: f[0].n, g: f[0].g, v: f[0].v },
          { n: m[1].n, g: m[1].g, v: m[1].v },
          { n: f[1].n, g: f[1].g, v: f[1].v }
        ];

        setSettings(prev => ({
          ...prev,
          p1Name: res[0].n, p1Partner: res[1].n,
          p2Name: res[2].n, p2Partner: res[3].n,
          p1Verified: res[0].v, p1PartnerVerified: res[1].v,
          p2Verified: res[2].v, p2PartnerVerified: res[3].v
        }));

        setGenders({
          p1: res[0].g,
          p1Partner: res[1].g,
          p2: res[2].g,
          p2Partner: res[3].g
        });
      }
    });
  };

  const runMultiShuffle = async (shuffleLogic: () => void, steps = 5) => {
    if (isShuffling) return;
    setIsShuffling(true);
    for (let i = 0; i < steps; i++) {
      shuffleLogic();
      await new Promise(r => setTimeout(r, 90));
    }
    setIsShuffling(false);
  };

  const handleClearNames = () => {
    setSettings(prev => ({
      ...prev,
      p1Name: '', p1Partner: '', p2Name: '', p2Partner: '',
      p1Verified: false, p1PartnerVerified: false, p2Verified: false, p2PartnerVerified: false
    }));
  };

  const handleToggleHistory = (val: boolean) => {
    setSettings(prev => {
      const next = { ...prev, isHistoryEnabled: val };
      if (!val) {
        next.p1Name = "Jogador 1";
        next.p2Name = "Jogador 2";
        next.p1Verified = false;
        next.p2Verified = false;
        if (prev.isDoubles) {
          next.p1Partner = "Jogador 3";
          next.p2Partner = "Jogador 4";
          next.p1PartnerVerified = false;
          next.p2PartnerVerified = false;
        } else {
          next.p1Partner = "";
          next.p2Partner = "";
          next.p1PartnerVerified = false;
          next.p2PartnerVerified = false;
        }
      }
      return next;
    });
  };

  const renderPlayerInput = (label: string, field: keyof MatchSettings, genderKey: string) => {
    const currentName = settings[field] as string;
    const verifiedKey = `${field.replace('Name', '')}Verified` as keyof MatchSettings;
    const isKnownPartner = !!settings[verifiedKey]; 
    const teamColor = field.startsWith('p1') ? settings.p1Color : settings.p2Color;
    const colorStyles = TEAM_IDENTITY_STYLES[teamColor] || TEAM_IDENTITY_STYLES.azul;

    return (
      <div className={`flex gap-2 items-end transition-all duration-300 ${isShuffling ? 'opacity-50 scale-[0.97]' : 'opacity-100'}`}>
        <div className="flex-1">
          <Input 
            label={label} 
            enableVoice={true} 
            enableCamera={true} 
            partnerTerms={settings.voiceCommands.partnerTerm} 
            value={currentName} 
            onChange={e => handleNameChange(field, e.target.value)} 
            onVoiceComplexResult={(n1, n2) => handleComplexVoice(field, n1, n2)} 
            className={`h-[44px] text-base font-bold rounded-2xl shadow-none transition-all duration-700 ${
              isKnownPartner 
              ? `${colorStyles.bg} ${colorStyles.border} ${colorStyles.text} border-2 animate-in fade-in` 
              : 'bg-white border-gray-100 text-black'
            }`} 
            rightAction={isKnownPartner ? ( 
              <div className="p-1 mr-1 animate-in zoom-in duration-500 flex items-center justify-center relative">
                <Users size={20} className="text-[#40E0D0]" />
                <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 text-white rounded-full p-0.5 border border-white shadow-sm flex items-center justify-center">
                  <Check size={8} strokeWidth={4} />
                </div>
              </div> 
            ) : (!currentName ? ( 
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenPartners?.(); }} className="p-1 mr-1 text-[#40E0D0] hover:opacity-80 transition-colors active:scale-90">
                <Users size={20} />
              </button> 
            ) : null)} 
          />
        </div>
        <button onClick={() => toggleGender(genderKey)} className={`w-[42px] h-[44px] rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${genders[genderKey] === 'M' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-pink-50 text-pink-600 border-pink-100'}`} > {genders[genderKey] === 'M' ? <MarsIcon /> : <VenusIcon />} </button>
      </div>
    );
  };

  const t1Styles = TEAM_IDENTITY_STYLES[settings.p1Color] || TEAM_IDENTITY_STYLES.azul;
  const t2Styles = TEAM_IDENTITY_STYLES[settings.p2Color] || TEAM_IDENTITY_STYLES.vermelho;

  return (
    <div className="flex flex-col gap-2 animate-in fade-in duration-300 pb-16">
      <div className="flex gap-2 mb-4">
        <button 
          onClick={handleClearNames}
          className="flex-1 py-4 bg-white border-2 border-red-500 rounded-full flex items-center justify-center gap-3 font-black text-red-500 text-xs active:scale-95 transition-all shadow-md"
        >
          <Eraser size={18} /> Limpar nomes
        </button>
        <button 
          onClick={() => handleToggleHistory(!settings.isHistoryEnabled)}
          className={`flex-1 py-4 bg-white border-2 rounded-full flex items-center justify-center gap-3 font-black text-xs active:scale-95 transition-all shadow-md ${settings.isHistoryEnabled ? 'border-blue-600 text-blue-600' : 'border-gray-200 text-gray-400'}`}
        >
          <div className="relative flex items-center justify-center">
            <History size={18} className="text-blue-600" />
            {!settings.isHistoryEnabled && (
              <div className="absolute w-[140%] h-[2.5px] bg-red-600 rotate-[-45deg] rounded-full shadow-sm" />
            )}
          </div>
          Gravar histórico
        </button>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 px-1 mt-2">
          <h2 className="text-base font-black text-slate-800 tracking-tight">Times / jogadores</h2>
          <div className="flex gap-1">
            <button onClick={() => setSettings(p => ({...p, isDoubles: false}))} className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-[1.5rem] text-sm font-black transition-all shadow-sm border-2 ${ !settings.isDoubles ? 'bg-white text-[#4B0082] border-[#4B0082] ring-2 ring-[#4B0082]/20' : 'bg-gray-100 text-slate-500 border-gray-200' }`} > <User size={18} className={!settings.isDoubles ? 'text-[#4B0082]' : ''} /> Simples </button>
            <button onClick={() => setSettings(p => ({...p, isDoubles: true}))} className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-[1.5rem] text-sm font-black transition-all shadow-sm border-2 ${ settings.isDoubles ? 'bg-white text-[#40E0D0] border-[#40E0D0] ring-2 ring-[#40E0D0]/20' : 'bg-gray-100 text-slate-500 border-gray-200' }`} > <Users size={18} className={settings.isDoubles ? 'text-[#40E0D0]' : ''} /> Duplas </button>
          </div>
          
          <div className={`grid ${settings.isDoubles ? 'grid-cols-2' : 'grid-cols-1'} gap-1 mt-4`}>
            <button onClick={randomizeServerOrder} className="bg-sky-500 text-white py-4 px-2 rounded-[1.5rem] shadow-md active:scale-95 transition-all overflow-hidden" > {isShuffling ? ( <div className="flex items-center justify-center"><Loader2 size={16} className="animate-spin" /></div> ) : ( <div className="flex items-center justify-center gap-1.5"> <Dices size={16} className="shrink-0 text-yellow-400" /> <span className="text-[10px] font-black leading-tight text-center">Sortear ordem sacadores</span> <RaquetIcon size={16} className="shrink-0" /> </div> )} </button>
            {settings.isDoubles && ( <button onClick={randomizeFormation} className="bg-sky-500 text-white py-4 px-2 rounded-[1.5rem] shadow-md active:scale-95 transition-all overflow-hidden" > {isShuffling ? ( <div className="flex items-center justify-center"><Loader2 size={16} className="animate-spin" /></div> ) : ( <div className="flex items-center justify-center gap-1.5"> <Dices size={16} className="shrink-0 text-yellow-400" /> <span className="text-[10px] font-black leading-tight text-center">Sortear formação</span> <Users size={16} className="shrink-0 text-[#40E0D0]" /> </div> )} </button> )}
          </div>
          {settings.isDoubles && canShowMixed && (
            <div className="grid grid-cols-1 gap-1 mt-1 animate-in slide-in-from-top-2">
              <button onClick={randomizeMixed} className="bg-sky-500 text-white py-4 px-2 rounded-[1.5rem] shadow-md active:scale-95 transition-all" > {isShuffling ? ( <div className="flex items-center justify-center"><Loader2 size={16} className="animate-spin" /></div> ) : ( <div className="flex items-center justify-center gap-1.5"> <Dices size={16} className="shrink-0 text-yellow-400" /> <span className="text-[10px] font-black leading-tight text-center">Sortear misto</span> <div className="flex items-center gap-0.5 shrink-0"> <span className="text-sky-300"><MarsIcon size={14} /></span> <span className="text-pink-300"><VenusIcon size={14} /></span> </div> </div> )} </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-0 relative mt-2">
          <div className={`p-3 rounded-[2.5rem] border-2 shadow-sm space-y-4 transition-colors duration-500 ${t1Styles.bg} ${t1Styles.border.replace('border-', 'border-')}/20`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-gray-400 tracking-wider">Time 1</span></div>
              <div className="flex gap-2">
                {settings.isDoubles && ( <button onClick={() => swapPlayersInTeam(1)} className={`px-4 py-2 rounded-2xl flex items-center justify-center active:scale-90 transition-all shadow-lg border-2 border-white/20 ${SOLID_COLOR_STYLES[settings.p1Color]}`}> <ArrowUpDown size={16} /> </button> )}
                <div className="relative">
                  <select value={settings.p1Color} onChange={(e) => handleT1ColorChange(e.target.value)} className={`appearance-none flex items-center gap-2 px-6 py-2 rounded-2xl text-[12px] font-bold shadow-lg pr-10 border-2 border-white/20 ${SOLID_COLOR_STYLES[settings.p1Color]}`}>
                    {T1_COLORS.map(c => <option key={c} value={c} className="text-black bg-white">{COLOR_LABELS[c]}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white pointer-events-none opacity-60" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {renderPlayerInput("1º sacador *", "p1Name", "p1")}
              {settings.isDoubles && renderPlayerInput("3º sacador *", "p1Partner", "p1Partner")}
            </div>
          </div>
          <div className="flex justify-center my-1 relative z-20">
            <button onClick={handleSwapTeams} className="w-14 h-14 bg-white rounded-full border-2 border-gray-200 shadow-xl flex items-center justify-center text-blue-600 active:scale-90 transition-all" title="Inverter jogadores entre os times" > <ArrowUpDown size={28} /> </button>
          </div>
          <div className={`p-3 rounded-[2.5rem] border-2 shadow-sm space-y-4 transition-colors duration-500 ${t2Styles.bg} ${t2Styles.border.replace('border-', 'border-')}/20`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-gray-400 tracking-wider">Time 2</span></div>
              <div className="flex gap-2">
                {settings.isDoubles && ( <button onClick={() => swapPlayersInTeam(2)} className={`px-4 py-2 rounded-2xl flex items-center justify-center active:scale-90 transition-all shadow-lg border-2 border-white/20 ${SOLID_COLOR_STYLES[settings.p2Color]}`}> <ArrowUpDown size={16} /> </button> )}
                <div className={`flex items-center gap-2 px-6 py-2 rounded-2xl text-[12px] font-bold shadow-lg border-2 border-white/20 ${SOLID_COLOR_STYLES[settings.p2Color]}`}> {COLOR_LABELS[settings.p2Color]} </div>
              </div>
            </div>
            <div className="space-y-4">
              {renderPlayerInput("2º sacador *", "p2Name", "p2")}
              {settings.isDoubles && renderPlayerInput("4º sacador *", "p2Partner", "p2Partner")}
            </div>
          </div>
        </div>
      </section>

      <div className="pt-6 pb-6 px-1 flex flex-col gap-3">
        <Button 
          onClick={onStartMatch} 
          disabled={!canStart}
          className={`w-full text-center shadow-2xl py-6 rounded-[2.5rem] grid grid-cols-[auto_1fr] items-center font-bold px-10 transition-all ${
            canStart ? '!bg-sky-500 hover:!bg-sky-600' : '!bg-gray-300 opacity-60 cursor-not-allowed'
          }`}
        >
           <div className="flex items-center justify-center pl-4">
             <Play size={44} fill="white" className="text-white" />
           </div>
           <div className="flex flex-col items-center justify-center">
             <span className="text-xl opacity-90 leading-none mb-1">Iniciar partida:</span>
             <div className="flex items-center justify-center gap-2 text-2xl">
               <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
                 {sportInfo.icon.startsWith('http') || sportInfo.icon.startsWith('data') ? (
                   <img src={sportInfo.icon} className="w-full h-full object-cover rounded-md" alt="" />
                 ) : ( <span className="text-3xl">{sportInfo.icon}</span> )}
               </div>
               <span className="tracking-tight font-black">{sportInfo.name}</span>
             </div>
           </div>
        </Button>

        <Button variant="secondary" onClick={onOpenPartners} className="w-full py-5 rounded-[2.5rem] border-2 border-blue-100 text-blue-600 font-black flex gap-2 active:scale-95 transition-all bg-blue-50/30" > <Users size={20} className="text-[#40E0D0]" /> Meus parceiros </Button>
        {/* Adicionado wrapper () => para onClick evitar passagem de evento MouseEvent para função que não espera argumentos */}
        <Button variant="secondary" onClick={() => onJoinTournament()} className="w-full py-5 rounded-[2.5rem] border-2 border-amber-100 text-amber-600 font-black flex gap-2 active:scale-95 transition-all bg-amber-50/30" > <Ticket size={20} /> Meus torneios </Button>
      </div>
    </div>
  );
});
