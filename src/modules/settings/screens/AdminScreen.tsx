import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle, Sparkles, Plus, Trash2, ChevronDown, Save, Clock, User, Settings as SettingsIcon, ArrowLeft, Edit2, Database, Wand2, X, ShieldCheck, LayoutGrid, Trophy, Mic, Type, HelpCircle, ChevronUp, Volume2, Info, Search, Star, Crown, Edit3, Download, HardDrive, Copy, ExternalLink, FileText, RotateCw, Check, Wifi, Ticket, Image as ImageIcon, Send, Menu } from 'lucide-react';
import { getDb, getStorageInstance, clearFirestoreCache } from '@infra/firebase';
import { doc, setDoc, collection, getDocs, getDoc, deleteDoc, writeBatch, query, where, serverTimestamp } from 'firebase/firestore';
import { deleteIcon, mirrorIcon, mirrorMatches, mirrorPartners, mirrorUser } from '@infra/supabase';
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject, StorageReference, getStorage, getMetadata } from 'firebase/storage';
import { SPORT_LIST as INITIAL_SPORT_LIST, SPORT_GROUPS as INITIAL_SPORT_GROUPS, DEFAULT_VOICE_COMMANDS, APP_VERSION as LOCAL_VERSION } from '../../../constants';
import { Button } from '@shared/components/Button';
import { Toggle } from '../../../components/Toggle';
import { applyGoldenRule, formatPortugueseName } from '../../../utils/formatters';
import { ScoreboardIcon } from '../../../components/ScoreboardIcon';
import type { MatchHistoryItem } from '@modules/history/types';
import type { TournamentEvent } from '@modules/events/types';
import { VoiceCommands, ErrorSoundType } from '../../../types';
import type { UserProfile } from '@modules/auth/types';
import { playErrorBeep, unlockAudio } from '../../../hooks/useScoreAnnouncer';

import { CommunicationsPanel } from '../../../components/CommunicationsPanel';

interface Props {
  onBack: () => void;
  onNavigateToTab?: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  onOpenRules?: () => void;
  onExportData?: () => void;
  onImportData?: (jsonStr: string) => void;
  onClearAllHistory?: () => void;
  initialTab?: 'configs' | 'users' | 'icons' | 'events' | 'comms';
  onOpenMenu?: () => void;
  userProfile?: UserProfile;
}

interface StorageFile {
  name: string;
  fullPath: string;
  url: string;
  size: number;
  updated: string;
  contentType: string;
}

interface CategoryItem {
  id: string;
  name: string;
  url: string;
  isActive?: boolean;
  updatedAt?: string;
}

interface SportItem {
  id: string;
  name: string;
  url: string;
  group: string;
  engine: string;
  isActive?: boolean;
  updatedAt?: string;
}

