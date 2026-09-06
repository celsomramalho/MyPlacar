import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Loader2, Sparkles, Plus, Trash2, ChevronDown, Save, Edit2, Database, Wand2, LayoutGrid, Trophy, Type, HelpCircle, Volume2, Info, Crown, Download, RotateCw, Check, Wifi } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { deleteAdminEvent, fetchAdminEvents, saveAdminEvent } from '@infra/firebase/adminEvents';
import {
  fetchAdminIconCatalog,
  type FirebaseAdminCategoryIcon,
  type FirebaseAdminSportIcon,
} from '@infra/firebase/adminIcons';
import { deleteLiveMatchesByIds, fetchLiveMatchesStats as fetchFirebaseLiveMatchesStats } from '@infra/firebase/liveMatches';
import { linkLegacyMatchesToOwnerEmail } from '@infra/firebase/matches';
import { fetchSystemConfig, saveSystemConfigPatch } from '@infra/firebase/systemConfig';
import { searchUserProfilesByEmailPrefix } from '@infra/firebase/users';
import { migrateFirebaseAdminDataToSupabase } from '@infra/supabase/adminMigration';
import { AdminConfirmModals, type AdminDeleteConfirm } from '@modules/admin/components/AdminConfirmModals';
import { AdminEventsPanel } from '@modules/admin/components/AdminEventsPanel';
import { AdminHeader } from '@modules/admin/components/AdminHeader';
import { AdminHiddenFileInputs } from '@modules/admin/components/AdminHiddenFileInputs';
import { AdminStatusAlert, type AdminStatus } from '@modules/admin/components/AdminStatusAlert';
import { AdminSupabaseMigrationCard, type AdminMigrationResult } from '@modules/admin/components/AdminSupabaseMigrationCard';
import { AdminUsersPanel } from '@modules/admin/components/AdminUsersPanel';
import { AdminVoiceRulesPanel } from '@modules/admin/components/AdminVoiceRulesPanel';
import { deleteAdminIconAndMirror, saveAdminIconAndMirror, updateAdminUserPlan } from '@modules/admin/services/adminPersistence';
import { clearAdminFirestoreCache } from '@modules/admin/services/adminTechnicalActions';
import type { AdminIconUploadTarget, AdminTab } from '@modules/admin/types';
import { SPORT_LIST as INITIAL_SPORT_LIST, SPORT_GROUPS as INITIAL_SPORT_GROUPS, DEFAULT_VOICE_COMMANDS, APP_VERSION as LOCAL_VERSION } from '../../../constants';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import type { TournamentEvent } from '@modules/events/types';
import { VoiceCommands, ErrorSoundType, Tab } from '../../../types';
import type { UserProfile } from '@modules/auth/types';
import { AdminCommunicationsPanel } from '@modules/communications';
import { playErrorBeep, unlockAudio } from '@modules/game/presentation/hooks/useScoreAnnouncer';
import { isPrimaryAdminEmail } from '@modules/events/services/eventAdminAccess';

interface Props {
  onBack: () => void;
  onNavigateToTab?: (tab: Tab) => void;
  onOpenRules?: () => void;
  onExportData?: () => void;
  onImportData?: (jsonStr: string) => void;
  onClearAllHistory?: () => void;
  initialTab?: AdminTab;
  onOpenMenu?: () => void;
  userProfile?: UserProfile;
}

type CategoryItem = FirebaseAdminCategoryIcon;
type SportItem = FirebaseAdminSportIcon;

