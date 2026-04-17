import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Partner } from '@modules/partners';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { ArrowLeft, Trophy, Users, Share2, Copy, QrCode, X, User, Loader2, RotateCw, Settings, Save, Play, Clock, Target, CheckCircle2, Wifi, Zap, UserPlus, Mail, ChevronUp, ChevronDown, Check, Trash2, Link2, Unlink, ShieldCheck, UserCheck, Edit3, Search, AlertCircle } from 'lucide-react';
import { TournamentEvent, TournamentEntry, UserProfile, TournamentPair, TournamentMatch, TournamentConfig } from '../types.ts';
import { findUserByPin, getDb } from '@infra/firebase';
import { collection, getDocs, doc, setDoc, onSnapshot, query, updateDoc, getDoc, deleteDoc, Firestore, writeBatch } from 'firebase/firestore';
import { SPORT_LIST } from '../constants.ts';
import { formatPortugueseName, maskPin } from '../utils/formatters.ts';
import { Toggle } from '../components/Toggle.tsx';
import { Input } from '../components/Input.tsx';

interface Props {
  event: TournamentEvent;
  onBack: () => void;
  userProfile: UserProfile;
  onExitTournament: () => void;
  onAddPartner: (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => void;
  partners: Partner[];
  onStartTournamentMatch: (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent) => void;
  setModalConfig: React.Dispatch<React.SetStateAction<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    variant?: 'info' | 'danger' | 'success';
    icon?: React.ReactNode;
  } | null>>;
  appUrl: string;
}

interface DesfazerTimeIconProps {
  size?: number;
}

const DesfazerTimeIcon: React.FC<DesfazerTimeIconProps> = ({ size = 16 }) => (
  <div className="relative flex items-center justify-center">
    <Users size={size} className="text-slate-400" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-[2px] bg-red-600 -rotate-45 rounded-full shadow-sm pointer-events-none" />
  </div>
);

const idxToLetter = (idx: number) => String.fromCharCode(65 + idx);

