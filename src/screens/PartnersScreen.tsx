
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, Search, Camera, Trash2, Star, QrCode, ArrowLeft, CheckCircle2, Loader2, Database, Smartphone, UserPlus, Cloud, Hash, User, ShieldCheck, Plus, Play, Info, CloudDownload, CloudUpload, RotateCw, RefreshCw, ChevronRight, X, Keyboard, Share2, Copy, Antenna, Wifi, Dices, UserCheck, ArrowRightLeft, UserX, History, Check, CheckSquare, Eraser, Mic, Clock, Trophy } from 'lucide-react';
import { Partner, UserProfile, GameState, MatchSettings, QueuePlayer, TournamentEvent, TournamentEntry } from '../types'; 
import { Input } from '../components/Input'; 
import { getDb } from '../firebase'; 
import { collection, query, where, getDocs, doc, setDoc, getDoc, onSnapshot, Firestore } from 'firebase/firestore'; 
import { LiveIndicator } from '../components/LiveIndicator'; 
import { formatPortugueseName } from '../utils/formatters'; 
import { Toggle } from '../components/Toggle'; 
import { ScoreboardIcon } from '../components/ScoreboardIcon'; 

interface Props {
  partners: Partner[];
  setPartners: React.Dispatch<React.SetStateAction<Partner[]>>;
  playerQueue: QueuePlayer[];
  setPlayerQueue: React.Dispatch<React.SetStateAction<QueuePlayer[]>>;
  onBack: () => void;
  onConfirmSelection: (team1: Partner[], team2: Partner[]) => void;
  isDoubles: boolean;
  onUpdateSettings?: (settings: Partial<MatchSettings>) => void;
  userProfile: UserProfile;
  p1Color: string;
  p2Color: string;
  onWatchLive: (pin: string) => void;
  onDeletePartners?: (ids: Set<string>) => void;
  matchSettings: MatchSettings;
  activeEvent: TournamentEvent | null;
  appUrl: string;
}

const SOLID_COLORS_BG: Record<string, string> = {
  amarelo: 'bg-yellow-500', 
  azul: 'bg-blue-600', 
  laranja: 'bg-orange-500', 
  marrom: 'bg-amber-800',
  lilas: 'bg-violet-500', 
  verde: 'bg-green-600', 
  vermelho: 'bg-red-600', 
  roxo: 'bg-purple-600',
};

const BORDER_COLORS: Record<string, string> = {
  amarelo: 'border-yellow-500', azul: 'border-blue-600', laranja: 'border-orange-500', marrom: 'border-amber-800',
  lilas: 'border-violet-500', verde: 'border-green-600', vermelho: 'border-red-600', roxo: 'border-purple-600',
};

const LIGHT_BG_COLORS: Record<string, string> = {
  amarelo: 'bg-yellow-50', azul: 'bg-blue-50', laranja: 'bg-orange-50', marrom: 'bg-amber-50',
  lilas: 'bg-violet-50', verde: 'bg-green-50', vermelho: 'bg-red-50', roxo: 'bg-purple-50',
};

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