export const AdminScreen: React.FC<Props> = ({ onBack, onNavigateToTab, onOpenRules, onExportData, onImportData, onClearAllHistory, initialTab, onOpenMenu, userProfile }) => {
  const isPrimary = isPrimaryAdminEmail(userProfile?.email);
  const [adminTab, setAdminTab] = useState<AdminTab>(() => (!isPrimary ? 'events' : initialTab || 'configs'));
  const [loading, setLoading] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [showConfirmFix, setShowConfirmFix] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<AdminMigrationResult | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminDeleteConfirm | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [goldenRule, setGoldenRule] = useState(true);
  
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [sports, setSports] = useState<SportItem[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedSportId, setSelectedSportId] = useState<string>("");
  const [isEditingId, setIsEditingId] = useState(false);
  
  const [isOpenCat, setIsOpenCat] = useState(false);
  const [isOpenSport, setIsOpenSport] = useState(false);

  const [isCatSaved, setIsCatSaved] = useState(true);
  const [isSportSaved, setIsSportSaved] = useState(true);
  
  const [voiceCommands, setVoiceCommands] = useState<VoiceCommands>(DEFAULT_VOICE_COMMANDS);
  const [errorSound, setErrorSound] = useState<ErrorSoundType>('baixo');
  const [remoteAppVersion, setRemoteAppVersion] = useState(LOCAL_VERSION);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isVoiceSaved, setIsVoiceSaved] = useState(true);
  
  const [appUrl, setAppUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      if (window.location.hostname.includes('run.app') || window.location.hostname.includes('localhost')) {
        return window.location.origin;
      }
    }
    return "https://myplacar.app.br/";
  });

  const [userSearch, setUserSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const [isOpenCVP, setIsOpenCVP] = useState(false);
  const [isOpenCVS, setIsOpenCVS] = useState(false);
  const [isOpenCVO, setIsOpenCVO] = useState(false);
  const [liveStats, setLiveStats] = useState({ total: 0, expired: 0, expiredIds: [] as string[], inactiveLives: 0, inactiveLivesIds: [] as string[] });
  const [inactiveHours, setInactiveHours] = useState(2);
  const [_isCleaningLives, setIsCleaningLives] = useState(false);
  
  const [eventList, setEventList] = useState<TournamentEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TournamentEvent | null>(null);
  const [selectedDashboardEvent, setSelectedDashboardEvent] = useState<TournamentEvent | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [showConfirmClearCache, setShowConfirmClearCache] = useState(false);

  const initialEditingEventSnapshotRef = useRef<string | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<(() => void) | null>(null);

  const hasUnsavedEventChanges = () => {
    if (!editingEvent || initialEditingEventSnapshotRef.current === null) return false;
    return JSON.stringify(editingEvent) !== initialEditingEventSnapshotRef.current;
  };

  const handleGuardedAction = (action: () => void) => {
    if (hasUnsavedEventChanges()) {
      setPendingNavigationAction(() => action);
      setShowUnsavedChangesModal(true);
    } else {
      action();
    }
  };

  const handleStartEditEvent = (event: TournamentEvent) => {
    handleGuardedAction(() => {
      setEditingEvent(event);
      initialEditingEventSnapshotRef.current = JSON.stringify(event);
    });
  };

  const handleCreateNewEvent = () => {
    const newEvent: TournamentEvent = {
      pin: '',
      name: '',
      active: true,
      eventStatus: 'Em configuração',
      eventType: 'Chave classificatória',
      setsCount: 1,
      gamesPerSet: 6,
      teamDrawType: 'Manual',
      bracketDrawType: 'Manual',
      matchDrawType: 'Manual',
      showRegisteredParticipants: false,
      allowUserScoreEntry: false,
      rankingMatchesPerTeam: undefined,
      createdAt: Date.now(),
    };
    handleGuardedAction(() => {
      setEditingEvent(newEvent);
      initialEditingEventSnapshotRef.current = JSON.stringify(newEvent);
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefImport = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<AdminIconUploadTarget | null>(null);

  useEffect(() => {
    if (isPrimary) {
      fetchData();
      fetchGlobalConfigs();
    }
  }, [isPrimary]);

  useEffect(() => {
    if (!isPrimary && adminTab !== 'events') {
      setAdminTab('events');
    }
  }, [isPrimary, adminTab]);

  // Se veio de finalização de partida de evento no placar ou de Meus torneios, abre diretamente o evento
  useEffect(() => {
    try {
      const targetPin = sessionStorage.getItem('admin_target_event_pin');
      if (targetPin) {
        setAdminTab('events');
        const db = getDb();
        if (db) {
          import('@infra/firebase/events').then(({ fetchEventByPin }) => {
            fetchEventByPin(db, targetPin).then((ev) => {
              if (ev) {
                setSelectedDashboardEvent(ev as TournamentEvent);
                sessionStorage.removeItem('admin_target_event_pin');
              } else if (!isPrimary) {
                onBack();
              }
            }).catch(() => {
              if (!isPrimary) onBack();
            });
          });
        }
      } else if (!isPrimary && !selectedDashboardEvent) {
        onBack();
      }
    } catch {}
  }, [isPrimary]);

  useEffect(() => {
    if (adminTab === 'events' && isPrimary) {
      fetchEvents();
    }
  }, [adminTab, isPrimary]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedEventChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editingEvent]);

  const slugify = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  const sortItems = (items: (CategoryItem | SportItem)[]) => {
    return [...items].sort((a, b) => {
      const activeA = a.isActive !== false ? 1 : 0;
      const activeB = b.isActive !== false ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      return a.name.localeCompare(b.name);
    });
  };

  const fetchLiveMatchesStats = async (hours = inactiveHours) => {
    const db = getDb();
    if (!db) return;
    try {
      const stats = await fetchFirebaseLiveMatchesStats(db, undefined, hours);
      setLiveStats(stats);
    } catch (e) { console.error("Erro ao buscar estatísticas de transmissões:", e); }
  };

  const handleHoursChange = (hours: number) => {
    setInactiveHours(hours);
    fetchLiveMatchesStats(hours);
  };

  const fetchEvents = async () => {
    const db = getDb();
    if (!db) return;
    setIsLoadingEvents(true);
    try {
      const list = await fetchAdminEvents(db);
      setEventList(list.sort((a,b) => b.createdAt - a.createdAt));
    } catch (_e) { console.error('Erro ao carregar eventos:', _e); } finally { setIsLoadingEvents(false); }
  };

  const fetchData = async () => {
    const db = getDb();
    if (!db) return;
    try {
      const { categories: catList, sports: sportList } = await fetchAdminIconCatalog(db);
      
      const finalCats = catList.length === 0 ? INITIAL_SPORT_GROUPS.map(g => ({ id: g.id, name: g.name, url: g.icon, isActive: true })) : catList;
      const finalSports = sportList.length === 0 ? INITIAL_SPORT_LIST.map(s => ({ id: s.id, name: s.name, url: s.defaultIcon, group: s.group, engine: s.engine, isActive: true })) : sportList;
      
      setCategories(finalCats);
      setSports(finalSports);
      fetchLiveMatchesStats();
    } catch (e) { console.error(e); }
  };

  const fetchGlobalConfigs = async () => {
    const db = getDb();
    if (!db) return;
    try {
      const data = await fetchSystemConfig(db);
      if (data) {
        setGoldenRule(data.goldenRuleEnabled ?? true);
        if (data.voiceCommands) setVoiceCommands(data.voiceCommands);
        if (data.errorSoundType) setErrorSound(data.errorSoundType);
        if (data.appVersion) setRemoteAppVersion(data.appVersion);
        if (data.appUrl) {
          const isDev = window.location.hostname.includes('run.app') || window.location.hostname.includes('localhost');
          if (!isDev) {
            setAppUrl(data.appUrl);
          }
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteExpiredLives = async () => {
    const db = getDb();
    if (!db || liveStats.expiredIds.length === 0) return;
    setIsCleaningLives(true);
    try {
      await deleteLiveMatchesByIds(db, liveStats.expiredIds);
      setStatus({ type: 'success', msg: `${liveStats.expired} transmissões removidas com sucesso.` });
      fetchLiveMatchesStats();
    } catch (_e) {
      setStatus({ type: 'error', msg: "Erro ao remover transmissões." });
    } finally {
      setIsCleaningLives(false);
      setDeleteConfirm(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDeleteInactiveLives = async () => {
    const db = getDb();
    if (!db || liveStats.inactiveLivesIds.length === 0) return;
    setIsCleaningLives(true);
    try {
      await deleteLiveMatchesByIds(db, liveStats.inactiveLivesIds);
      setStatus({ type: 'success', msg: `${liveStats.inactiveLives} transmissões removidas com sucesso.` });
      fetchLiveMatchesStats();
    } catch (_e) {
      setStatus({ type: 'error', msg: "Erro ao remover transmissões." });
    } finally {
      setIsCleaningLives(false);
      setDeleteConfirm(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    
    if (type === 'expired_lives') {
      handleDeleteExpiredLives();
      return;
    }

    if (type === 'inactive_lives_config') {
      handleDeleteInactiveLives();
      return;
    }

    if (type === 'event') {
      const db = getDb();
      if (!db) return;
      try {
        await deleteAdminEvent(db, id);
        setEventList(prev => prev.filter(e => e.pin !== id));
        setStatus({ type: 'success', msg: "Evento removido com sucesso." });
      } catch (_e) {
        setStatus({ type: 'error', msg: "Erro ao remover evento." });
      } finally {
        setTimeout(() => setStatus(null), 2000);
      }
      return;
    }

    if (type === 'category' || type === 'sport') {
      const db = getDb();
      if (!db) return;
      try {
        await deleteAdminIconAndMirror(db, type, id);
        if (type === 'category') { setCategories(prev => prev.filter(c => c.id !== id)); setSelectedCatId(""); }
        else { setSports(prev => prev.filter(s => s.id !== id)); setSelectedSportId(""); }
        setStatus({ type: 'success', msg: "Excluído com sucesso." });
      } catch (_e) { setStatus({ type: 'error', msg: "Erro ao excluir." }); } finally {
        setDeleteConfirm(null);
        setTimeout(() => setStatus(null), 2000);
      }
    }
  };

  const handleSearchUsers = async () => {
    if (!userSearch.trim()) return;
    setIsSearchingUsers(true);
    const db = getDb();
    if (!db) {
      setIsSearchingUsers(false);
      return;
    }
    try {
      const list = await searchUserProfilesByEmailPrefix(db, userSearch);
      setFoundUsers(list);
    } catch (e) { console.error(e); } finally { setIsSearchingUsers(false); }
  };

  const toggleUserPremium = async (user: UserProfile) => {
    const db = getDb();
    if (!db) return;
    const nextPlan: 'free' | 'premium' = user.planType === 'premium' ? 'free' : 'premium';
    try {
      await updateAdminUserPlan(db, user, nextPlan);
      setFoundUsers(prev => prev.map(u => u.email === user.email ? { ...u, planType: nextPlan } : u));
      setStatus({ type: 'success', msg: `Usuário ${user.nickname} agora é ${nextPlan === 'premium' ? 'premium' : 'free'}` });
      setTimeout(() => setStatus(null), 2000);
    } catch (_e) { setStatus({ type: 'error', msg: "Falha ao atualizar plano." }); }
  };

  const executeMigrateToSupabase = async () => {
    const db = getDb();
    if (!db) return;
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const result = await migrateFirebaseAdminDataToSupabase(db);
      setMigrationResult(result);
    } catch (e) {
      console.error('Migração Supabase:', e);
      setStatus({ type: 'error', msg: 'Erro durante a migração. Verifique o console.' });
    } finally {
      setIsMigrating(false);
    }
  };

  const executeFixLegacyMatches = async () => {
    setShowConfirmFix(false);
    setIsFixing(true);
    const db = getDb();
    if (!db) return;

    try {
      const linkedCount = await linkLegacyMatchesToOwnerEmail(db, userProfile?.email || '');
      if (linkedCount > 0) {
        setStatus({ type: 'success', msg: `${linkedCount} partidas vinculadas com sucesso!` });
      } else {
        setStatus({ type: 'success', msg: "Nenhuma partida órfã encontrada." });
      }
    } catch (e: unknown) {
      console.error(e);
      setStatus({ type: 'error', msg: "Falha na atualização em massa." });
    } finally {
      setIsFixing(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const toggleGoldenRule = async (val: boolean) => {
    setGoldenRule(val);
    const db = getDb();
    if (!db) return;
    try {
      await saveSystemConfigPatch(db, { goldenRuleEnabled: val });
      setStatus({ type: 'success', msg: "Regra de ouro atualizada!" });
      setTimeout(() => setStatus(null), 2000);
    } catch (_e) { setStatus({ type: 'error', msg: "Falha ao salvar." }); }
  };

  const handleSaveVoiceConfigs = async () => {
    const db = getDb();
    if (!db) return;
    setIsSavingVoice(true);
    try {
      await saveSystemConfigPatch(db, {
        voiceCommands: voiceCommands,
        errorSoundType: errorSound,
        appVersion: remoteAppVersion,
        appUrl: appUrl
      });
      setStatus({ type: 'success', msg: "Configurações globais salvas!" });
      setIsVoiceSaved(true);
    } catch (_e) {
      setStatus({ type: 'error', msg: "Erro ao salvar configurações." });
    } finally {
      setIsSavingVoice(false);
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const updateCommandField = (field: keyof VoiceCommands, value: string) => {
    const list = value.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    setVoiceCommands(prev => ({ ...prev, [field]: list }));
    setIsVoiceSaved(false);
  };

  const handleSaveItem = async (type: 'category' | 'sport', item: CategoryItem | SportItem) => {
    const db = getDb();
    if (!db) return;
    setLoading(item.id);
    try {
      const itemWithTimestamp = { ...item, updatedAt: new Date().toISOString() };
      await saveAdminIconAndMirror(db, type, itemWithTimestamp);
      setStatus({ type: 'success', msg: "Salvo com sucesso!" });
      setIsEditingId(false);
      if (type === 'category') setIsCatSaved(true);
      else setIsSportSaved(true);
    } catch (_e) { setStatus({ type: 'error', msg: "Erro ao salvar." }); } finally {
      setLoading(null);
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const handleAddNew = (type: 'category' | 'sport') => {
    const tempId = `novo-${Date.now()}`;
    if (type === 'category') {
      const newItem = { id: tempId, name: "Nova categoria", url: "📁", isActive: true };
      setCategories(prev => [...prev, newItem]);
      setSelectedCatId(tempId);
      setIsEditingId(true);
      setIsCatSaved(false);
    } else {
      const newItem = { id: tempId, name: "Novo esporte", url: "⚽", group: selectedCatId || "outros", engine: "rally", isActive: true };
      setSports(prev => [...prev, newItem]);
      setSelectedSportId(tempId);
      setIsEditingId(true);
      setIsSportSaved(false);
    }
  };

  const handleIdChange = (type: 'category' | 'sport', oldId: string, newId: string) => {
    const cleanId = slugify(newId);
    if (type === 'category') {
      setCategories(prev => prev.map(c => c.id === oldId ? { ...c, id: cleanId } : c));
      setSelectedCatId(cleanId);
      setIsCatSaved(false);
    } else {
      setSports(prev => prev.map(s => s.id === oldId ? { ...s, id: cleanId } : s));
      setSelectedSportId(cleanId);
      setIsSportSaved(false);
    }
  };

  const handleSaveEvent = async () => {
    if (!editingEvent?.pin || !editingEvent?.name) return;
    setIsSavingEvent(true);
    const db = getDb();
    if (!db) {
      setIsSavingEvent(false);
      setStatus({ type: 'error', msg: 'Erro: banco de dados indisponível.' });
      setTimeout(() => setStatus(null), 2000);
      return;
    }
    try {
      await saveAdminEvent(db, editingEvent, userProfile?.email);
      setEventList((prev) => {
        const exists = prev.some((ev) => ev.pin === editingEvent.pin);
        if (exists) {
          return prev.map((ev) => (ev.pin === editingEvent.pin ? editingEvent : ev));
        }
        return [editingEvent, ...prev];
      });
      setStatus({ type: 'success', msg: 'Evento salvo com sucesso!' });
      setEditingEvent(null);
      initialEditingEventSnapshotRef.current = null;
    } catch (e) {
      console.error('Erro ao salvar evento:', e);
      setStatus({ type: 'error', msg: `Erro ao salvar evento: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setIsSavingEvent(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleSaveDashboardEvent = async (updatedEvent: TournamentEvent) => {
    if (!updatedEvent.pin) return;
    const db = getDb();
    if (!db) return;
    try {
      await saveAdminEvent(db, updatedEvent, userProfile?.email);
      // Update eventList without entries to keep the list clean
      const { entries: _entries, ...eventWithoutEntries } = updatedEvent;
      setEventList((prev) => prev.map((ev) => (ev.pin === updatedEvent.pin ? { ...eventWithoutEntries } : ev)));
    } catch (e) {
      console.error('Erro ao atualizar dados do evento:', e);
      setStatus({ type: 'error', msg: `Erro ao salvar: ${e instanceof Error ? e.message : String(e)}` });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleEventBannerLoaded = (bannerUrl: string) => {
    if (!editingEvent) return;
    setEditingEvent({ ...editingEvent, bannerUrl });
  };

  const handleIconFileLoaded = (target: AdminIconUploadTarget, base64: string) => {
    if (target.type === 'category') {
      setCategories(prev => prev.map(c => c.id === target.id ? { ...c, url: base64 } : c));
      setIsCatSaved(false);
    } else {
      setSports(prev => prev.map(s => s.id === target.id ? { ...s, url: base64 } : s));
      setIsSportSaved(false);
    }
  };

  const currentCat = categories.find(c => c.id === selectedCatId);
  const currentSport = sports.find(s => s.id === selectedSportId);
  const sortedCategories = sortItems(categories);
  const sortedSports = sortItems(sports);

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col animate-in fade-in">
      <AdminConfirmModals
        showClearCache={showConfirmClearCache}
        showFixLegacyMatches={showConfirmFix}
        deleteConfirm={deleteConfirm}
        showUnsavedChanges={showUnsavedChangesModal}
        onCancelClearCache={() => setShowConfirmClearCache(false)}
        onConfirmClearCache={clearAdminFirestoreCache}
        onCancelFixLegacyMatches={() => setShowConfirmFix(false)}
        onConfirmFixLegacyMatches={executeFixLegacyMatches}
        onCancelDelete={() => setDeleteConfirm(null)}
        onConfirmDelete={confirmDelete}
        onCancelUnsavedChanges={() => {
          setShowUnsavedChangesModal(false);
          setPendingNavigationAction(null);
        }}
        onConfirmUnsavedChanges={() => {
          setShowUnsavedChangesModal(false);
          setEditingEvent(null);
          initialEditingEventSnapshotRef.current = null;
          if (pendingNavigationAction) {
            pendingNavigationAction();
            setPendingNavigationAction(null);
          }
        }}
      />

      <AdminHeader
        activeTab={adminTab}
        hideTabs={!isPrimary}
        onBack={() => handleGuardedAction(() => {
          if (editingEvent) {
            setEditingEvent(null);
            initialEditingEventSnapshotRef.current = null;
          } else if (selectedDashboardEvent) {
            setSelectedDashboardEvent(null);
            if (!isPrimary) {
              onBack();
            }
          } else {
            onBack();
          }
        })}
        onSelectTab={(tab) => handleGuardedAction(() => {
          if (!isPrimary) return;
          setEditingEvent(null);
          setSelectedDashboardEvent(null);
          initialEditingEventSnapshotRef.current = null;
          setAdminTab(tab);
        })}
      />

      <main className="flex-1 p-6 space-y-8 max-w-md mx-auto w-full pb-40">
        <AdminStatusAlert status={status} />

        {adminTab === 'configs' && (
          <>
            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-5">
              <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-black">Versão do sistema</span>
                </div>
                <input type="text" value={remoteAppVersion} onChange={(e) => { setRemoteAppVersion(e.target.value); setIsVoiceSaved(false); }} className="w-full h-[52px] bg-white border rounded-xl px-4 font-black text-lg text-black outline-none" />
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-black">Url do sistema</span>
                </div>
                <div className="relative">
                  <select
                    value={appUrl}
                    onChange={(e) => { setAppUrl(e.target.value); setIsVoiceSaved(false); }}
                    className="w-full h-[52px] bg-white border rounded-xl px-4 font-black text-sm text-black outline-none appearance-none"
                  >
                    <option value="https://myplacar.app.br/">Domínio próprio (myplacar.app.br)</option>
                    <option value="https://my-placar.vercel.app/">Vercel (vercel.app)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronDown size={20} />
                  </div>
                </div>
              </div>
              <div className="px-2">
                <Button onClick={handleSaveVoiceConfigs} disabled={isSavingVoice} className={`w-full !py-4 rounded-2xl font-black text-white shadow-xl flex gap-2 ${isVoiceSaved ? '!bg-[#3b82f6]' : '!bg-amber-500'}`}>{isSavingVoice ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar alterações</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={onExportData} className="w-full !bg-blue-600 !py-3 rounded-xl font-black flex gap-2 text-white text-xs">
                  <Download size={16} /> Exportar
                </Button>
                <Button onClick={() => fileInputRefImport.current?.click()} className="w-full !bg-emerald-600 !py-3 rounded-xl font-black flex gap-2 text-white text-xs">
                  <Upload size={16} /> Importar
                </Button>
              </div>
            </section>

            <div className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                <Database size={20} className="text-indigo-500" />
                <h2 className="text-sm font-black text-black">Manutenção</h2>
              </div>

              <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-white shadow-md"><Sparkles size={24} /></div>
                    <div className="text-left"><p className="text-base font-black text-black leading-tight">Regra de ouro</p><p className="text-[11px] font-bold text-black">Sentence case global</p></div>
                  </div>
                  <Toggle id="toggle-golden-rule" checked={goldenRule} onChange={toggleGoldenRule} />
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setShowConfirmClearCache(true)}
                    className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-black text-[10px] flex items-center justify-center gap-2"
                  >
                    <RotateCw size={14} /> Limpar cache do banco de dados
                  </button>
                </div>
              </section>

              <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-md"><Wifi size={24} /></div>
                  <div>
                    <p className="text-base font-black text-black leading-tight">Transmissões ao vivo</p>
                    <p className="text-[11px] font-bold text-gray-500">{liveStats.total} ativas · {liveStats.expired} expiradas · {liveStats.inactiveLives} inativas</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-gray-600">Inativas há mais de</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 4, 8, 24].map(h => (
                        <button
                          key={h}
                          onClick={() => handleHoursChange(h)}
                          className={`w-9 h-9 rounded-xl text-xs font-black transition-colors ${
                            inactiveHours === h
                              ? 'bg-rose-500 text-white shadow-md'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setDeleteConfirm({ type: 'inactive_lives_config', id: String(inactiveHours), count: liveStats.inactiveLives })}
                    disabled={liveStats.inactiveLives === 0}
                    className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-[10px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={14} /> Limpar {liveStats.inactiveLives} transmissão{liveStats.inactiveLives !== 1 ? 'ões' : ''} inativa{liveStats.inactiveLives !== 1 ? 's' : ''}
                  </button>

                  {liveStats.expired > 0 && (
                    <button
                      onClick={() => setDeleteConfirm({ type: 'expired_lives', id: 'expired', count: liveStats.expired })}
                      className="w-full py-3 bg-orange-50 text-orange-600 rounded-xl font-black text-[10px] flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} /> Limpar {liveStats.expired} transmissão{liveStats.expired !== 1 ? 'ões' : ''} expirada{liveStats.expired !== 1 ? 's' : ''} (+24h)
                    </button>
                  )}
                </div>
              </section>

              <AdminVoiceRulesPanel
                voiceCommands={voiceCommands}
                isOpenCVP={isOpenCVP}
                isOpenCVS={isOpenCVS}
                isOpenCVO={isOpenCVO}
                onToggleCVP={() => setIsOpenCVP(!isOpenCVP)}
                onToggleCVS={() => setIsOpenCVS(!isOpenCVS)}
                onToggleCVO={() => setIsOpenCVO(!isOpenCVO)}
                onUpdateCommandField={updateCommandField}
              />

              <AdminSupabaseMigrationCard
                isMigrating={isMigrating}
                migrationResult={migrationResult}
                onMigrate={executeMigrateToSupabase}
              />
            </div>
          </>
        )}

        {adminTab === 'users' && (
          <AdminUsersPanel
            userSearch={userSearch}
            foundUsers={foundUsers}
            isSearchingUsers={isSearchingUsers}
            onUserSearchChange={setUserSearch}
            onSearchUsers={handleSearchUsers}
            onToggleUserPremium={toggleUserPremium}
          />
        )}

        {adminTab === 'icons' && (
          <div className="space-y-8 animate-in fade-in">
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={18} className="text-blue-500" />
                  <h2 className="text-[13px] font-black text-black tracking-tight">Categorias</h2>
                </div>
                <button onClick={() => handleAddNew('category')} className="p-1.5 bg-blue-500 text-white rounded-lg shadow-sm active:scale-90">
                  <Plus size={18} />
                </button>
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-white space-y-6 relative">
                <div className="relative">
                  <button onClick={() => setIsOpenCat(!isOpenCat)} className="w-full h-[60px] bg-gray-50 border border-gray-100 rounded-2xl px-5 flex items-center justify-between text-base font-black text-gray-900 outline-none">
                    <span>{currentCat ? currentCat.name : "Selecionar categoria..."}</span>
                    <ChevronDown size={20} className={`transition-transform ${isOpenCat ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpenCat && (
                    <div className="absolute top-[65px] left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl z-[60] py-2 overflow-hidden max-h-[300px] overflow-y-auto no-scrollbar">
                      {sortedCategories.map(c => (
                        <div key={c.id} onClick={() => { setSelectedCatId(c.id); setIsEditingId(false); setIsCatSaved(true); setIsOpenCat(false); }} className={`px-5 py-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 cursor-pointer border-b border-gray-50 last:border-0 ${selectedCatId === c.id ? 'bg-blue-50' : ''}`}>
                          <span className="font-bold text-gray-800">{c.name}</span>
                          <div className="pointer-events-none scale-90">
                            <Toggle id={`list-cat-${c.id}`} checked={c.isActive !== false} onChange={() => {}} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {currentCat && (
                  <div className="space-y-4 pt-4 border-t border-gray-100 animate-in zoom-in">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 ml-1">Id do banco (único)</label>
                      <div className="relative">
                        <input type="text" value={currentCat.id} disabled={!isEditingId} onChange={(e) => handleIdChange('category', currentCat.id, e.target.value)} className="w-full h-[45px] bg-gray-100 border border-gray-200 rounded-xl px-4 font-mono text-xs font-bold text-gray-500 outline-none" />
                        {!isEditingId && <button onClick={() => setIsEditingId(true)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500"><Edit2 size={14}/></button>}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1"><input type="text" value={currentCat.name} onChange={(e) => { setCategories(prev => prev.map(c => c.id === currentCat.id ? { ...c, name: e.target.value } : c)); setIsCatSaved(false); }} className="w-full h-[52px] bg-white border border-gray-200 rounded-xl px-4 font-black text-sm text-gray-900 focus:outline-none" placeholder="Nome visível" /></div>
                      <button onClick={() => { setUploadTarget({ id: currentCat.id, type: 'category' }); fileInputRef.current?.click(); }} className="w-[52px] h-[52px] bg-white border border-gray-200 rounded-xl flex items-center justify-center text-2xl overflow-hidden shadow-sm shrink-0 active:scale-95">{currentCat.url?.startsWith('http') || currentCat.url?.startsWith('data') ? <img src={currentCat.url} className="w-full h-full object-cover" /> : currentCat.url}</button>
                    </div>
                    <div className="flex gap-2 items-center h-[52px]">
                      <div className="bg-gray-50 px-3 h-full rounded-2xl border border-gray-100 flex items-center gap-2 flex-1 justify-center">
                        <span className="text-[10px] font-bold text-gray-500">Ativo</span>
                        <Toggle id={`toggle-cat-${currentCat.id}`} checked={currentCat.isActive !== false} onChange={(val) => { setCategories(prev => prev.map(c => c.id === currentCat.id ? { ...c, isActive: val } : c)); setIsCatSaved(false); }} />
                      </div>
                      <Button onClick={() => handleSaveItem('category', currentCat)} className={`flex-[2] h-full !rounded-2xl !text-xs shadow-lg transition-colors ${isCatSaved ? '!bg-green-500' : '!bg-yellow-500'}`}>{loading === currentCat.id ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} className="mr-2"/>} Salvar</Button>
                      <button onClick={() => setDeleteConfirm({type: 'category', id: currentCat.id})} className="h-full w-[52px] bg-red-50 text-red-500 rounded-2xl border border-red-100 active:scale-95 flex items-center justify-center shrink-0"><Trash2 size={20} /></button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Trophy size={18} className="text-green-500" />
                  <h2 className="text-[13px] font-black text-black">Esportes</h2>
                </div>
                <button onClick={() => handleAddNew('sport')} className="p-1.5 bg-green-500 text-white rounded-lg shadow-sm active:scale-90">
                  <Plus size={18} />
                </button>
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-white space-y-6 relative">
                <div className="relative">
                  <button onClick={() => setIsOpenSport(!isOpenSport)} className="w-full h-[60px] bg-gray-50 border border-gray-100 rounded-2xl px-5 flex items-center justify-between text-base font-black text-gray-900 outline-none">
                    <span>{currentSport ? currentSport.name : "Selecionar esporte..."}</span>
                    <ChevronDown size={20} className={`transition-transform ${isOpenSport ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpenSport && (
                    <div className="absolute top-[65px] left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl z-[60] py-2 overflow-hidden max-h-[300px] overflow-y-auto no-scrollbar">
                      {sortedSports.map(s => (
                        <div key={s.id} onClick={() => { setSelectedSportId(s.id); setIsEditingId(false); setIsSportSaved(true); setIsOpenSport(false); }} className={`px-5 py-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 cursor-pointer border-b border-gray-50 last:border-0 ${selectedSportId === s.id ? 'bg-blue-50' : ''}`}>
                          <span className="font-bold text-gray-800">{s.name}</span>
                          <div className="pointer-events-none scale-90">
                            <Toggle id={`list-sport-${s.id}`} checked={s.isActive !== false} onChange={() => {}} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {currentSport && (
                  <div className="space-y-4 pt-4 border-t border-gray-100 animate-in zoom-in">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 ml-1">Id do banco (único)</label>
                      <div className="relative">
                        <input type="text" value={currentSport.id} disabled={!isEditingId} onChange={(e) => handleIdChange('sport', currentSport.id, e.target.value)} className="w-full h-[45px] bg-gray-100 border border-gray-200 rounded-xl px-4 font-mono text-xs font-bold text-gray-500 outline-none" />
                        {!isEditingId && <button onClick={() => setIsEditingId(true)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500"><Edit2 size={14}/></button>}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 ml-1">Nome visível</label>
                          <input type="text" value={currentSport.name} onChange={(e) => { setSports(prev => prev.map(s => s.id === currentSport.id ? { ...s, name: e.target.value } : s)); setIsSportSaved(false); }} className="w-full h-[52px] bg-white border border-gray-200 rounded-xl px-4 font-black text-sm text-gray-900 focus:outline-none" placeholder="Nome do esporte" />
                        </div>
                        <button onClick={() => { setUploadTarget({ id: currentSport.id, type: 'sport' }); fileInputRef.current?.click(); }} className="w-[52px] h-[52px] bg-white border border-gray-200 rounded-xl flex items-center justify-center text-2xl overflow-hidden shadow-sm shrink-0 active:scale-95">{currentSport.url?.startsWith('http') || currentSport.url?.startsWith('data') ? <img src={currentSport.url} className="w-full h-full object-cover" /> : currentSport.url}</button>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 ml-1">Vínculo de categoria</label>
                        <select value={currentSport.group} onChange={(e) => { setSports(prev => prev.map(s => s.id === currentSport.id ? { ...s, group: e.target.value } : s)); setIsSportSaved(false); }} className="w-full h-[45px] bg-gray-50 border border-gray-200 rounded-xl px-4 text-xs font-black text-gray-900">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 ml-1">Motor de regras</label>
                        <select value={currentSport.engine} onChange={(e) => { setSports(prev => prev.map(s => s.id === currentSport.id ? { ...s, engine: e.target.value } : s)); setIsSportSaved(false); }} className="w-full h-[45px] bg-gray-50 border border-gray-200 rounded-xl px-4 text-xs font-black text-gray-900">
                          <option value="tennis">Tênis (15/30/40)</option>
                          <option value="rally">Rally (vôlei/pickleball/mesa)</option>
                          <option value="points-fixed">Points fixos (truco)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center h-[52px] pt-2">
                      <div className="bg-gray-50 px-3 h-full rounded-2xl border border-gray-100 flex items-center gap-2 flex-1 justify-center">
                        <span className="text-[10px] font-bold text-gray-500">Ativo</span>
                        <Toggle id={`toggle-sport-${currentSport.id}`} checked={currentSport.isActive !== false} onChange={(val) => { setSports(prev => prev.map(s => s.id === currentSport.id ? { ...s, isActive: val } : s)); setIsSportSaved(false); }} />
                      </div>
                      <Button onClick={() => handleSaveItem('sport', currentSport)} className={`flex-[2] h-full !rounded-2xl !text-xs shadow-lg transition-colors ${isSportSaved ? '!bg-green-500' : '!bg-yellow-500'}`}>{loading === currentSport.id ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} className="mr-2"/>} Salvar</Button>
                      <button onClick={() => setDeleteConfirm({type: 'sport', id: currentSport.id})} className="h-full w-[52px] bg-red-50 text-red-500 rounded-2xl border border-red-100 active:scale-95 flex items-center justify-center shrink-0"><Trash2 size={20} /></button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {adminTab === 'events' && (
          <AdminEventsPanel
            eventList={eventList}
            editingEvent={editingEvent}
            selectedDashboardEvent={selectedDashboardEvent}
            onSelectDashboardEvent={setSelectedDashboardEvent}
            onBackToTournaments={onBack}
            isLoadingEvents={isLoadingEvents}
            isSavingEvent={isSavingEvent}
            bannerInputRef={bannerInputRef}
            activeSports={sports.filter(s => s.isActive !== false)}
            adminEmail={userProfile?.email}
            onCreateEvent={handleCreateNewEvent}
            onStartEditEvent={handleStartEditEvent}
            onChangeEditingEvent={(event) => {
              if (event === null) {
                handleGuardedAction(() => {
                  setEditingEvent(null);
                  initialEditingEventSnapshotRef.current = null;
                });
              } else {
                setEditingEvent(event);
              }
            }}
            onSaveEvent={handleSaveEvent}
            onSaveDashboardEvent={handleSaveDashboardEvent}
            onDeleteEvent={(pin) => setDeleteConfirm({ type: 'event', id: pin })}
          />
        )}
        {adminTab === 'comms' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <AdminCommunicationsPanel appUrl={appUrl} adminProfile={{ name: 'Admin', nickname: 'Administrador', email: 'admin@myplacar.pro', phone: '', pin: 'admin', isProfileComplete: true, isAdmin: true }} />
          </div>
        )}
      </main>

      <AdminHiddenFileInputs
        iconInputRef={fileInputRef}
        importInputRef={fileInputRefImport}
        eventBannerInputRef={bannerInputRef}
        uploadTarget={uploadTarget}
        onIconLoaded={handleIconFileLoaded}
        onImportJson={onImportData}
        onEventBannerLoaded={handleEventBannerLoaded}
      />

    </div>
  );
};