export const EventDetailScreen: React.FC<Props> = ({ event: initialEvent, onBack, userProfile, onExitTournament, onAddPartner, partners, onStartTournamentMatch, setModalConfig, appUrl }) => {
  const [event, setEvent] = useState<TournamentEvent>(initialEvent);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [liveScores, setLiveScores] = useState<Record<string, any>>({});
  
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntry, setManualEntry] = useState({ name: '', nickname: '', email: '', gender: 'M' as 'M' | 'F' });
  const [isSavingManual, setIsSavingManual] = useState(false);

  const [coAdminPin, setCoAdminPin] = useState('');
  const [coAdminLookupName, setCoAdminLookupName] = useState('');
  const [isSearchingCoAdminPin, setIsSearchingCoAdminPin] = useState(false);
  const [isSavingCoAdmin, setIsSavingCoAdmin] = useState(false);

  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const getNicknameByPin = useCallback((pin: string) => {
    if (userProfile.pin === pin) return userProfile.nickname;
    const entry = entries.find(e => e.pin === pin);
    if (entry) return entry.nickname;
    return 'Administrador';
  }, [entries, userProfile.pin, userProfile.nickname]);

  const isAdmin = useMemo(() => {
    const coAdmins = (event.coAdminPins as string[]) || [];
    return userProfile.email?.toLowerCase().trim() === 'celsomramalho@gmail.com' || 
           coAdmins.includes(userProfile.pin.toUpperCase());
  }, [userProfile, event.coAdminPins]);

  const baseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsubscribe = onSnapshot(doc(db as Firestore, "events", initialEvent.pin), (snap) => {
      if (snap.exists()) {
        setEvent({ pin: snap.id, ...snap.data() } as TournamentEvent);
      }
    });
    return () => unsubscribe();
  }, [initialEvent.pin]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const liveMatchesQuery = query(collection(db as Firestore, "live_matches"));
    const unsubscribe = onSnapshot(liveMatchesQuery, (snap) => {
      const scores: Record<string, any> = {};
      snap.forEach(d => {
        const data = d.data() as any;
        if (data.tournamentPin === event.pin) {
          scores[data.tournamentMatchId] = {
            p1Score: data.p1.score,
            p2Score: data.p2.score,
            p1Games: data.p1.games,
            p2Games: data.p2.games,
            p1Sets: data.p1.sets.filter((s: number, i: number) => s > (((data.p2.sets as (number | undefined)[])[i]) ?? 0)).length,
            p2Sets: data.p2.sets.filter((s: number, i: number) => s > (((data.p1.sets as (number | undefined)[])[i]) ?? 0)).length,
            isPaused: data.isPaused
          };
        }
      });
      setLiveScores(scores);
    });
    return () => unsubscribe();
  }, [event.pin]);

  useEffect(() => {
    const lookup = async () => {
      const pin = coAdminPin.toUpperCase().trim();
      if (pin.length === 5) {
        setIsSearchingCoAdminPin(true);
        const db = getDb();
        if (!db) { setIsSearchingCoAdminPin(false); return; }
        try {
          const user = await findUserByPin(db as Firestore, pin);
          if (user) {
            setCoAdminLookupName(user.nickname);
          } else {
            setCoAdminLookupName("Usuário não localizado");
          }
        } catch (e) {
          setCoAdminLookupName("");
        } finally {
          setIsSearchingCoAdminPin(false);
        }
      } else {
        setCoAdminLookupName("");
      }
    };
    lookup();
  }, [coAdminPin]);

  const inviteLink = useMemo(() => {
    return `${baseUrl}/?joinEvent=${event.pin}&refPin=${userProfile.pin.toUpperCase()}`;
  }, [event.pin, userProfile.pin]);

  const qrCodeUrl = useMemo(() => {
    return `https://quickchart.io/qr?text=${encodeURIComponent(inviteLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`;
  }, [inviteLink]);

  const fetchEntries = async () => {
    const db = getDb();
    if (!db) return;
    setIsLoading(true);
    try {
      const q = query(collection(db as Firestore, "events", event.pin, "entries"));
      const snap = await getDocs(q);
      const list: TournamentEntry[] = [];
      const batchToRemove = writeBatch(db as Firestore);
      let ghostCount = 0;

      for (const d of snap.docs) {
        const entryData = d.data() as TournamentEntry;
        const userRef = doc(db as Firestore, "users", entryData.email);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          // Sincronização dos nomes com a base global de usuários
          list.push({ 
            ...entryData, 
            name: userData.name, 
            nickname: userData.nickname 
          });
        } else {
          batchToRemove.delete(d.ref);
          ghostCount++;
        }
      }

      if (ghostCount > 0) {
        await batchToRemove.commit();
      }

      setEntries(list);
    } catch (e) {
      console.error("Erro ao sincronizar participantes:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [event.pin]);

  const getAthleteStatus = (email: string) => {
    const pair = event.pairs?.find(p => p.p1.email === email || p.p2.email === email);
    if (!pair) return null;
    const pairIdx = event.pairs?.findIndex(p => p.id === pair.id) ?? -1;
    const match = event.matches?.find(m => m.pair1Id === pair.id || m.pair2Id === pair.id);
    const matchIdx = event.matches?.findIndex(m => m.id === match?.id) ?? -1;
    return {
      pair,
      pairLetter: idxToLetter(pairIdx),
      match,
      matchNumber: matchIdx !== -1 ? matchIdx + 1 : null
    };
  };

  const getPairWins = useCallback((pairId: string) => {
    return (event.matches || []).filter(
      (m) => m.status === 'finished' && m.winnerPairId === pairId
    ).length;
  }, [event.matches]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const stA = getAthleteStatus(a.email);
      const stB = getAthleteStatus(b.email);
      const gameA = stA?.matchNumber ?? 9999;
      const gameB = stB?.matchNumber ?? 9999;
      if (gameA !== gameB) return gameA - gameB;
      const letterA = stA?.pairLetter ?? 'Z';
      const letterB = stB?.pairLetter ?? 'Z';
      if (letterA !== letterB) return letterA.localeCompare(letterB);
      if (a.gender !== b.gender) return a.gender === 'F' ? -1 : 1;
      return 0;
    });
  }, [entries, event.pairs, event.matches]);

  const handleToggleGender = async (entryEmail: string, currentGender?: 'M' | 'F') => {
    if (!isAdmin && entryEmail !== userProfile.email) return;
    const db = getDb();
    if (!db) return;
    const nextGender = currentGender === 'M' ? 'F' : 'M';
    try {
       await updateDoc(doc(db as Firestore, "events", event.pin, "entries", entryEmail), { gender: nextGender });
       await updateDoc(doc(db as Firestore, "users", entryEmail), { gender: nextGender });
       setEntries(prev => prev.map(e => e.email === entryEmail ? { ...e, gender: nextGender } : e));
    } catch (e) {
       console.error("Falha ao alterar gênero:", e);
    }
  };

  const handleToggleCheckIn = async (entryEmail: string, currentStatus?: boolean) => {
    if (!isAdmin && entryEmail !== userProfile.email) return;
    const db = getDb();
    if (!db) return;
    const nextStatus = !currentStatus;
    try {
       await updateDoc(doc(db as Firestore, "events", event.pin, "entries", entryEmail), { checkedIn: nextStatus });
       setEntries(prev => prev.map(e => e.email === entryEmail ? { ...e, checkedIn: nextStatus } : e));
    } catch (e) {
       console.error("Falha ao realizar check-in:", e);
    }
  };

  const handleUpdateNickname = async (email: string) => {
    if (!tempNickname.trim()) return;
    setIsSavingNickname(true);
    const db = getDb();
    if (!db) { setIsSavingNickname(false); return; }
    try {
      const formatted = formatPortugueseName(tempNickname);
      await updateDoc(doc(db as Firestore, "events", event.pin, "entries", email), { nickname: formatted });
      try {
        await updateDoc(doc(db as Firestore, "users", email), { nickname: formatted });
      } catch (e) {}
      setEntries(prev => prev.map(e => e.email === email ? { ...e, nickname: formatted } : e));
      setEditingEmail(null);
      setModalConfig({ title: "Sucesso", message: "O apelido foi atualizado.", onConfirm: () => setModalConfig(null) });
    } catch (e) {
      setModalConfig({ title: "Erro", message: "Erro ao atualizar o apelido.", onConfirm: () => setModalConfig(null) });
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleAddCoAdmin = async () => {
    if (!coAdminPin || coAdminPin.length < 5) return;
    setIsSavingCoAdmin(true);
    const db = getDb();
    if (!db) { setIsSavingCoAdmin(false); return; }
    try {
      const pinUpper = coAdminPin.toUpperCase().trim();
      const currentAdmins: string[] = (event.coAdminPins || []) as string[];
      if (currentAdmins.includes(pinUpper)) {
        setModalConfig({ title: "Atenção", message: "Este PIN já é um administrador.", onConfirm: () => setModalConfig(null) });
        return;
      }
      const nextAdmins: string[] = [...currentAdmins, pinUpper];
      await updateDoc(doc(db as Firestore, "events", event.pin), { coAdminPins: nextAdmins });
      setCoAdminPin('');
      setCoAdminLookupName('');
      setModalConfig({ title: "Sucesso", message: "Administrador adicionado com sucesso!", onConfirm: () => setModalConfig(null) });
    } catch (e) {
      setModalConfig({ title: "Erro", message: "Erro ao adicionar administrador.", onConfirm: () => setModalConfig(null) });
    } finally {
      setIsSavingCoAdmin(false);
    }
  };

  const handleRemoveCoAdmin = async (pin: string) => {
    setModalConfig({
      title: "Remover administrador?",
      message: `Deseja realmente remover o administrador com PIN ${pin}?`,
      confirmLabel: "Remover",
      variant: 'danger',
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          const currentAdmins: string[] = (event.coAdminPins || []) as string[];
          const nextAdmins = currentAdmins.filter(p => p !== pin);
          await updateDoc(doc(db as Firestore, "events", event.pin), { coAdminPins: nextAdmins });
          setModalConfig({ title: "Sucesso", message: "Administrador removido.", onConfirm: () => setModalConfig(null) });
        } catch (e) {
          setModalConfig({ title: "Erro", message: "Erro ao remover administrador.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleDeleteEntry = async (entryEmail: string, nickname: string) => {
    const isSelf = entryEmail === userProfile.email;
    setModalConfig({
      title: isSelf ? "Sair do evento?" : "Excluir participante",
      message: isSelf ? "Deseja realmente sair deste evento?" : `Deseja realmente remover ${nickname} do evento? Esta ação não pode ser desfeita.`,
      confirmLabel: isSelf ? "Sair" : "Excluir",
      variant: 'danger',
      icon: <Trash2 size={24} className="text-red-500" />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          await deleteDoc(doc(db as Firestore, "events", event.pin, "entries", entryEmail));
          await deleteDoc(doc(db as Firestore, "user_registrations", entryEmail, "events", event.pin));
          setEntries(prev => prev.filter(e => e.email !== entryEmail));
          if (isSelf) {
            onExitTournament();
          } else {
            setModalConfig({ title: "Sucesso", message: "Participante removido do evento.", onConfirm: () => setModalConfig(null) });
          }
        } catch (e) {
          console.error("Erro ao excluir participante:", e);
          setModalConfig({ title: "Erro", message: "Erro ao remover the participante.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleUndoPair = async (pairId: string) => {
    setModalConfig({
      title: "Desfazer time?",
      message: "Deseja realmente desfazer este time? Os atletas ficarão disponíveis novamente.",
      confirmLabel: "Desfazer",
      variant: 'danger',
      icon: <DesfazerTimeIcon size={24} />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          const nextPairs = (event.pairs || []).filter(p => p.id !== pairId);
          const nextMatches = (event.matches || []).filter(m => m.pair1Id !== pairId && m.pair2Id !== pairId);
          await updateDoc(doc(db as Firestore, "events", event.pin), { pairs: nextPairs, matches: nextMatches });
          setModalConfig({ title: "Sucesso", message: "O time foi desfeito e os atletas estão disponíveis.", onConfirm: () => setModalConfig(null) });
        } catch (e) {
          console.error("Erro ao desfazer time:", e);
          setModalConfig({ title: "Erro", message: "Erro ao desfazer o time.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleUndoMatch = async (matchId: string) => {
    setModalConfig({
      title: "Excluir confronto?",
      message: "Deseja realmente excluir este confronto?",
      confirmLabel: "Excluir",
      variant: 'danger',
      icon: <Trash2 size={24} className="text-red-500" />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          const nextMatches = (event.matches || []).filter(m => m.id !== matchId);
          await updateDoc(doc(db as Firestore, "events", event.pin), { matches: nextMatches });
          setModalConfig({ title: "Sucesso", message: "O confronto foi removido.", onConfirm: () => setModalConfig(null) });
        } catch (e) {
          console.error("Erro ao remover confronto:", e);
          setModalConfig({ title: "Erro", message: "Erro ao remover o confronto.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleTryStartMatch = (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair) => {
    const hasLiveMatch = event.matches?.some(m => m.status === 'live');
    if (hasLiveMatch) {
       setModalConfig({
         title: "Já existe jogo ao vivo",
         message: "Deseja encerrar a transmissão anterior para iniciar esta nova?",
         confirmLabel: "Encerrar e iniciar",
         variant: 'danger',
         onConfirm: async () => {
            const db = getDb();
            if (db) {
               const updatedMatches = (event.matches || []).map(m => {
                  if (m.status === 'live') return { ...m, status: 'finished' as const };
                  return m;
               });
               await updateDoc(doc(db as Firestore, "events", event.pin), { matches: updatedMatches });
            }
            onStartTournamentMatch(match, pair1, pair2, event);
         },
         onCancel: () => setModalConfig(null)
       });
       return;
    }
    onStartTournamentMatch(match, pair1, pair2, event);
  };

  const handleSaveManualEntry = async () => {
    const { name, nickname, email, gender } = manualEntry;
    if (!name || !nickname || !email) {
       setModalConfig({ title: "Atenção", message: "Preencha todos os campos obrigatórios.", onConfirm: () => setModalConfig(null) });
       return;
    }
    setIsSavingManual(true);
    const db = getDb();
    if (!db) { setIsSavingManual(false); return; }
    try {
       const cleanEmail = email.toLowerCase().trim();
       const tempPin = `TEMP${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
       const entryData: TournamentEntry = { name, nickname, email: cleanEmail, pin: tempPin, gender, joinedAt: Date.now(), checkedIn: true };
       await setDoc(doc(db as Firestore, "events", event.pin, "entries", cleanEmail), entryData);
       await setDoc(doc(db as Firestore, "user_registrations", cleanEmail, "events", event.pin), { pin: event.pin, name: event.name, joinedAt: entryData.joinedAt, bannerUrl: event.bannerUrl || null });
       setManualEntry({ name: '', nickname: '', email: '', gender: 'M' });
       setShowManualEntry(false);
       fetchEntries();
       setModalConfig({ title: "Sucesso", message: `Participante ${nickname} inscrito com sucesso!`, onConfirm: () => setModalConfig(null) });
    } catch (e) { setModalConfig({ title: "Erro", message: "Erro ao realizar inscrição manual.", onConfirm: () => setModalConfig(null) }); } finally { setIsSavingManual(false); }
  };

  const handleSaveConfig = async (config: Partial<TournamentConfig>) => {
    const db = getDb();
    if (!db) return;
    const currentConfig = event.config || { sportType: 'beach-tennis', sets: 1, gamesPerSet: 6, noAd: true, isLocked: false };
    const nextConfig = { ...currentConfig, ...config };
    await updateDoc(doc(db as Firestore, "events", event.pin), { config: nextConfig });
    if (config.isLocked !== undefined) { 
      setModalConfig({ 
        title: "Sucesso", 
        message: config.isLocked ? "Regras do torneio travadas para todas as partidas." : "Regras do torneio liberadas para edição.", 
        onConfirm: () => setModalConfig(null) 
      }); 
    }
  };

  const handleFormPairManual = async () => {
    if (selectedEntries.size !== 2) return;
    const db = getDb();
    if (!db) return;
    const selected = Array.from(selectedEntries).map(email => entries.find(e => e.email === email)!);
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: selected[0],
      p2: selected[1]
    };
    const nextPairs = [...(event.pairs || []), newPair];
    await updateDoc(doc(db as Firestore, "events", event.pin), { pairs: nextPairs });
    setSelectedEntries(new Set());
    setModalConfig({ title: "Sucesso", message: "Time formado com sucesso!", onConfirm: () => setModalConfig(null) });
  };

  const handleCreateMatchManual = async () => {
    if (selectedPairs.size !== 2) return;
    const db = getDb();
    if (!db) return;
    const pairIds = Array.from(selectedPairs);
    const newMatch: TournamentMatch = {
      id: `match_${Date.now()}`,
      pair1Id: pairIds[0],
      pair2Id: pairIds[1],
      status: 'waiting'
    };
    const nextMatches = [...(event.matches || []), newMatch];
    await updateDoc(doc(db as Firestore, "events", event.pin), { matches: nextMatches });
    setSelectedPairs(new Set());
    setModalConfig({ title: "Sucesso", message: "Confronto escalado com sucesso!", onConfirm: () => setModalConfig(null) });
  };

  const toggleEntrySelection = (email: string) => {
    const entry = entries.find(e => e.email === email);
    const isPairedOrMatched = event.pairs?.some(p => (p.p1.email === email || p.p2.email === email));
    // Bloqueio de seleção para participantes sem check-in
    if (!isAdmin || isPairedOrMatched || !entry?.checkedIn) return;
    const next = new Set(selectedEntries);
    if (next.has(email)) next.delete(email);
    else if (next.size < 2) next.add(email);
    setSelectedEntries(next);
  };

  const togglePairSelection = (pairId: string) => {
    const matches = event.matches || [];
    const isLive = matches.some(m => (m.pair1Id === pairId || m.pair2Id === pairId) && m.status === 'live');
    const isWaiting = matches.some(m => (m.pair1Id === pairId || m.pair2Id === pairId) && m.status === 'waiting');
    if (!isAdmin || isLive || isWaiting) return;
    const next = new Set(selectedPairs);
    if (next.has(pairId)) next.delete(pairId);
    else if (next.size < 2) next.add(pairId);
    setSelectedPairs(next);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight truncate max-w-[200px]">{event.name}</h1>
        </div>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {event.bannerUrl && (
          <div className="w-full h-48 relative overflow-hidden">
            <img src={event.bannerUrl} className="w-full h-full object-cover" alt="Capa do evento" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <h2 className="text-white font-black text-2xl tracking-tight leading-tight">{event.name}</h2>
              <p className="text-amber-400 font-bold text-xs uppercase mt-1">Evento oficial • PIN: {event.pin}</p>
            </div>
          </div>
        )}

        <div className="p-5 space-y-8">
          {isAdmin && (
            <div className="space-y-4">
               <div className="flex items-center gap-2 px-1 text-slate-500 font-black">
                 <Settings size={18} />
                 <h3 className="text-sm font-black text-black tracking-tight">Configurações do torneio</h3>
               </div>
               <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 space-y-5">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-black text-gray-700">Travar regras para as partidas</span>
                     <Toggle id="lock-rules" checked={event.config?.isLocked || false} onChange={v => handleSaveConfig({ isLocked: v })} />
                  </div>
                  
                  <div className={`grid grid-cols-1 gap-4 transition-all ${event.config?.isLocked ? 'opacity-50 pointer-none' : ''}`}>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 ml-1">Esporte</label>
                        <select 
                          value={event.config?.sportType || 'beach-tennis'} 
                          onChange={e => handleSaveConfig({ sportType: e.target.value })}
                          className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 font-black text-sm outline-none"
                        >
                          {SPORT_LIST.filter(s => s.group === 'raquetes').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 ml-1">Sets</label>
                           <select value={event.config?.sets || 1} onChange={e => handleSaveConfig({ sets: Number(e.target.value) as any })} className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 font-black text-sm outline-none"><option value={1}>Set único</option><option value={3}>Melhor de 3</option></select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 ml-1">Games por set</label>
                           <select value={event.config?.gamesPerSet || 6} onChange={e => handleSaveConfig({ gamesPerSet: Number(e.target.value) })} className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 font-black text-sm outline-none"><option value={4}>4 games</option><option value={6}>6 games</option></select>
                        </div>
                     </div>
                     <Toggle id="config-noad" label="Sistema sem vantagem (No-ad)" checked={event.config?.noAd ?? true} onChange={v => handleSaveConfig({ noAd: v })} />
                  </div>

                  <div className="pt-4 border-t border-gray-50 space-y-4">
                     <div className="flex items-center gap-2 text-indigo-500 font-black">
                        <ShieldCheck size={18} />
                        <h3 className="text-[11px] font-black text-black tracking-tight">Administradores do evento</h3>
                     </div>
                     
                     <div className="flex items-center gap-2">
                        <div className="relative w-20 shrink-0">
                           <input 
                              type="text" 
                              placeholder="PIN"
                              value={coAdminPin}
                              onChange={e => setCoAdminPin(e.target.value.toUpperCase().trim())}
                              maxLength={5}
                              className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-3 font-black text-sm text-center outline-none focus:ring-2 focus:ring-indigo-100"
                           />
                           {isSearchingCoAdminPin && <Loader2 size={12} className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />}
                        </div>
                        
                        <div className="flex-1 min-w-0 flex items-center justify-center">
                          {coAdminLookupName && (
                            <div className="animate-in slide-in-from-left-1 text-center">
                               <span className={`text-[10px] font-black uppercase truncate block ${coAdminLookupName === "Usuário não localizado" ? 'text-red-500' : 'text-slate-500'}`}>
                                  {coAdminLookupName}
                               </span>
                            </div>
                          )}
                        </div>

                        <button 
                           onClick={handleAddCoAdmin}
                           disabled={isSavingCoAdmin || coAdminPin.length < 5 || (coAdminLookupName === "Usuário não localizado")}
                           className="bg-indigo-600 text-white px-4 py-3 rounded-xl font-black text-[10px] active:scale-95 shadow-md flex items-center justify-center shrink-0"
                        >
                           {isSavingCoAdmin ? <Loader2 size={14} className="animate-spin" /> : 'Adicionar'}
                        </button>
                     </div>

                     <div className="flex flex-wrap gap-2 pt-2">
                        {event.coAdminPins?.map(pin => (
                           <div key={pin} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full border border-indigo-100 animate-in zoom-in">
                              <span className="text-[10px] font-black">{getNicknameByPin(pin)} - {maskPin(pin)}</span>
                              <button onClick={() => handleRemoveCoAdmin(pin)} className="text-indigo-400 hover:text-red-500 transition-colors">
                                 <X size={14} strokeWidth={3} />
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-blue-500 font-black">
              <Share2 size={18} />
              <h3 className="text-sm font-black text-black tracking-tight">Ações do evento</h3>
            </div>
            <div className="bg-[#0f172a] rounded-[3rem] p-8 shadow-2xl border border-white/10 flex flex-col items-center gap-6 overflow-hidden">
               <div className="flex flex-col items-center gap-8 w-full">
                  <div className="bg-white p-3 rounded-3xl shadow-2xl w-48 h-48 flex items-center justify-center shrink-0 border-4 border-sky-500/20">
                    <img src={qrCodeUrl} alt="Convite evento" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 space-y-5 w-full text-center">
                    <p className="text-[11px] font-bold text-slate-400 leading-tight">Compartilhe este convite com seus parceiros para que eles entrem no evento sob sua indicação.</p>
                    <div className="space-y-3 w-full">
                      <button onClick={() => {
                        const text = `Participe do evento ${event.name} comigo no MyPlacar! Acompanhe os resultados e inscreva-se pelo link: ${inviteLink}`;
                        globalThis.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }} className="w-full bg-[#25D366] text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
                        <Share2 size={18} /> WhatsApp
                      </button>
                      <button onClick={() => {
                        navigator.clipboard.writeText(inviteLink).then(() => setModalConfig({ title: "Sucesso", message: "Link do convite copiado com sucesso.", onConfirm: () => setModalConfig(null) }));
                      }} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all">
                        <Copy size={18} /> Copiar link de convite
                      </button>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-indigo-500 font-black">
                   <UserPlus size={18} />
                   <h3 className="text-sm font-black text-black tracking-tight">Inscrição manual de atleta</h3>
                </div>
                <button onClick={() => setShowManualEntry(!showManualEntry)} className={`p-2 rounded-xl transition-all ${showManualEntry ? 'bg-indigo-50 text-indigo-500' : 'text-slate-400 active:bg-indigo-50'}`}>
                   {showManualEntry ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                </button>
             </div>
             {showManualEntry && (
                <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 space-y-5 animate-in slide-in-from-top-4">
                   <Input 
                      label="Nome completo" 
                      enableVoice
                      value={manualEntry.name} 
                      onChange={e => setManualEntry({...manualEntry, name: formatPortugueseName(e.target.value)})} 
                   />
                   <div className="flex gap-2 items-end">
                      <div className="flex-1">
                         <Input 
                            label="Apelido do atleta" 
                            enableVoice
                            value={manualEntry.nickname} 
                            onChange={e => setManualEntry({...manualEntry, nickname: formatPortugueseName(e.target.value)})} 
                         />
                      </div>
                      <button 
                        onClick={() => setManualEntry({...manualEntry, gender: manualEntry.gender === 'M' ? 'F' : 'M'})}
                        className={`w-[42px] h-[44px] rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${manualEntry.gender === 'F' ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}
                      >
                         {manualEntry.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
                      </button>
                   </div>
                   <Input 
                      label="E-mail para convite" 
                      enableVoice
                      type="email" 
                      value={manualEntry.email} 
                      onChange={e => setManualEntry({...manualEntry, email: e.target.value})} 
                   />
                   <button 
                      onClick={handleSaveManualEntry} 
                      disabled={isSavingManual}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                   >
                      {isSavingManual ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                      Adicionar participante
                   </button>
                </div>
             )}
          </div>

          {isAdmin && (event.pairs?.length || 0) > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                 <div className="flex items-center gap-2 text-cyan-500 font-black">
                   <Link2 size={18} />
                   <h3 className="text-sm font-black text-black tracking-tight">Times formados</h3>
                 </div>
                 {selectedEntries.size === 2 && (
                   <button onClick={handleCreateMatchManual} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg animate-in zoom-in">Escalar confronto</button>
                 )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                {event.pairs?.map((pair, idx) => {
                  const isSelected = selectedPairs.has(pair.id);
                  const matches = event.matches || [];
                  const isLive = matches.some(m => (m.pair1Id === pair.id || m.pair2Id === pair.id) && m.status === 'live');
                  const isWaiting = matches.some(m => (m.pair1Id === pair.id || m.pair2Id === pair.id) && m.status === 'waiting');
                  const wins = getPairWins(pair.id);
                  
                  return (
                    <div 
                      key={pair.id} 
                      onClick={() => togglePairSelection(pair.id)}
                      className={`relative bg-white p-4 rounded-3xl border-2 transition-all cursor-pointer ${isSelected ? 'border-cyan-500 bg-cyan-50/50 ring-4 ring-cyan-50' : isLive ? 'border-gray-100 opacity-60 grayscale' : isWaiting ? 'border-sky-100 bg-sky-50/20' : 'border-gray-100'}`}
                    >
                      <div className="absolute -top-2 -right-2 bg-slate-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border-2 border-white">
                        {idxToLetter(idx)}
                      </div>
                      <div className="space-y-1 mb-3">
                         <p className="text-xs font-black text-gray-900 leading-tight truncate">{pair.p1.nickname} & {pair.p2.nickname}</p>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className={`flex items-center gap-1.5 text-[9px] font-bold tracking-tight ${isWaiting ? 'text-sky-600' : 'text-slate-400'}`}>
                           <span>{isLive ? 'Em jogo' : isWaiting ? 'Aguardando quadra' : 'Disponível'}</span>
                           {wins > 0 && (
                             <>
                               <span className="opacity-40">•</span>
                               <Trophy size={10} className="text-amber-500 mb-0.5" fill="currentColor" />
                               <span>{wins} {wins === 1 ? 'vitória' : 'vitórias'}</span>
                             </>
                           )}
                         </div>
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleUndoPair(pair.id); }}
                           className="p-1.5 transition-transform active:scale-75"
                           title="Desfazer time"
                         >
                           <DesfazerTimeIcon size={14} />
                         </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(event.matches?.length || 0) > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1 text-red-500 font-black">
                <Target size={18} />
                <h3 className="text-sm font-black text-black tracking-tight">Confrontos programados</h3>
              </div>
              <div className="space-y-4">
                {event.matches?.map((match, idx) => {
                  const pair1 = event.pairs?.find(p => p.id === match.pair1Id);
                  const pair2 = event.pairs?.find(p => p.id === match.pair2Id);
                  const live = liveScores[match.id];
                  if (!pair1 || !pair2) return null;
                  const p1Idx = event.pairs?.findIndex(p => p.id === pair1.id) ?? 0;
                  const p2Idx = event.pairs?.findIndex(p => p.id === pair2.id) ?? 0;
                  return (
                    <div key={match.id} className={`bg-white rounded-[2.5rem] p-6 shadow-sm border-2 transition-all ${match.status === 'live' ? 'border-sky-500 ring-4 ring-sky-50' : 'border-gray-100'} relative`}>
                       <div className="flex items-center justify-between mb-6">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Jogo #{idx + 1}</span>
                         <div className="flex items-center gap-4">
                           {match.status === 'live' ? (
                              <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-full border border-red-100 animate-pulse">
                                <Wifi size={12} className="text-red-500" />
                                <span className="text-[9px] font-black text-red-600">Ao vivo</span>
                              </div>
                           ) : match.status === 'finished' ? (
                              <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                <CheckCircle2 size={12} className="text-emerald-500" />
                                <span className="text-[9px] font-black text-emerald-600">Finalizada</span>
                              </div>
                           ) : (
                              <span className="text-[9px] font-black text-slate-400 bg-gray-100 px-3 py-1 rounded-full">Aguardando</span>
                           )}
                           {isAdmin && (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleUndoMatch(match.id); }} 
                               className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg active:scale-75 transition-all" 
                               title="Excluir confronto"
                             >
                               <Trash2 size={18}/>
                             </button>
                           )}
                         </div>
                       </div>
                       <div className="flex items-center justify-between gap-4 mb-6">
                          <div className="flex-1 text-center space-y-1">
                             <div className="mb-2"><span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">Time {idxToLetter(p1Idx)}</span></div>
                             <p className="text-xs font-black text-gray-900 leading-tight">{pair1.p1.nickname} & {pair1.p2.nickname}</p>
                             {match.status === 'finished' && match.winnerPairId === match.pair1Id && <Trophy size={14} className="text-amber-500 mx-auto" fill="currentColor" />}
                          </div>
                          <div className="flex flex-col items-center justify-center shrink-0 min-w-[60px]">
                             {match.status === 'live' && live ? (
                                <div className="text-center">
                                   <p className="text-2xl font-black text-sky-600 leading-none">{live.p1Score}-{live.p2Score}</p>
                                   <p className="text-[10px] font-bold text-slate-400 mt-1">{live.p1Games}-{live.p2Games} games</p>
                                </div>
                             ) : match.status === 'finished' ? (
                                <div className="bg-slate-900 text-white px-3 py-1 rounded-xl text-sm font-black shadow-lg">
                                   {match.result}
                                </div>
                             ) : (
                                <span className="text-xs font-black text-slate-300">VS</span>
                             )}
                          </div>
                          <div className="flex-1 text-center space-y-1">
                             <div className="mb-2"><span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">Time {idxToLetter(p2Idx)}</span></div>
                             <p className="text-xs font-black text-gray-900 leading-tight">{pair2.p1.nickname} & {pair2.p2.nickname}</p>
                             {match.status === 'finished' && match.winnerPairId === match.pair2Id && <Trophy size={14} className="text-amber-500 mx-auto" fill="currentColor" />}
                          </div>
                       </div>
                       {isAdmin && match.status === 'waiting' && (
                         <button 
                            onClick={() => handleTryStartMatch(match, pair1, pair2)}
                            className="w-full py-4 bg-sky-500 text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                         >
                            <Play size={16} fill="white" /> Escalar para quadra
                         </button>
                       )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-amber-500 font-black">
                <Users size={20} />
                <h3 className="text-sm font-black text-black tracking-tight">Participantes oficiais</h3>
              </div>
              <div className="flex gap-2">
                {isAdmin && selectedEntries.size === 2 && (
                   <button onClick={handleFormPairManual} className="bg-cyan-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg animate-in zoom-in">Formar time</button>
                )}
                <button onClick={fetchEntries} className="p-2 text-blue-600 active:scale-90 transition-transform">
                  <RotateCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            {isLoading ? (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-300">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-xs font-bold tracking-tight">Sincronizando nomes dos atletas...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center text-gray-400 font-bold text-sm bg-white rounded-3xl border border-dashed">Ninguém inscrito ainda</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {sortedEntries.map((entry: TournamentEntry) => {
                  const st = getAthleteStatus(entry.email);
                  const isSelected = selectedEntries.has(entry.email);
                  const isPairedOrMatched = event.pairs?.some(p => (p.p1.email === entry.email || p.p2.email === entry.email));
                  // Participante indisponível para seleção visualmente e logicamente se não fez check-in
                  const isUnavailable = !entry.checkedIn;
                  
                  return (
                    <div 
                      key={entry.email} 
                      onClick={() => isAdmin && toggleEntrySelection(entry.email)}
                      className={`bg-white p-5 rounded-3xl shadow-sm border transition-all duration-300 relative overflow-hidden ${isSelected ? 'border-cyan-500 ring-4 ring-cyan-50 bg-cyan-50/20' : entry.checkedIn ? 'border-emerald-100 ring-2 ring-emerald-50' : 'border-gray-100 opacity-40 grayscale pointer-events-none'} ${st || isPairedOrMatched ? 'border-slate-200 opacity-60 grayscale cursor-default' : (isAdmin && !isUnavailable ? 'cursor-pointer' : '')}`}
                    >
                      {st && (
                         <div className={`absolute top-0 right-0 px-5 py-2 rounded-bl-3xl font-black text-[10px] text-white shadow-sm flex flex-col items-center leading-none ${st.pairLetter === 'A' ? 'bg-blue-600' : st.pairLetter === 'B' ? 'bg-red-600' : 'bg-slate-800'}`}>
                            <span>Time {st.pairLetter}</span>
                            {st.matchNumber && <span className="text-[7px] opacity-80 mt-1 uppercase">Jogo {st.matchNumber}</span>}
                         </div>
                      )}
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4 flex-1 min-w-0">
                           <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${entry.checkedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                             <User size={24} />
                           </div>
                           <div className="text-left flex-1 min-w-0 pr-2">
                             <div className="flex items-center gap-2">
                               {editingEmail === entry.email ? (
                                  <div className="flex items-center gap-1 animate-in slide-in-from-left-1">
                                    <input 
                                      autoFocus
                                      type="text"
                                      value={tempNickname}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempNickname(formatPortugueseName(e.target.value))}
                                      className="h-8 w-32 bg-gray-50 border border-blue-200 rounded-lg px-2 text-xs font-black outline-none focus:ring-2 focus:ring-blue-100"
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdateNickname(entry.email); }}
                                      disabled={isSavingNickname}
                                      className="p-1 bg-emerald-500 text-white rounded-lg active:scale-75"
                                    >
                                      {isSavingNickname ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={4} />}
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingEmail(null); }}
                                      className="p-1 bg-gray-100 text-gray-500 rounded-lg active:scale-75"
                                    >
                                      <X size={14} strokeWidth={4} />
                                    </button>
                                  </div>
                               ) : (
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-black text-gray-900 truncate">{entry.name || entry.nickname}</p>
                                    {isAdmin && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingEmail(entry.email); setTempNickname(entry.nickname); }}
                                        className="p-1 text-slate-300 hover:text-blue-500 active:scale-75 transition-colors"
                                        title="Editar apelido"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                    )}
                                  </div>
                               )}
                             </div>
                             <p className="text-[10px] font-bold text-gray-400 uppercase">{entry.nickname} - {maskPin(entry.pin)}</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-2 shrink-0">
                           {(isAdmin || entry.email === userProfile.email) && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleToggleCheckIn(entry.email, entry.checkedIn); }}
                                className={`p-2 rounded-xl transition-all active:scale-90 border ${entry.checkedIn ? 'bg-emerald-500 text-white border-emerald-600 shadow-md pointer-events-auto' : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-auto'}`}
                                title={entry.checkedIn ? "Confirmar ausência" : "Confirmar presença"}
                              >
                                <Check size={18} strokeWidth={3} />
                              </button>
                           )}
                           {(isAdmin || entry.email === userProfile.email) && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.email, entry.nickname); }}
                                className="p-2 bg-red-50 text-red-500 rounded-xl active:scale-90 border border-red-100 pointer-events-auto"
                                title="Excluir participante"
                              >
                                <Trash2 size={18} />
                              </button>
                           )}
                           <button 
                             onClick={(e) => { e.stopPropagation(); handleToggleGender(entry.email, entry.gender); }}
                             disabled={!(isAdmin || entry.email === userProfile.email)}
                             className={`p-2 rounded-xl transition-all active:scale-90 border ${entry.gender === 'F' ? 'bg-pink-50 text-pink-500 border-pink-100' : 'bg-sky-50 text-sky-500 border-sky-100'} ${!(isAdmin || entry.email === userProfile.email) ? 'cursor-default' : 'hover:brightness-95 pointer-events-auto'}`}
                             title={(isAdmin || entry.email === userProfile.email) ? "Alterar gênero do participante" : ""}
                           >
                             {entry.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
                           </button>
                         </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