export const PartnersScreen: React.FC<Props> = ({ partners, setPartners, playerQueue, setPlayerQueue, onBack: onBackProp, onConfirmSelection, isDoubles, onUpdateSettings, userProfile, p1Color, p2Color, onWatchLive, onDeletePartners, matchSettings, activeEvent, appUrl }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'queue'>('list');
  const [isShuffling, setIsShuffling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [lookupName, setLookupName] = useState('');
  const [lookupFullName, setLookupFullName] = useState('');
  const [isSearchingPin, setIsSearchingPin] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cloudCount, setCloudCount] = useState(0);
  const [referralCount, setReferralCount] = useState(0);
  const [activeLives, setActiveLives] = useState<GameState[]>([]);
  const [navigationSource, setNavigationSource] = useState<'settings' | 'queue'>('settings');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  const [pendingQueueIndex, setPendingQueueIndex] = useState<number | null>(null);

  const [selections, setSelections] = useState<Record<string, 1 | 2>>(() => {
    const initial: Record<string, 1 | 2> = {};
    const allKnown = [
        { name: matchSettings.p1Name, team: 1 as const },
        { name: matchSettings.p1Partner, team: 1 as const },
        { name: matchSettings.p2Name, team: 2 as const },
        { name: matchSettings.p2Partner, team: 2 as const }
    ];
    const availablePartners = [...partners, { id: 'me', name: userProfile.name, nickname: userProfile.nickname || userProfile.name.split(' ')[0], pin: userProfile.pin, origin: 'manual', addedAt: 0 }];
    allKnown.forEach(slot => {
        if (slot.name) {
            const found = availablePartners.find(p => p.nickname === slot.name);
            if (found) initial[found.id] = slot.team;
        }
    });
    return initial;
  });

  const scannerInputRef = useRef<any>(null);
  const partnerPins = useMemo(() => new Set(partners.map(p => p.pin.toUpperCase())), [partners]);
  const displayedLives = useMemo(() => activeLives.filter(live => live.ownerPin && partnerPins.has(live.ownerPin.toUpperCase())), [activeLives, partnerPins]);
  const isAlreadyRegistered = useMemo(() => partners.some(p => p.pin.toUpperCase() === pinInput.toUpperCase().trim()), [partners, pinInput]);
  const maxPerTeam = isDoubles ? 2 : 1;
  const meAsPartner: Partner = useMemo(() => ({ id: 'me', name: userProfile.name, nickname: userProfile.nickname || userProfile.name.split(' ')[0] || 'Eu', pin: userProfile.pin, origin: 'manual', addedAt: 0, gender: userProfile.gender || 'M' }), [userProfile]);
  const shareLink = useMemo(() => {
    const appBaseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
    return `${appBaseUrl}/?ref=${encodeURIComponent(userProfile.nickname || userProfile.name.split(' ')[0] || 'Eu')}&pin_ref=${userProfile.pin.toUpperCase()}`;
  }, [userProfile, appUrl]);
  const qrCodeShareUrl = useMemo(() => `https://quickchart.io/qr?text=${encodeURIComponent(shareLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`, [shareLink]);

  const selectedInQueue = useMemo(() => playerQueue.filter(p => p.isSelected), [playerQueue]);
  const isSelectionMode = useMemo(() => Object.keys(selections).length > 0 || (activeTab === 'queue' && selectedInQueue.length > 0), [selections, activeTab, selectedInQueue]);

  const availableSlotsOnCourt = useMemo(() => {
    const totalSlots = isDoubles ? 4 : 2;
    const takenCount = [matchSettings.p1Name, matchSettings.p1Partner, matchSettings.p2Name, matchSettings.p2Partner].filter(n => !!n && n.trim() !== "").length;
    return totalSlots - takenCount;
  }, [isDoubles, matchSettings.p1Name, matchSettings.p1Partner, matchSettings.p2Name, matchSettings.p2Partner]);

  const canShowCourtFree = selectedInQueue.length > 0 && availableSlotsOnCourt > 0;

  useEffect(() => {
    syncAllData(true);
    const db = getDb();
    if (db) {
      const q = query(collection(db, "live_matches"), where("isLiveClosed", "==", false));
      const unsubscribe = onSnapshot(q, (snap) => {
        const lives: GameState[] = [];
        snap.forEach(d => lives.push(d.data() as GameState));
        setActiveLives(lives);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    const fetchNick = async () => {
      const cleanPin = pinInput.toUpperCase().trim();
      if (cleanPin.length === 5) {
        if (cleanPin === userProfile.pin.toUpperCase()) { 
          setLookupName(`${meAsPartner.nickname} (você)`); 
          setLookupFullName(meAsPartner.name || '');
          return; 
        }
        setIsSearchingPin(true);
        const db = getDb();
        if (!db) return;
        try {
          const q = query(collection(db as any, "users"), where("pin", "==", cleanPin));
          const snap = await getDocs(q);
          if (!snap.empty) { 
            const data = snap.docs[0].data();
            setLookupName(data.nickname || data.name.split(' ')[0]); 
            setLookupFullName(data.name || '');
          } else { 
            setLookupName('Pin não localizado'); 
            setLookupFullName('');
          }
        } catch (e) { setLookupName('Erro na busca'); } finally { setIsSearchingPin(false); }
      } else { setLookupName(''); setLookupFullName(''); }
    };
    fetchNick();
  }, [pinInput, userProfile.pin, meAsPartner.nickname, meAsPartner.name]);

  const handleShareWhatsApp = () => {
    const text = `Participe comigo no my placar. Clique no link para se cadastrar e me adicionar como parceiro: ${shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const handleCopyShareLink = () => navigator.clipboard.writeText(shareLink).then(() => (window as any).alert("Link de indicação copiado com sucesso!"));

  const refreshAllNicknames = async () => {
    if (isRefreshing || partners.length === 0) return;
    setIsRefreshing(true);
    const db = getDb();
    if (!db) { setIsRefreshing(false); return; }
    try {
      const updatedPartners = [...partners];
      let changed = false;
      for (let i = 0; i < updatedPartners.length; i++) {
        const p = updatedPartners[i];
        const q = query(collection(db as any, "users"), where("pin", "==", p.pin.toUpperCase().trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userData = snap.docs[0].data();
          const newNick = userData.nickname || userData.name.split(' ')[0];
          const newName = userData.name;
          if (newNick !== p.nickname || newName !== p.name) { 
            updatedPartners[i] = { ...p, nickname: newNick, name: newName }; 
            changed = true; 
          }
        }
      }
      if (changed) { setPartners(updatedPartners); (window as any).alert("Apelidos e nomes atualizados com sucesso!"); } else { (window as any).alert("Todos os dados já estão atualizados."); }
    } catch (e) { console.error(e); } finally { setIsRefreshing(false); }
  };

  const handleToggleSelect = (id: string) => {
    if (pendingQueueIndex !== null) {
      const allPartners = [meAsPartner, ...partners];
      const partner = allPartners.find(p => p.id === id);
      if (partner) {
        const next = [...playerQueue];
        next[pendingQueueIndex] = { 
          ...next[pendingQueueIndex], 
          name: partner.nickname, 
          verified: true,
          gender: partner.gender || next[pendingQueueIndex].gender 
        };
        setPlayerQueue(next);
        setPendingQueueIndex(null);
        setNavigationSource('settings');
        setActiveTab('queue');
      }
      return;
    }

    setSelections(prev => {
      const current = prev[id];
      const next = { ...prev };
      const countT1 = Object.values(prev).filter(v => v === 1).length;
      const countT2 = Object.values(prev).filter(v => v === 2).length;
      if (!current) { if (countT1 < maxPerTeam) next[id] = 1; else if (countT2 < maxPerTeam) next[id] = 2; else return prev; }
      else if (current === 1) { if (countT2 < maxPerTeam) next[id] = 2; else delete next[id]; }
      else delete next[id];
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelections({});
    if (activeTab === 'queue') setPlayerQueue(prev => prev.map(p => ({ ...p, isSelected: false })));
  };

  const handleDeleteSelected = () => {
    const ids = new Set(Object.keys(selections));
    if (activeTab === 'queue') selectedInQueue.forEach(p => ids.add(p.id));
    if (onDeletePartners) { onDeletePartners(ids); handleClearSelection(); }
  };

  const syncAllData = async (silent = false) => {
    const db = getDb();
    if (!db || !userProfile.email) return;
    if (!silent) setIsDownloading(true);
    try {
      const docRef = doc(db, "user_partners_metadata", userProfile.email.toLowerCase().trim());
      const snap = await getDoc(docRef);
      let cloudList: Partner[] = snap.exists() ? (snap.data().partners_list || []) : [];
      
      // Validação de existência de parceiros na coleção users para evitar "fantasmas"
      const verifiedList: Partner[] = [];
      let ghostCount = 0;
      for (const p of cloudList) {
        if (p.pin) {
          const q = query(collection(db as Firestore, "users"), where("pin", "==", p.pin.toUpperCase().trim()));
          const s = await getDocs(q);
          if (!s.empty) {
            verifiedList.push(p);
          } else {
            ghostCount++;
          }
        } else {
          verifiedList.push(p);
        }
      }
      
      // Atualizar metadado se fantasmas foram encontrados
      if (ghostCount > 0) {
         await setDoc(doc(db, "user_partners_metadata", userProfile.email.toLowerCase().trim()), { partners_list: verifiedList, updatedAt: Date.now() }, { merge: true });
      }
      
      cloudList = verifiedList;
      setCloudCount(cloudList.length);

      let referralList: Partner[] = [];
      if (userProfile.pin) {
        const q = query(collection(db, "users"), where("referredByPin", "==", userProfile.pin.toUpperCase()));
        const rSnap = await getDocs(q);
        setReferralCount(rSnap.size);
        rSnap.forEach(d => {
          const ud = d.data();
          referralList.push({ id: d.id, name: ud.name, nickname: ud.nickname || ud.name.split(' ')[0], pin: ud.pin.toUpperCase(), origin: 'referral', addedAt: Date.now(), gender: ud.gender });
        });
      }
      setPartners(prev => {
        const pinMap = new Map<string, Partner>();
        const myPin = userProfile.pin.toUpperCase();
        prev.forEach(p => { if (p.pin.toUpperCase() !== myPin) pinMap.set(p.pin.toUpperCase(), p); });
        cloudList.forEach(p => { if (p.pin.toUpperCase() !== myPin) pinMap.set(p.pin.toUpperCase(), p); });
        referralList.forEach(p => { if (p.pin.toUpperCase() !== myPin) pinMap.set(p.pin.toUpperCase(), p); });
        return Array.from(pinMap.values()).sort((a,b) => b.addedAt - a.addedAt);
      });
      if (!silent) (window as any).alert("Dados sincronizados!");
    } catch (e) {} finally { if (!silent) setIsDownloading(false); }
  };

  const uploadToCloud = async (silent = false) => {
    const db = getDb();
    if (!db || !userProfile.email || partners.length === 0) return;
    if (!silent) setIsUploading(true);
    try { await setDoc(doc(db, "user_partners_metadata", userProfile.email.toLowerCase().trim()), { partners_list: partners, updatedAt: Date.now() }, { merge: true }); if (!silent) (window as any).alert("Backup realizado!"); } catch (e) {} finally { if (!silent) setIsUploading(false); }
  };

  const handleAddPartner = (pin: string, nickname: string, origin: 'qrcode' | 'manual', gender?: 'M' | 'F', name?: string) => {
    const cleanPin = pin.toUpperCase().trim();
    if (!cleanPin || cleanPin === userProfile.pin.toUpperCase()) return;
    setPartners(prev => {
      const existingIdx = prev.findIndex(p => p.pin.toUpperCase() === cleanPin);
      if (existingIdx !== -1) { 
        const updated = [...prev]; 
        updated[existingIdx] = { ...updated[existingIdx], nickname: nickname || cleanPin, name: name || updated[existingIdx].name }; 
        return updated; 
      }
      return [{ id: `p_${Date.now()}`, name, nickname: nickname || cleanPin, pin: cleanPin, origin, addedAt: Date.now(), gender }, ...prev];
    });
    setPinInput(''); setLookupName(''); setLookupFullName('');
    if (origin === 'manual') (window as any).alert(`Parceiro ${nickname} adicionado à sua lista.`);
  };

  const handlePartnerGenderToggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'me') return;
    setPartners(prev => prev.map(p => p.id === id ? { ...p, gender: p.gender === 'M' ? 'F' : 'M' } : p));
  };

  const filteredPartners = useMemo(() => [meAsPartner, ...partners].filter(p => 
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.pin && p.pin.toUpperCase().includes(searchQuery.toUpperCase()))
  ), [partners, searchQuery, meAsPartner]);

  const confirmSelection = async () => {
    if (activeTab === 'list' && navigationSource === 'queue') { 
      setActiveTab('queue'); 
      setNavigationSource('settings'); 
      setPendingQueueIndex(null);
      return; 
    }
    
    if (activeTab === 'queue' && selectedInQueue.length > availableSlotsOnCourt) {
       (window as any).alert("Não há espaços suficientes na quadra para os jogadores selecionados.");
       return;
    }

    if (activeTab === 'queue') {
       const team1: Partner[] = [];
       const team2: Partner[] = [];
       const queueAsPartners = selectedInQueue.map(p => ({ 
         id: p.id, 
         name: p.name,
         nickname: p.name, 
         pin: p.verified ? 'VERIFIED' : '', 
         origin: 'manual' as const, 
         addedAt: Date.now(), 
         gender: p.gender 
       }));
       
       if (!isDoubles) {
          if (!matchSettings.p1Name && queueAsPartners[0]) team1.push(queueAsPartners[0]);
          if (!matchSettings.p2Name && queueAsPartners[team1.length ? 1 : 0]) team2.push(queueAsPartners[team1.length ? 1 : 0]);
       } else {
          const needed: string[] = [];
          if (!matchSettings.p1Name) needed.push('p1');
          if (!matchSettings.p1Partner) needed.push('p1P');
          if (!matchSettings.p2Name) needed.push('p2');
          if (!matchSettings.p2Partner) needed.push('p2P');
          
          queueAsPartners.forEach((p, idx) => {
             const slot = needed[idx];
             if (slot?.startsWith('p1')) team1.push(p);
             else if (slot?.startsWith('p2')) team2.push(p);
          });
       }

       onConfirmSelection(team1, team2);
       setPlayerQueue(prev => {
          const filtered = prev.filter(p => !p.isSelected);
          const diff = prev.length - filtered.length;
          const padding = Array.from({ length: diff }, (_, i) => ({ id: `q_${Date.now()}_pad_${i}`, name: '', gender: 'M' as const }));
          return [...filtered, ...padding];
       });
    } else {
       const list = [meAsPartner, ...partners];
       onConfirmSelection(list.filter(p => selections[p.id] === 1), list.filter(p => selections[p.id] === 2));
    }

    await uploadToCloud(true);
    handleClearSelection(); 
    onBackProp();
  };

  const handleQueueNameChange = (index: number, val: string) => {
    const next = [...playerQueue];
    const formatted = formatPortugueseName(val);
    const isManualChange = val !== next[index].name;
    const verified = isManualChange ? false : next[index].verified;

    next[index] = { 
      ...next[index], 
      name: formatted, 
      verified,
      gender: guessGender(formatted) || next[index].gender 
    };
    setPlayerQueue(next);
  };

  const guessGender = (name: string): 'M' | 'F' | undefined => {
    if (!name) return undefined;
    const firstWord = name.trim().split(' ')[0].toUpperCase();
    if (!firstWord || firstWord.length < 2) return undefined;
    const lastChar = firstWord.slice(-1);
    const femaleExceptions = ['ALICE', 'BEATRIZ', 'RAQUEL', 'ESTER', 'RUTE', 'IRIS'];
    if (femaleExceptions.includes(firstWord)) return 'F';
    return lastChar === 'A' ? 'F' : 'M';
  };

  const handleQueueGenderToggle = (index: number) => {
    const next = [...playerQueue];
    next[index] = { ...next[index], gender: next[index].gender === 'M' ? 'F' : 'M' };
    setPlayerQueue(next);
  };

  const handleQueueSelectionToggle = (index: number) => {
    const next = [...playerQueue];
    next[index] = { ...next[index], isSelected: !next[index].isSelected };
    setPlayerQueue(next);
  };

  const moveQueueItem = (from: number, to: number) => {
    if (to < 0 || to >= playerQueue.length) return;
    const next = [...playerQueue];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    setPlayerQueue(next);
  };

  const handleAddQueueLine = () => setPlayerQueue(prev => [...prev, { id: `q_${Date.now()}`, name: '', gender: 'M' }]);

  const handleSelectAllQueue = () => {
    setPlayerQueue(prev => {
      const named = prev.filter(p => p.name.trim() !== "");
      if (named.length === 0) return prev;
      const allSelected = named.every(p => p.isSelected);
      return prev.map(p => p.name.trim() !== "" ? { ...p, isSelected: !allSelected } : p);
    });
  };

  const handleShuffleFormation = async () => {
    const selectedIndices = playerQueue.map((p, i) => p.isSelected && p.name ? i : -1).filter(i => i !== -1);
    if (selectedIndices.length < 2) { (window as any).alert("Selecione pelo menos 2 jogadores com nome na fila."); return; }
    if (isShuffling) return;
    setIsShuffling(true);
    for (let i = 0; i < 6; i++) {
        setPlayerQueue(prev => {
            const next = [...prev];
            const shuffledValues = selectedIndices.map(i => ({...next[i]})).sort(() => Math.random() - 0.5);
            selectedIndices.forEach((idx, i) => next[idx] = shuffledValues[i]);
            return next;
        });
        await new Promise(r => setTimeout(r, 100));
    }
    setIsShuffling(false);
  };

  const handleShuffleMixed = async () => {
    const selected = playerQueue.filter(p => p.isSelected && p.name);
    const males = selected.filter(p => p.gender === 'M');
    const females = selected.filter(p => p.gender === 'F');
    if (selected.length !== 4 || males.length !== 2 || females.length !== 2) { (window as any).alert("Selecione exatamente 4 jogadores (2 homens e 2 mulheres) para o sorteio misto."); return; }
    if (isShuffling) return;
    setIsShuffling(true);
    const selectedIndices = playerQueue.map((p, i) => p.isSelected ? i : -1).filter(i => i !== -1);
    for (let i = 0; i < 6; i++) {
        setPlayerQueue(prev => {
            const next = [...prev];
            const m = [...males].sort(() => Math.random() - 0.5);
            const f = [...females].sort(() => Math.random() - 0.5);
            const pairs = [{...m[0]}, {...f[0]}, {...m[1]}, {...f[1]}].sort(() => Math.random() - 0.5);
            selectedIndices.forEach((idx, i) => next[idx] = pairs[i]);
            return next;
        });
        await new Promise(r => setTimeout(r, 100));
    }
    setIsShuffling(false);
  };

  const canShowMixedShuffle = useMemo(() => {
    const selectedWithNames = selectedInQueue.filter(p => p.name);
    if (selectedWithNames.length !== 4) return false;
    const males = selectedWithNames.filter(p => p.gender === 'M').length;
    const females = selectedWithNames.filter(p => p.gender === 'F').length;
    return males === 2 && females === 2;
  }, [selectedInQueue]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      {isSelectionMode ? (
        <header className="px-6 py-5 flex items-center justify-between bg-sky-600 text-white sticky top-0 z-50 shadow-lg animate-in slide-in-from-top">
          <div className="flex items-center gap-4">
            <button onClick={handleClearSelection} className="p-2 -ml-2 active:scale-90 transition-transform">
              <X size={24} />
            </button>
            <h1 className="text-lg font-bold">
              {activeTab === 'queue' ? selectedInQueue.length : Object.keys(selections).length} Selecionados
            </h1>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDeleteSelected} className="p-2 active:scale-90 transition-transform text-red-100 hover:text-white">
              <Trash2 size={24} />
            </button>
            {(activeTab !== 'queue' || selectedInQueue.length <= availableSlotsOnCourt) && (
              <button onClick={confirmSelection} className="p-2 active:scale-90 transition-transform">
                <Users size={24} className="text-[#40E0D0]" />
              </button>
            )}
          </div>
        </header>
      ) : (
        <header className="px-6 py-4 flex flex-col bg-white border-b border-gray-100 sticky top-0 z-40">
          <div className="flex items-center justify-between mb-4 min-h-[72px]">
            <button onClick={() => { if(activeTab === 'list' && navigationSource === 'queue') { setActiveTab('queue'); setNavigationSource('settings'); setPendingQueueIndex(null); } else onBackProp(); }} className="p-2 -ml-2 text-black active:scale-90 flex items-center justify-center">
              <ScoreboardIcon className="w-8 h-8" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <Users size={22} className="text-[#40E0D0] stroke-[2.5]" />
              <h1 className="text-lg font-black text-black tracking-tight">Meus parceiros</h1>
            </div>
            <div className="w-10"></div>
          </div>
          <div className={`flex bg-gray-100 p-1 rounded-2xl mb-2 mx-1 grid grid-cols-2`}>
            <button onClick={() => { setActiveTab('list'); setPendingQueueIndex(null); }} className={`py-3 text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
              <Users size={16} /> Lista
            </button>
            <button onClick={() => { setActiveTab('queue'); setPendingQueueIndex(null); }} className={`py-3 text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'queue' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
              <Clock size={16} /> Fila
            </button>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-8 pb-48 no-scrollbar">
        {activeTab === 'list' && (
          <div className="space-y-8 animate-in fade-in">
            {!isSelectionMode && displayedLives.length > 0 && (
              <div className="space-y-4">
                 <div className="flex items-center gap-2 px-1 text-sky-500 font-black"><div className="p-1 bg-white shadow-sm rounded-lg flex items-center justify-center"><LiveIndicator className="scale-75" /></div><h3 className="text-sm font-black text-black tracking-tight">Assista agora</h3></div>
                 <div className="grid grid-cols-1 gap-3">
                   {displayedLives.map(live => (
                     <button key={live.ownerPin} onClick={() => onWatchLive(live.ownerPin!)} className="bg-white rounded-[2rem] p-5 shadow-sm border border-sky-100 flex items-center justify-between active:scale-[0.98] transition-all group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-sky-400"></div>
                        <div className="flex items-center gap-4"><div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner"><Wifi size={24} className="text-blue-500" /></div><div className="text-left"><p className="text-[10px] font-black text-slate-400 leading-none mb-1">Partida em andamento</p><p className="text-sm font-black text-gray-900 truncate max-w-[150px]">{live.p1.name} vs {live.p2.name}</p></div></div>
                        <div className="flex items-center gap-3"><div className="bg-sky-50 px-3 py-2 rounded-xl border border-sky-100 font-mono text-[13px] font-black text-sky-700">{live.p1.score}-{live.p2.score}</div><ChevronRight size={20} className="text-gray-300 group-hover:text-sky-500 transition-colors" /></div>
                     </button>
                   ))}
                 </div>
              </div>
            )}
            {!isSelectionMode && pendingQueueIndex === null && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1 text-blue-500"><Cloud size={18} /><h3 className="text-sm font-black text-black tracking-tight">Sincronização nuvem</h3></div>
                <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div className="flex flex-wrap gap-2 flex-1">
                      <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100"><Database size={12} className="text-blue-600" /><span className="text-[11px] font-black text-blue-800">{cloudCount} <span className="opacity-40 font-bold">Cloud</span></span></div>
                      <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100"><Smartphone size={12} className="text-black" /><span className="text-[11px] font-black text-black">{partners.length} <span className="opacity-40 font-bold">Local</span></span></div>
                      <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100"><Star size={12} className="text-amber-600" fill="currentColor" /><span className="text-[11px] font-black text-amber-800">{referralCount} <span className="opacity-40 font-bold">Indicados</span></span></div>
                    </div>
                    <div className="flex gap-2 shrink-0"><button onClick={() => syncAllData()} disabled={isDownloading} className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 shadow-emerald-100">{isDownloading ? <Loader2 size={20} className="animate-spin" /> : <CloudDownload size={22} />}</button><button onClick={() => uploadToCloud(false)} disabled={isUploading} className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 shadow-blue-100">{isUploading ? <Loader2 size={20} className="animate-spin" /> : <CloudUpload size={22} />}</button></div>
                </div>
              </div>
            )}
            {!isSelectionMode && pendingQueueIndex === null && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1 text-amber-500"><Star size={18} /><h3 className="text-sm font-black text-black tracking-tight">Indique e ganhe</h3></div>
                <div className="bg-[#0f172a] rounded-[3rem] p-8 shadow-2xl border border-white/10 flex flex-col items-center gap-6 overflow-hidden">
                   <div className="flex flex-col items-center gap-8 w-full">
                      <div className="bg-white p-3 rounded-3xl shadow-2xl w-48 h-48 flex items-center justify-center shrink-0 border-4 border-sky-500/20"><img src={qrCodeShareUrl} alt="Meu convite" className="w-full h-full object-contain" /></div>
                      <div className="flex-1 space-y-5 w-full text-center">
                        <p className="text-[11px] font-bold text-slate-400 leading-tight">Convide seus amigos para usar o my placar. Ao se cadastrarem pelo seu link, eles viram seus parceiros automaticamente.</p>
                        <div className="space-y-3 w-full"><button onClick={handleShareWhatsApp} className="w-full bg-[#25D366] text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"><Share2 size={18} /> WhatsApp</button><button onClick={handleCopyShareLink} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all"><Copy size={18} /> Copiar link de convite</button></div>
                      </div>
                   </div>
                </div>
              </div>
            )}
            {!isSelectionMode && pendingQueueIndex === null && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1 text-emerald-500"><UserPlus size={18} /><h3 className="text-sm font-black text-black tracking-tight">Novo parceiro</h3></div>
                <div className="space-y-3">
                    <div className="relative" onClick={() => scannerInputRef.current?.startScanner()}><div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 z-10 pointer-events-none"><QrCode size={20} /></div><Input ref={scannerInputRef} enableCamera={true} readOnly placeholder="Escanear qr code" onVoiceComplexResult={(n, p) => handleAddPartner(p, n, 'qrcode')} className="h-[56px] pl-12 text-[14px] font-bold border-2 border-emerald-500 rounded-2xl shadow-sm cursor-pointer" /></div>
                    <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100 space-y-4">
                      <div className="flex gap-2">
                          <div className="relative w-28 shrink-0"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"><Hash size={14} /></div><input type="text" placeholder="Pin" maxLength={5} value={pinInput} onChange={e => setPinInput(e.target.value.toUpperCase())} className="w-full h-14 pl-8 pr-2 bg-slate-50 border border-slate-100 rounded-2xl text-base font-black outline-none focus:ring-2 focus:ring-emerald-500/20" />{isSearchingPin && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" />}</div>
                          <button onClick={() => handleAddPartner(pinInput, (lookupName && lookupName !== 'Pin não localizado') ? lookupName : '', 'manual', undefined, lookupFullName)} disabled={pinInput.length < 5 || isSearchingPin || lookupName === 'Pin não localizado' || isAlreadyRegistered} className={`flex-1 h-14 rounded-2xl px-4 flex items-center justify-center transition-all ${pinInput.length === 5 && lookupName !== 'Pin não localizado' && !isAlreadyRegistered ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : (pinInput.length === 5 && lookupName !== 'Pin não localizado' && isAlreadyRegistered ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : (pinInput.length === 5 ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-gray-100 text-gray-300'))}`} > <span className="text-xs font-black truncate flex items-center gap-2"> {isSearchingPin ? 'Buscando...' : (!pinInput ? 'Digite o pin' : (lookupName === 'Pin não localizado' ? 'Pin não localizado' : (isAlreadyRegistered ? `${lookupName} já cadastrado` : <>{lookupName} cadastrar <UserPlus size={16}/></>)))} </span> </button>
                      </div>
                    </div>
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-slate-400">
                  <Users size={18} className="text-[#40E0D0]" />
                  <h3 className="text-sm font-black text-black">
                    {pendingQueueIndex !== null ? `Vincular a posição ${pendingQueueIndex + 1}` : 'Jogadores disponíveis'}
                  </h3>
                </div>
                {!isSelectionMode && pendingQueueIndex === null && (
                   <button onClick={refreshAllNicknames} disabled={isRefreshing || partners.length === 0} className={`p-2 rounded-xl transition-all ${isRefreshing ? 'bg-blue-50 text-blue-500' : 'text-slate-400 hover:text-blue-500 active:bg-blue-50'}`} > <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} /> </button> 
                )}
                {pendingQueueIndex !== null && (
                   <button onClick={() => { setPendingQueueIndex(null); setActiveTab('queue'); }} className="text-[10px] font-black text-red-500 px-3 py-1 bg-red-50 rounded-lg border border-red-100">Cancelar vínculo</button>
                )}
              </div>
              <div className="relative"><input placeholder="Procurar na lista..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-14 pl-12 pr-12 bg-white border border-gray-100 rounded-3xl shadow-sm text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" /><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" /></div>
              <div className="space-y-3 pt-2">
                {filteredPartners.map(p => {
                  const team = selections[p.id];
                  const teamColor = team === 1 ? p1Color : p2Color;
                  return (
                    <div key={p.id} onClick={() => handleToggleSelect(p.id)} className={`bg-white rounded-[2.5rem] p-5 shadow-sm border-2 transition-all duration-300 flex items-center gap-4 relative active:scale-[0.98] ${team ? `${BORDER_COLORS[teamColor]} ${LIGHT_BG_COLORS[teamColor]}` : 'border-white'}`}>
                      {team && ( <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-3xl font-black text-[10px] !text-white shadow-sm animate-in slide-in-from-right-2 ${SOLID_COLORS_BG[teamColor]}`}> Time {team} </div> )}
                      <div className="relative shrink-0"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${p.id === 'me' ? 'bg-[#4B0082] text-white shadow-lg' : 'bg-green-100 text-green-600'}`}><User size={24} fill={p.id === 'me' ? "currentColor" : "none"} /></div></div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-black text-[15px] truncate transition-colors ${team ? 'text-black' : 'text-slate-900'}`}>{p.name || p.nickname} {p.id === 'me' && <span className="text-[10px] opacity-40 ml-1">(você)</span>}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.nickname} - {p.pin}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handlePartnerGenderToggle(p.id, e)}
                          className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${p.gender === 'F' ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}
                        >
                          {p.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
                        </button>
                        <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all duration-500 ${team ? `${SOLID_COLORS_BG[teamColor]} border-transparent !text-white` : 'bg-gray-50 border-gray-100 rotate-45 opacity-20'}`}>{team ? <CheckCircle2 size={18} className="text-white" /> : (pendingQueueIndex !== null ? <ChevronRight size={18} className="text-blue-500" /> : <Plus size={16} className="text-slate-400" />)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="space-y-6 animate-in fade-in">
             <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 space-y-5">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2 text-slate-400">
                     <History size={18} className="text-sky-500"/>
                     <h3 className="text-sm font-black text-black tracking-tight">Próximos a entrar</h3>
                </div>
                <button onClick={handleSelectAllQueue} className="px-4 py-1.5 bg-gray-200 text-gray-600 rounded-full text-[10px] font-black active:scale-95 transition-all flex items-center gap-1.5">
                  <CheckSquare size={14} className="text-emerald-500" />
                  Selecionar todos
                </button>
             </div>
             
             {canShowCourtFree && (
                <button onClick={confirmSelection} className="w-full py-4 bg-sky-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl animate-in zoom-in active:scale-95 transition-all">
                  <Play size={18} fill="currentColor"/> Quadra livre ({availableSlotsOnCourt} {availableSlotsOnCourt === 1 ? 'vaga disponível' : 'vagas disponíveis'})
                </button>
             )}

             <div className="space-y-1 px-1 pt-2 border-t border-gray-50">
               <Toggle id="sw-winners" label="Vencedores permanecem" checked={matchSettings.winnersStay || false} onChange={(v) => onUpdateSettings?.({ winnersStay: v })} />
             </div>

             <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={handleShuffleFormation} disabled={isShuffling} className="py-4 bg-sky-500 text-white rounded-2xl font-black text-[10px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"><Dices size={14} className="text-yellow-300"/> Sorteio de formação</button>
                {canShowMixedShuffle && (
                  <button onClick={handleShuffleMixed} disabled={isShuffling} className="py-4 bg-sky-50 text-sky-600 border border-sky-100 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 animate-in zoom-in"><ArrowRightLeft size={14} className="text-pink-300"/> Sorteio misto</button>
                )}
             </div>
          </div>

          <div className="space-y-3">
             {playerQueue.map((player, idx) => (
               <div 
                 key={player.id} draggable onDragStart={() => setDraggedIdx(idx)} onDragOver={e => e.preventDefault()} onDrop={() => { if(draggedIdx !== null) { moveQueueItem(draggedIdx, idx); setDraggedIdx(null); } }}
                 onClick={() => handleQueueSelectionToggle(idx)}
                 className={`flex items-center gap-3 p-3 rounded-3xl border-2 transition-all cursor-pointer active:scale-[0.99] select-none ${player.isSelected ? 'bg-blue-50 border-blue-600 shadow-lg' : 'bg-white border-transparent shadow-sm'}`}
               >
                 <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md">{idx + 1}</div>
                 <div className={`flex-1 min-w-0 ${player.isSelected ? 'opacity-40 pointer-none' : ''}`} onClick={e => e.stopPropagation()}>
                    <Input 
                      value={player.name} onChange={e => handleQueueNameChange(idx, e.target.value)} onVoiceComplexResult={(n) => handleQueueNameChange(idx, n)} placeholder="" 
                      className={`h-12 rounded-2xl font-bold shadow-none border-gray-100 transition-all duration-500 ${
                        player.verified 
                        ? 'bg-blue-50 border-blue-600 text-blue-600 border-2' 
                        : (player.name ? 'bg-white text-black' : 'bg-gray-50')
                      }`}
                      rightAction={<div className="flex items-center gap-1.5 mr-1"><Camera size={18} className="text-[#10b981]" /><Mic size={18} className="text-indigo-500" /><button onClick={(e) => { e.stopPropagation(); setNavigationSource('queue'); setPendingQueueIndex(idx); setActiveTab('list'); }} className="p-1 active:scale-90"><Users size={18} className="text-[#40E0D0]" /></button></div>}
                    />
                 </div>
                 <button onClick={e => { e.stopPropagation(); handleQueueGenderToggle(idx); }} className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all active:scale-90 shadow-sm ${player.gender === 'M' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-pink-50 text-pink-600 border-pink-100'} ${player.isSelected ? 'opacity-40 pointer-none' : ''}`}>{player.gender === 'M' ? <MarsIcon size={18}/> : <VenusIcon size={18}/>}</button>
               </div>
             ))}
             <button onClick={handleAddQueueLine} className="w-full py-5 border-2 border-dashed border-gray-200 rounded-[2.5rem] flex items-center justify-center gap-3 text-gray-400 font-black text-xs active:bg-gray-50 transition-all hover:border-blue-200 hover:text-blue-400"><Plus size={18}/> Adicionar jogador</button>
          </div>
       </div>
        )}
      </div>

      {!isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent z-40 animate-in slide-in-from-bottom">
          <button onClick={confirmSelection} className="w-full bg-black text-white py-6 rounded-[2.5rem] font-black shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3"> 
            <ArrowLeft size={20} /> <span>Voltar</span> 
          </button>
        </div>
      )}
    </div>
  );
};