export const AdminScreen: React.FC<Props> = ({ onBack, onNavigateToTab, onOpenRules, onExportData, onImportData, onClearAllHistory, initialTab, onOpenMenu, userProfile }) => {
  const [adminTab, setAdminTab] = useState<'configs' | 'users' | 'icons' | 'events' | 'comms'>(initialTab || 'configs');
  const [loading, setLoading] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [showConfirmFix, setShowConfirmFix] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{users: number, matches: number, partners: number, icons: number} | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'category' | 'sport' | 'file' | 'bucket' | 'expired_lives' | 'event', id: string, path?: string} | null>(null);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
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

  const [_storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [_isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [_isUploadingFile, setIsUploadingFile] = useState(false);
  const [_storageError, setStorageError] = useState<string | null>(null);
  
  const [liveStats, setLiveStats] = useState({ total: 0, expired: 0, expiredIds: [] as string[] });
  const [_isCleaningLives, setIsCleaningLives] = useState(false);
  
  const [eventList, setEventList] = useState<TournamentEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TournamentEvent | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [showConfirmClearCache, setShowConfirmClearCache] = useState(false);

  const mainStorage = getStorageInstance();
  const defaultBucketName = mainStorage?.app.options.storageBucket || "";
  const [activeBucket, setActiveBucket] = useState(defaultBucketName);
  const [_isAddingBucket, setIsAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  
  const [buckets, setBuckets] = useState<string[]>([defaultBucketName]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefImport = useRef<HTMLInputElement>(null);
  const genericFileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{id: string, type: 'category' | 'sport'} | null>(null);

  useEffect(() => {
    fetchData();
    fetchGlobalConfigs();
  }, []);

  useEffect(() => {
    if (adminTab === 'events') {
      fetchEvents();
    }
  }, [adminTab, activeBucket]);

  const slugify = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  const sortItems = (items: (CategoryItem | SportItem)[]) => {
    return [...items].sort((a, b) => {
      const activeA = a.isActive !== false ? 1 : 0;
      const activeB = b.isActive !== false ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      return a.name.localeCompare(b.name);
    });
  };

  const fetchLiveMatchesStats = async () => {
    const db = getDb();
    if (!db) return;
    try {
      const snap = await getDocs(collection(db, "live_matches"));
      const now = Date.now();
      const limit = now - (24 * 60 * 60 * 1000);
      let totalCount = 0;
      let expiredCount = 0;
      const ids: string[] = [];
      
      snap.forEach(doc => {
        totalCount++;
        const data = doc.data();
        if (data.startTime && data.startTime < limit) {
          expiredCount++;
          ids.push(doc.id);
        }
      });
      
      setLiveStats({ total: totalCount, expired: expiredCount, expiredIds: ids });
    } catch (e) { console.error("Erro ao buscar estatísticas de transmissões:", e); }
  };

  const fetchEvents = async () => {
    const db = getDb();
    if (!db) return;
    setIsLoadingEvents(true);
    try {
      const snap = await getDocs(collection(db, "events"));
      const list: TournamentEvent[] = [];
      snap.forEach(d => list.push({ pin: d.id, ...d.data() } as TournamentEvent));
      setEventList(list.sort((a,b) => b.createdAt - a.createdAt));
    } catch (_e) { console.error('Erro ao carregar eventos:', _e); } finally { setIsLoadingEvents(false); }
  };

  const fetchData = async () => {
    const db = getDb();
    if (!db) return;
    try {
      const catSnap = await getDocs(collection(db, "category_icons"));
      const sportSnap = await getDocs(collection(db, "sport_icons"));
      const catList: CategoryItem[] = [];
      catSnap.forEach(doc => catList.push({ id: doc.id, isActive: true, ...doc.data() } as CategoryItem));
      const sportList: SportItem[] = [];
      sportSnap.forEach(doc => sportList.push({ id: doc.id, isActive: true, ...doc.data() } as SportItem));
      
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
      const configRef = doc(db, "system", "config");
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const data = snap.data();
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
        if (data.buckets && Array.isArray(data.buckets)) {
          setBuckets(data.buckets.includes(defaultBucketName) ? data.buckets : [defaultBucketName, ...data.buckets]);
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchStorageFiles = async () => {
    const mainStorageInstance = getStorageInstance();
    if (!mainStorageInstance) return;
    setIsLoadingFiles(true);
    setStorageError(null);
    setStorageFiles([]);
    
    try {
      const cleanBucket = activeBucket.trim().replace(/^gs:\/\//, '');
      const storageInstance = cleanBucket === defaultBucketName ? mainStorageInstance : getStorage(mainStorageInstance.app, `gs://${cleanBucket}`);
      
      const allFiles: StorageFile[] = [];

      const crawl = async (folderRef: StorageReference) => {
        try {
          const res = await listAll(folderRef);
          const filePromises = res.items.map(async (item) => {
            try {
              const [url, metadata] = await Promise.all([
                getDownloadURL(item),
                getMetadata(item)
              ]);
              return { 
                name: item.name, 
                fullPath: item.fullPath, 
                url: url,
                size: metadata.size,
                updated: metadata.timeCreated,
                contentType: metadata.contentType || 'unknown'
              };
            } catch (_e) {
              return { name: item.name, fullPath: item.fullPath, url: '#', size: 0, updated: '', contentType: 'unknown' };
            }
          });
          const levelFiles = await Promise.all(filePromises);
          allFiles.push(...levelFiles);
          for (const prefix of res.prefixes) await crawl(prefix);
        } catch (err: unknown) {
          const storageErr = err as { code?: string; message?: string };
          if (storageErr.code === 'storage/unauthorized') throw new Error("Acesso negado ao bucket. Verifique as regras de segurança.");
          throw err;
        }
      };

      await crawl(ref(storageInstance, ''));
      setStorageFiles(allFiles);
    } catch (e: unknown) {
      const storageErr = e as { message?: string };
      setStorageError(storageErr.message || "Erro ao acessar o armazenamento.");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleAddBucket = async () => {
    const clean = newBucketName.trim().replace(/^gs:\/\//, '');
    if (!clean) return;
    const db = getDb();
    if (!db) return;

    if (!buckets.includes(clean)) {
      const updated = [...buckets, clean];
      setBuckets(updated);
      await setDoc(doc(db, "system", "config"), { buckets: updated }, { merge: true });
      setStatus({ type: 'success', msg: "Bucket adicionado com sucesso!" });
    }
    setNewBucketName("");
    setIsAddingBucket(false);
    setTimeout(() => setStatus(null), 2000);
  };

  const handleDeleteExpiredLives = async () => {
    const db = getDb();
    if (!db || liveStats.expiredIds.length === 0) return;
    setIsCleaningLives(true);
    try {
      const batch = writeBatch(db);
      liveStats.expiredIds.forEach(id => {
        batch.delete(doc(db, "live_matches", id));
      });
      await batch.commit();
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

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id, path } = deleteConfirm;
    
    if (type === 'expired_lives') {
      handleDeleteExpiredLives();
      return;
    }

    if (type === 'file' && path) {
      handleDeleteStorageFile(path);
      return;
    }

    if (type === 'bucket') {
      const db = getDb();
      if (!db) return;
      const updated = buckets.filter(b => b !== id);
      setBuckets(updated);
      await setDoc(doc(db, "system", "config"), { buckets: updated }, { merge: true });
      if (activeBucket === id) setActiveBucket(defaultBucketName);
      setStatus({ type: 'success', msg: "Bucket removido da lista." });
      setDeleteConfirm(null);
      setTimeout(() => setStatus(null), 2000);
      return;
    }

    if (type === 'event') {
      const db = getDb();
      if (!db) return;
      try {
        await deleteDoc(doc(db, "events", id));
        setEventList(prev => prev.filter(e => e.pin !== id));
        setStatus({ type: 'success', msg: "Evento removido com sucesso." });
      } catch (_e) {
        setStatus({ type: 'error', msg: "Erro ao remover evento." });
      } finally {
        setTimeout(() => setStatus(null), 2000);
      }
      return;
    }

    const db = getDb();
    if (!db) return;
    try {
      const coll = type === 'category' ? "category_icons" : "sport_icons";
      await deleteDoc(doc(db, coll, id));
      if (type === 'sport' || type === 'category') deleteIcon(type, id);
      if (type === 'category') { setCategories(prev => prev.filter(c => c.id !== id)); setSelectedCatId(""); }
      else { setSports(prev => prev.filter(s => s.id !== id)); setSelectedSportId(""); }
      setStatus({ type: 'success', msg: "Excluído com sucesso." });
    } catch (_e) { setStatus({ type: 'error', msg: "Erro ao excluir." }); } finally {
      setDeleteConfirm(null);
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const handleUploadGenericFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const mainStorageInstance = getStorageInstance();
    if (!file || !mainStorageInstance) return;

    setIsUploadingFile(true);
    try {
      const cleanBucket = activeBucket.trim().replace(/^gs:\/\//, '');
      const storageInstance = cleanBucket === defaultBucketName ? mainStorageInstance : getStorage(mainStorageInstance.app, `gs://${cleanBucket}`);
      const storageRef = ref(storageInstance, `${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      setStatus({ type: 'success', msg: "Arquivo enviado com sucesso!" });
      fetchStorageFiles();
    } catch (_e) {
      setStatus({ type: 'error', msg: "Falha ao enviar arquivo." });
    } finally {
      setIsUploadingFile(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDeleteStorageFile = async (path: string) => {
    const mainStorageInstance = getStorageInstance();
    if (!mainStorageInstance) return;
    try {
      const cleanBucket = activeBucket.trim().replace(/^gs:\/\//, '');
      const storageInstance = cleanBucket === defaultBucketName ? mainStorageInstance : getStorage(mainStorageInstance.app, `gs://${cleanBucket}`);
      const fileRef = ref(storageInstance, path);
      await deleteObject(fileRef);
      setStatus({ type: 'success', msg: "Arquivo removido do storage." });
      fetchStorageFiles();
    } catch (_e) {
      setStatus({ type: 'error', msg: "Erro ao excluir arquivo." });
    } finally {
      setDeleteConfirm(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleSearchUsers = async () => {
    if (!userSearch.trim()) return;
    setIsSearchingUsers(true);
    const db = getDb();
    if (!db) return;
    try {
      const q = query(collection(db, "users"), where("email", ">=", userSearch.toLowerCase().trim()), where("email", "<=", userSearch.toLowerCase().trim() + '\uf8ff'));
      const snap = await getDocs(q);
      const list: UserProfile[] = [];
      snap.forEach(d => list.push(d.data() as UserProfile));
      setFoundUsers(list);
    } catch (e) { console.error(e); } finally { setIsSearchingUsers(false); }
  };

  const toggleUserPremium = async (user: UserProfile) => {
    const db = getDb();
    if (!db) return;
    const nextPlan: 'free' | 'premium' = user.planType === 'premium' ? 'free' : 'premium';
    try {
      await setDoc(doc(db, "users", user.email), { planType: nextPlan }, { merge: true });
      mirrorUser({ ...user, planType: nextPlan });
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
    let usersCount = 0;
    let matchesCount = 0;
    let partnersCount = 0;
    let iconsCount = 0;
    try {
      // 1. Migrar users
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const docSnap of usersSnap.docs) {
        const data = docSnap.data() as UserProfile;
        if (data.email && data.pin) {
          mirrorUser(data);
          usersCount++;
        }
      }
      // 2. Migrar matches
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const matchesByOwner = new Map<string, { match: Record<string, unknown>; ownerPin: string }[]>();
      matchesSnap.forEach(docSnap => {
        const data = { id: docSnap.id, ...docSnap.data() } as Record<string, unknown>;
        const ownerEmail = (data.ownerEmail as string) || '';
        const ownerPin = (data.ownerPin as string) || '';
        if (!ownerEmail) return;
        if (!matchesByOwner.has(ownerEmail)) matchesByOwner.set(ownerEmail, []);
        matchesByOwner.get(ownerEmail)!.push({ match: data, ownerPin });
      });
      for (const [ownerEmail, items] of matchesByOwner) {
        const ownerPin = items[0].ownerPin;
        const matches = items.map(i => i.match) as unknown as MatchHistoryItem[];
        mirrorMatches(matches, ownerEmail, ownerPin);
        matchesCount += matches.length;
      }
      // 3. Migrar parceiros de cada usuário
      const partnersSnap = await getDocs(collection(db, 'user_partners_metadata'));
      for (const docSnap of partnersSnap.docs) {
        const ownerEmail = docSnap.id; // document ID é o email do dono
        const partnersList = docSnap.data().partners_list || [];
        // Filtra parceiros sem PIN para evitar dados inconsistentes
        const validPartners = partnersList.filter((p: Record<string, unknown>) => p.pin && typeof p.pin === 'string' && p.pin.trim().length > 0);
        if (ownerEmail && validPartners.length > 0) {
          mirrorPartners(ownerEmail, validPartners);
          partnersCount += validPartners.length;
        }
      }
      // 4. Migrar sport_icons e category_icons
      const sportSnap = await getDocs(collection(db, 'sport_icons'));
      sportSnap.forEach(docSnap => {
        mirrorIcon('sport', { id: docSnap.id, name: '', url: '', ...docSnap.data() });
        iconsCount++;
      });
      const catSnap = await getDocs(collection(db, 'category_icons'));
      catSnap.forEach(docSnap => {
        mirrorIcon('category', { id: docSnap.id, name: '', url: '', ...docSnap.data() });
        iconsCount++;
      });
      setMigrationResult({ users: usersCount, matches: matchesCount, partners: partnersCount, icons: iconsCount });
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
      const matchesRef = collection(db, "matches");
      const snap = await getDocs(matchesRef);
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.ownerEmail || data.ownerEmail === "" || data.ownerEmail === null) {
          batch.update(docSnap.ref, { ownerEmail: userProfile?.email || '' });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
        setStatus({ type: 'success', msg: `${count} partidas vinculadas com sucesso!` });
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
      await setDoc(doc(db, "system", "config"), { goldenRuleEnabled: val }, { merge: true });
      setStatus({ type: 'success', msg: "Regra de ouro atualizada!" });
      setTimeout(() => setStatus(null), 2000);
    } catch (_e) { setStatus({ type: 'error', msg: "Falha ao salvar." }); }
  };

  const handleSaveVoiceConfigs = async () => {
    const db = getDb();
    if (!db) return;
    setIsSavingVoice(true);
    try {
      await setDoc(doc(db, "system", "config"), { 
        voiceCommands: voiceCommands,
        errorSoundType: errorSound,
        appVersion: remoteAppVersion,
        appUrl: appUrl
      }, { merge: true });
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
      const coll = type === 'category' ? "category_icons" : "sport_icons";
      await setDoc(doc(db, coll, item.id), { ...item, updatedAt: new Date().toISOString() });
      mirrorIcon(type, { ...item, updatedAt: new Date().toISOString() });
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
    if (!db) return;
    try {
      await setDoc(doc(db, "events", editingEvent.pin), {
        ...editingEvent,
        createdAt: editingEvent.createdAt || Date.now()
      }, { merge: true });
      setStatus({ type: 'success', msg: "Evento salvo com sucesso!" });
      fetchEvents();
      setEditingEvent(null);
    } catch (_e) {
      setStatus({ type: 'error', msg: "Erro ao salvar evento." });
    } finally {
      setIsSavingEvent(false);
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const handleEventBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingEvent) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingEvent({ ...editingEvent, bannerUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const currentCat = categories.find(c => c.id === selectedCatId);
  const currentSport = sports.find(s => s.id === selectedSportId);
  const sortedCategories = sortItems(categories);
  const sortedSports = sortItems(sports);

  const renderCmdItem = (id: string, label: string, field: keyof VoiceCommands | null, condition: string | null, purpose: string, usage: string) => (
    <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm animate-in fade-in">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-black font-black text-sm">{id}) {label}</span>
          {condition && <span className="text-[9px] font-bold text-blue-600 font-mono">{condition}</span>}
        </div>
      </div>
      <div className="space-y-1.5 border-l-2 border-gray-200 pl-3">
        <p className="text-[10px] font-bold text-gray-500 leading-tight">Para que serve esse comando: <span className="text-black">{purpose}</span></p>
        <p className="text-[10px] font-bold text-gray-500 leading-tight">Como usar<span className="text-black">{usage}</span></p>
      </div>
      {field && (
        <div className="mt-2">
           <input 
            type="text" 
            value={voiceCommands[field].join(', ')}
            onChange={(e) => updateCommandField(field, e.target.value)}
            placeholder="Termos separados por vírgula"
            className="w-full h-[40px] bg-white border border-gray-200 rounded-xl px-4 text-sm font-bold text-black outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col animate-in fade-in">
      {showConfirmClearCache && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[2.5rem] p-8 max-sm w-full shadow-2xl space-y-6">
              <h3 className="text-xl font-black text-black">Limpar cache técnico?</h3>
              <p className="text-black font-bold text-sm">Isso removerá dados temporários do banco de dados local e reiniciará o app. Útil para resolver erros de armazenamento (QuotaExceeded).</p>
              <div className="flex gap-3">
                 <button onClick={() => setShowConfirmClearCache(false)} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs">Cancelar</button>
                 <button onClick={clearFirestoreCache} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs">Limpar e reiniciar</button>
              </div>
           </div>
        </div>
      )}

      {showConfirmFix && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[2.5rem] p-8 max-sm w-full shadow-2xl space-y-6">
              <h3 className="text-xl font-black text-black">Vincular partidas?</h3>
              <p className="text-black font-bold text-sm">Esta ação vinculará todas as partidas sem dono ao e-mail administrativo.</p>
              <div className="flex gap-3">
                 <button onClick={() => setShowConfirmFix(false)} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs">Cancelar</button>
                 <button onClick={executeFixLegacyMatches} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs">Sim, vincular</button>
              </div>
           </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[2.5rem] p-8 max-sm w-full shadow-2xl space-y-6">
              <h3 className="text-xl font-black text-black">
                {deleteConfirm.type === 'bucket' ? 'Remover bucket?' : 
                 deleteConfirm.type === 'expired_lives' ? 'Limpar transmissões?' : 
                 deleteConfirm.type === 'event' ? 'Excluir evento?' : 'Excluir item?'}
              </h3>
              <p className="text-black font-bold text-sm">
                {deleteConfirm.type === 'expired_lives' 
                 ? 'Esta ação removerá permanentemente todas as partidas ao vivo com mais de 24 horas.' 
                 : 'Esta ação não pode ser desfeita e removerá o item permanentemente.'}
              </p>
              <div className="flex gap-3">
                 <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs">Cancelar</button>
                 <button onClick={confirmDelete} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs">Excluir</button>
              </div>
           </div>
        </div>
      )}

      <header className="px-6 py-6 bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90"><ArrowLeft size={24} /></button>
          <div className="flex items-center gap-2">
            <ShieldCheck size={24} className="text-black" />
            <h1 className="text-xl font-black text-black tracking-tight leading-tight">Painel administrativo</h1>
          </div>
          <div className="w-10"></div>
        </div>
        
        <div className="grid grid-cols-5 gap-1 mt-6 max-w-md mx-auto">
          {[
            { id: 'configs' as const, label: 'Configs', icon: <SettingsIcon size={14} /> },
            { id: 'users' as const, label: 'Usuários', icon: <User size={14} /> },
            { id: 'icons' as const, label: 'Ícones', icon: <LayoutGrid size={14} /> },
            { id: 'events' as const, label: 'Eventos', icon: <Ticket size={14} /> },
            { id: 'comms' as const, label: 'Avisos', icon: <Send size={14} /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setAdminTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-[8px] font-black transition-all border leading-tight text-center ${adminTab === tab.id ? 'bg-black text-white border-black shadow-md scale-105' : 'bg-white text-black border-slate-100'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-6 space-y-8 max-w-md mx-auto w-full pb-40">
        {status && <div className={`p-4 rounded-2xl flex items-center gap-2 text-sm font-bold animate-in zoom-in shadow-sm ${status.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{status.msg}</div>}

        {adminTab === 'configs' && (
          <>
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

            <div className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                <Database size={20} className="text-indigo-500" />
                <h2 className="text-sm font-black text-black">Manutenção</h2>
              </div>
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
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                <Mic size={20} className="text-blue-500" />
                <h2 className="text-sm font-black text-black">Regras de voz</h2>
              </div>
              <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-white space-y-5">
                <div className="bg-gray-50/50 rounded-[2rem] overflow-hidden">
                  <button onClick={() => setIsOpenCVP(!isOpenCVP)} className="w-full px-6 py-4 flex items-center justify-between text-black active:bg-gray-100 transition-colors">
                    <span className="text-xs font-black">Regras de voz que alteram o placar (cvp):</span>
                    {isOpenCVP ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                  {isOpenCVP && (
                    <div className="p-4 pt-0 space-y-4">
                      {renderCmdItem('cvp1', 'Prefixo', 'pointTerm', "raw.includes('.') || LIKE(text, FONETICA.ponto)", 'Prefixo para dar o comando de pontuação (sendo: prefixo0 = ponto e prefixo1 = .)', 'Diga: ponto ou .')}
                      <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm animate-in fade-in">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-black font-black text-sm">cvp2) Alvo: [cor], [nome], [time]</span>
                            <span className="text-[9px] font-bold text-blue-600 font-mono">(n?: string, p?: string, c?: string, t?: string)</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 border-l-2 border-gray-200 pl-3">
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Para que serve esse comando: <span className="text-black">{applyGoldenRule('quando a pontuação é da [cor], do [nome], do [time]', true)}</span></p>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Como usar <span className="text-black">{applyGoldenRule('diga: ponto [nome do jogador] ou ponto [cor do time] ou ponto [time 1 / time 2]', true)}</span></p>
                        </div>
                      </div>
                      {renderCmdItem('cvp3', 'Sacador', 'serverTerm', 'LIKE(text, FONETICA.sacador)', 'quando a pontuação é do time sacador', 'diga: ponto sacador')}
                      {renderCmdItem('cvp4', 'Contra', 'receiverTerm', 'LIKE(text, FONETICA.contra)', 'quando a pontuação é do time recebedor', 'diga: ponto contra')}
                      {renderCmdItem('cvp5', 'Ace', 'ace', 'LIKE(text, FONETICA.ace) || LIKE(text, FONETICA.saque)', 'quando o sacador faz um ace', 'diga: ponto ace or ponto de saque')}
                      {renderCmdItem('cvp6', 'Falta', 'fault', 'LIKE(text, FONETICA.falta)', 'quando the sacador saca na rede ou fora da quadra', 'diga: saque errado ou erro de saque')}
                      {renderCmdItem('cvp7', 'Voltar', 'undo', 'LIKE(text, FONETICA.voltar)', 'volta o placar para o último ponto', 'diga: desfazer ponto ou voltar ponto')}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50/50 rounded-[2rem] overflow-hidden">
                  <button onClick={() => setIsOpenCVS(!isOpenCVS)} className="w-full px-6 py-4 flex items-center justify-between text-black active:bg-gray-100 transition-colors">
                    <span className="text-xs font-black">Regras de voz que não alteram o placar (cvs):</span>
                    {isOpenCVS ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                  {isOpenCVS && (
                    <div className="p-4 pt-0 space-y-4">
                      {renderCmdItem('cvs1', 'Trocar', 'switchServer', 'LIKE(text, FONETICA.trocar) && LIKE(text, FONETICA.saque)', 'caso durante a partida precisar ajustar quem está sacando', 'diga: trocar sacador')}
                      {renderCmdItem('cvs2', 'Placar', 'scoreStatus', 'LIKE(text, FONETICA.placar)', 'para anunciar o placar atual', 'diga: placar ou quanto tá')}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50/50 rounded-[2rem] overflow-hidden">
                  <button onClick={() => setIsOpenCVO(!isOpenCVO)} className="w-full px-6 py-4 flex items-center justify-between text-black active:bg-gray-100 transition-colors">
                    <span className="text-xs font-black">Comandos de voz (outros):</span>
                    {isOpenCVO ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                  {isOpenCVO && (
                    <div className="p-4 pt-0 space-y-4">
                      {renderCmdItem('cvd1', 'Parceiro', 'partnerTerm', null, 'usado na tela inicial para informar os nomes do time num só comando de voz', 'diga: [nome1] mais [nome2], ou [nome1] com [nome2]')}
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center text-violet-600"><Database size={24} /></div>
                  <div className="text-left">
                    <p className="text-base font-black text-black leading-tight">Migração Supabase</p>
                    <p className="text-[11px] font-bold text-slate-400">Copia users, partidas e ícones do Firebase para o Supabase de uma vez</p>
                  </div>
                </div>
                {migrationResult && (
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-1">
                    <p className="text-xs font-black text-green-700">Migração concluída!</p>
                    <p className="text-[11px] font-bold text-green-600">{migrationResult.users} usuários · {migrationResult.matches} partidas · {migrationResult.partners} parceiros · {migrationResult.icons} ícones</p>
                  </div>
                )}
                <button
                  onClick={executeMigrateToSupabase}
                  disabled={isMigrating}
                  className="w-full py-4 bg-violet-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {isMigrating ? <><Loader2 size={16} className="animate-spin" /> Migrando...</> : <><Database size={16} /> Migrar Firebase → Supabase</>}
                </button>
              </section>
            </div>
          </>
        )}

        {adminTab === 'users' && (
          <section className="space-y-4">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
              <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-100 text-black rounded-xl flex items-center justify-center"><User size={20}/></div><h3 className="font-black text-black">Gestão de usuários</h3></div>
              <div className="relative">
                <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchUsers()} placeholder="Buscar por e-mail..." className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 pr-12 text-sm font-bold outline-none text-black" />
                <button onClick={handleSearchUsers} className="absolute right-3 top-1/2 -translate-y-1/2 text-black">{isSearchingUsers ? <Loader2 className="animate-spin" size={18}/> : <Search size={18}/>}</button>
              </div>
            </div>

            <div className="space-y-3">
              {foundUsers.map(user => (
                <div key={user.email} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-black truncate">{user.nickname || user.name}</span>
                      {user.planType === 'premium' && <div className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1"><Star size={6} fill="currentColor"/> Premium</div>}
                    </div>
                    <span className="text-[10px] font-bold text-black block truncate">{applyGoldenRule(user.email, true)}</span>
                  </div>
                  <button onClick={() => toggleUserPremium(user)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all border ${user.planType === 'premium' ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-50 border-slate-100 text-black'}`}>
                    {user.planType === 'premium' ? 'Revogar premium' : 'Ativar premium'}
                  </button>
                </div>
              ))}
            </div>
          </section>
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
          <div className="space-y-6 animate-in fade-in">
             <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-6">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                        <Ticket size={22} />
                      </div>
                      <h3 className="font-black text-black tracking-tight leading-none">Gestão de eventos</h3>
                   </div>
                   <button onClick={() => { setEditingEvent({ pin: '', name: '', active: true, createdAt: Date.now() }); }} className="p-2 bg-amber-500 text-white rounded-xl active:scale-90 shadow-sm">
                      <Plus size={20} />
                   </button>
                </div>

                {editingEvent && (
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 space-y-5 animate-in slide-in-from-top-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-500 tracking-tight">Configurar evento</h4>
                      <button onClick={() => setEditingEvent(null)} className="p-1 text-slate-400"><X size={20}/></button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 ml-1">Pin exclusivo (ex: CarmoFev26)</label>
                        <input 
                          type="text" 
                          value={editingEvent.pin}
                          onChange={e => setEditingEvent({...editingEvent, pin: e.target.value})}
                          placeholder="Pin do evento"
                          className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 ml-1">Nome do evento</label>
                        <input 
                          type="text" 
                          value={editingEvent.name}
                          onChange={e => setEditingEvent({...editingEvent, name: e.target.value})}
                          placeholder="Nome visível"
                          className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 ml-1">Banner do evento (imagem)</label>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => bannerInputRef.current?.click()}
                            className="flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-500"
                          >
                            <ImageIcon size={16} /> Carregar capa
                          </button>
                          {editingEvent.bannerUrl && (
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                               <img src={editingEvent.bannerUrl} className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                        <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleEventBannerUpload} />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black text-slate-400">Status do evento</span>
                        <Toggle id="sw-event-active" checked={editingEvent.active} onChange={v => setEditingEvent({...editingEvent, active: v})} />
                      </div>
                    </div>

                    <Button onClick={handleSaveEvent} disabled={isSavingEvent} className="w-full !bg-amber-500 !py-4 rounded-xl font-black flex gap-2 text-white">
                      {isSavingEvent ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar evento
                    </Button>
                  </div>
                )}

                <div className="space-y-3">
                   {isLoadingEvents ? (
                     <div className="py-12 flex flex-col items-center gap-3 text-slate-300">
                        <Loader2 className="animate-spin" size={32} />
                        <span className="text-xs font-bold tracking-tight">Carregando eventos...</span>
                     </div>
                   ) : eventList.length === 0 ? (
                     <div className="bg-slate-50 rounded-3xl p-10 text-center border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold text-sm">Nenhum evento criado ainda.</p>
                     </div>
                   ) : (
                     eventList.map(ev => (
                       <div key={ev.pin} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
                          <div className="flex-1 min-w-0 pr-4">
                             <p className="font-black text-black text-sm truncate">{ev.name}</p>
                             <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] font-black text-amber-500 uppercase">{ev.pin}</p>
                                <span className="text-[8px] font-black text-slate-300">•</span>
                                <p className={`text-[8px] font-black uppercase ${ev.active ? 'text-green-500' : 'text-red-500'}`}>{ev.active ? 'Ativo' : 'Encerrado'}</p>
                             </div>
                          </div>
                          <div className="flex gap-1">
                             <button onClick={() => setEditingEvent(ev)} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 active:scale-90 transition-all">
                                <Edit3 size={16} />
                             </button>
                             <button onClick={() => setDeleteConfirm({ type: 'event', id: ev.pin })} className="p-3 bg-red-50 text-red-500 rounded-xl border border-red-100 active:scale-90 transition-all">
                                <Trash2 size={16} />
                             </button>
                          </div>
                       </div>
                     ))
                   )}
                </div>
             </section>
          </div>
        )}
        {adminTab === 'comms' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CommunicationsPanel appUrl={appUrl} adminProfile={{ name: 'Admin', nickname: 'Administrador', email: 'admin@myplacar.pro', phone: '', pin: 'admin', isProfileComplete: true, isAdmin: true }} />
          </div>
        )}
      </main>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTarget) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          if (uploadTarget.type === 'category') {
            setCategories(prev => prev.map(c => c.id === uploadTarget.id ? { ...c, url: base64 } : c));
            setIsCatSaved(false);
          } else {
            setSports(prev => prev.map(s => s.id === uploadTarget.id ? { ...s, url: base64 } : s));
            setIsSportSaved(false);
          }
        };
        reader.readAsDataURL(file);
      }} />

      <input 
        type="file" 
        ref={fileInputRefImport} 
        className="hidden" 
        accept="application/json" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !onImportData) return;
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            onImportData(result);
          };
          reader.readAsText(file);
        }} 
      />

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-4 pt-3 pb-safe flex justify-between items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button onClick={() => onNavigateToTab?.('config')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
           <ScoreboardIcon className="w-6 h-6" />
           <span className="text-[10px] font-black text-black">Início</span>
        </button>
        <button onClick={() => onOpenRules?.()} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
           <SettingsIcon size={22} className="text-black" />
           <span className="text-[10px] font-black text-black">Regras</span>
        </button>
        <button onClick={() => onNavigateToTab?.('history')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
           <Clock size={22} className="text-black" />
           <span className="text-[10px] font-black text-black">Histórico</span>
        </button>
        <button onClick={() => onNavigateToTab?.('profile')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
           <User size={22} className="text-black" />
           <span className="text-[10px] font-black text-black">Perfil</span>
        </button>
        <button onClick={onOpenMenu} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
           <Menu size={22} className="text-black" />
           <span className="text-[10px] font-black text-black">Menu</span>
        </button>
      </nav>
    </div>
  );
};
