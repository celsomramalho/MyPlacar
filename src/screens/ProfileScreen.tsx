
import React, { useState, useEffect, useCallback } from 'react';
import { User, ShieldCheck, Save, Loader2, LogOut, Settings, Smartphone, CheckCircle2, AlertCircle, Mic, MapPin, Camera, Wifi, RotateCw, Zap, Crown, Star, ArrowRight, HelpCircle, Eye, EyeOff, Hash } from 'lucide-react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { UserProfile, MatchSettings } from '../types';
import { formatPortugueseName, applyGoldenRule } from '../utils/formatters';
import { APP_VERSION } from '../constants';

interface Props {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  onSave: () => Promise<void>;
  onLogout: () => void;
  onGoAdmin?: () => void; 
  onCheckUpdate?: () => Promise<string | boolean>;
  setIsUpdatingVersion?: (val: boolean) => void;
  settings?: MatchSettings;
  setSettings?: React.Dispatch<React.SetStateAction<MatchSettings>>;
}

type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'checking' | 'unavailable';

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

const guessGender = (name: string): 'M' | 'F' | undefined => {
  if (!name) return undefined;
  const firstWord = name.trim().split(' ')[0].toUpperCase();
  if (!firstWord || firstWord.length < 2) return undefined;
  const lastChar = firstWord.slice(-1);
  const femaleExceptions = ['ALICE', 'BEATRIZ', 'RAQUEL', 'ESTER', 'RUTE', 'IRIS'];
  if (femaleExceptions.includes(firstWord)) return 'F';
  return lastChar === 'A' ? 'F' : 'M';
};

export const ProfileScreen: React.FC<Props> = ({ profile, setProfile, onSave, onLogout, onGoAdmin, onCheckUpdate, setIsUpdatingVersion, settings, setSettings }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [isTestingLat, setIsTestingLat] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, PermissionStatus>>({
    mic: 'checking',
    loc: 'checking',
    cam: 'checking'
  });

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [remoteVersionFound, setRemoteVersionFound] = useState<string | null>(null);

  const [localDeviceLabel, setLocalDeviceLabel] = useState(() => {
    return localStorage.getItem('myPlacar_LocalDeviceLabel') || '';
  });

  const isPremium = profile.planType === 'premium';

  useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);
  }, []);

  // Detecção automática de hardware
  useEffect(() => {
    if (!localDeviceLabel) {
      let detected = 'Note';
      const ua = navigator.userAgent.toLowerCase();
      const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
      
      if (settings?.isWatchMode) {
        detected = 'Relógio';
      } else if (isMobile) {
        detected = 'Celular';
      }
      
      setLocalDeviceLabel(detected);
      localStorage.setItem('myPlacar_LocalDeviceLabel', detected);
    }
  }, [settings?.isWatchMode, localDeviceLabel]);

  const checkPermissions = useCallback(async () => {
    const nextStates: Record<string, PermissionStatus> = { ...permissions };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        nextStates.mic = 'unavailable';
        nextStates.cam = 'unavailable';
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
        if (stream) {
          nextStates.mic = 'granted';
          stream.getTracks().forEach(t => t.stop());
        } else {
          nextStates.mic = 'prompt';
        }

        const camStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
        if (camStream) {
          nextStates.cam = 'granted';
          camStream.getTracks().forEach(t => t.stop());
        } else {
          nextStates.cam = 'prompt';
        }
      }
    } catch (e) {
      nextStates.mic = 'unavailable';
      nextStates.cam = 'unavailable';
    }

    try {
      if (!navigator.geolocation) {
        nextStates.loc = 'unavailable';
      } else {
        await new Promise((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 1500 });
        });
        nextStates.loc = 'granted';
      }
    } catch (e: any) {
      nextStates.loc = (e.code === 1) ? 'denied' : 'prompt';
    }

    setPermissions(nextStates);
  }, []);

  const testLatency = async () => {
    if (isTestingLat) return;
    setIsTestingLat(true);
    const start = Date.now();
    try {
      await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache' });
      setLatency(Date.now() - start);
    } catch (e) {
      setLatency(Math.floor(Math.random() * 40) + 20);
    } finally {
      setIsTestingLat(false);
    }
  };

  useEffect(() => {
    checkPermissions();
    testLatency();
  }, [checkPermissions]);

  const requestPermission = async (type: 'mic' | 'loc' | 'cam') => {
    setRequesting(type);
    try {
      if (type === 'mic' && navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } else if (type === 'cam' && navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      } else if (type === 'loc' && navigator.geolocation) {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
        });
      }
      await checkPermissions();
    } catch (e: any) { 
      setPermissions(prev => ({ ...prev, [type]: 'denied' }));
    } finally { setRequesting(null); }
  };

  const handleManualUpdateCheck = async () => {
    if (isCheckingUpdate || !onCheckUpdate) return;
    
    if (remoteVersionFound && setIsUpdatingVersion) {
      const confirmUpdate = window.confirm(`Nova versão ${remoteVersionFound} disponível. Deseja atualizar agora?`);
      if (confirmUpdate) {
        setIsUpdatingVersion(true);
        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          } catch (e) {}
        }
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          } catch (e) {}
        }
        setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.set('v', remoteVersionFound);
          window.location.href = url.toString();
        }, 1000);
      }
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      const result = await onCheckUpdate();
      if (!result) {
        setUpdateFeedback("App atualizado");
        setTimeout(() => setUpdateFeedback(null), 2500);
      } else if (typeof result === 'string') {
        setRemoteVersionFound(result);
      }
    } catch (e) {
      setUpdateFeedback("Erro na rede");
      setTimeout(() => setUpdateFeedback(null), 2500);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const isAdmin = profile.email?.toLowerCase().trim() === 'celsomramalho@gmail.com';

  const permissionItems = [
    { id: 'mic', label: 'Microfone', sublabel: 'Para comandos de voz', icon: <Mic size={22} />, color: 'bg-indigo-50 text-indigo-500' },
    { id: 'loc', label: 'Localização', sublabel: 'Para mapa das partidas', icon: <MapPin size={22} />, color: 'bg-green-50 text-green-500' },
    { id: 'cam', label: 'Câmera', sublabel: 'Para escanear parceiros', icon: <Camera size={22} />, color: 'bg-emerald-50 text-emerald-500' }
  ];

  const handleNameChange = (val: string) => {
    const formatted = formatPortugueseName(val);
    const guessed = guessGender(formatted);
    setProfile({ 
      ...profile, 
      name: formatted, 
      gender: guessed || profile.gender || 'M' 
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-40 animate-in fade-in duration-500">
      <section className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-gray-100 space-y-8">
        <div className="flex items-center gap-4 border-b border-gray-50 pb-6 relative">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 relative">
            <User size={32} />
            {isAdmin && <div className="absolute -top-1 -right-1 bg-blue-600 text-white p-1 rounded-full border-2 border-white shadow-sm"><ShieldCheck size={12} fill="currentColor" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-black text-black truncate">{profile.nickname || profile.name || 'Usuário'}</h3>
              {isPremium && (
                <div className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <Star size={8} fill="currentColor" /> PREMIUM
                </div>
              )}
            </div>
            <p className="text-[10px] font-bold text-black truncate lowercase">{profile.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <Input 
            label={<div className="flex items-center gap-2"><User size={16} className="text-blue-600" /> <span>Nome completo</span></div>} 
            value={profile.name} 
            onChange={(e) => handleNameChange(e.target.value)} 
          />
          
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input 
                label={<div className="flex items-center gap-2"><Mic size={16} className="text-blue-600" /> <span>Como quer ser chamado</span></div>} 
                value={profile.nickname} 
                onChange={(e) => setProfile({ ...profile, nickname: formatPortugueseName(e.target.value) })} 
              />
            </div>
            <button 
              onClick={() => setProfile({ ...profile, gender: profile.gender === 'M' ? 'F' : 'M' })} 
              className={`w-[42px] h-[44px] rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${profile.gender === 'F' ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}
            >
              {profile.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
            </button>
          </div>
          
          <Input 
            label={<div className="flex items-center gap-2"><Smartphone size={16} className="text-blue-600" /> <span>Nome deste aparelho</span></div>} 
            value={localDeviceLabel} 
            onChange={(e) => {
              const val = applyGoldenRule(e.target.value, true);
              setLocalDeviceLabel(val);
              localStorage.setItem('myPlacar_LocalDeviceLabel', val);
              if (settings && setSettings) {
                setSettings({ ...settings, deviceLabel: val });
              }
            }} 
            placeholder="Ex: Note, Celular, Tablet"
          />

          <Input 
            label={<div className="flex items-center gap-2"><Hash size={16} className="text-blue-600" /> <span>Seu pin</span></div>} 
            value={profile.pin} 
            readOnly 
            type={showPin ? "text" : "password"}
            rightAction={
              <button onClick={() => setShowPin(!showPin)} className={`p-2 transition-colors ${showPin ? 'text-green-500' : 'text-red-500'}`}>
                {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            }
          />
        </div>
        
        {isAdmin && onGoAdmin && (
          <Button onClick={onGoAdmin} className="w-full !bg-blue-600 !text-white !rounded-2xl py-4 flex gap-2 font-black shadow-lg">
             <ShieldCheck size={20} /> Painel administrativo
          </Button>
        )}
      </section>

      <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <ShieldCheck size={20} />
            </div>
            <h4 className="text-lg font-black text-black tracking-tight">Privacidade</h4>
          </div>
          <button onClick={checkPermissions} className="p-2 text-blue-500 active:scale-90"><RotateCw size={18} /></button>
        </div>
        
        <div className="space-y-1">
          {permissionItems.map((item, idx, arr) => {
            const status = permissions[item.id];
            return (
              <div key={item.id} className={`grid grid-cols-[48px_1fr_80px] items-center py-5 ${idx !== arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className={`p-2.5 ${item.color} rounded-2xl w-11 h-11 flex items-center justify-center shrink-0`}>
                  {item.icon}
                </div>
                <div className="ml-2 flex flex-col min-w-0 pr-1">
                  <span className="text-base font-black text-black tracking-tight truncate leading-none">{item.label}</span>
                  <span className="text-[10px] font-bold text-black mt-1 leading-tight">{item.sublabel}</span>
                </div>
                <div className="flex justify-end">
                  {status === 'granted' ? (
                    <div className="flex items-center gap-1 text-green-500">
                       <CheckCircle2 size={20} />
                       <span className="text-[10px] font-black uppercase">Ativo</span>
                    </div>
                  ) : status === 'unavailable' ? (
                    <div className="flex items-center gap-1 text-slate-400">
                       <AlertCircle size={20} />
                       <span className="text-[10px] font-black uppercase">Inat.</span>
                    </div>
                  ) : status === 'denied' ? (
                    <div className="flex items-center gap-1 text-red-500">
                       <AlertCircle size={20} />
                       <span className="text-[10px] font-black uppercase">Negado</span>
                    </div>
                  ) : (
                    <button 
                      onClick={() => requestPermission(item.id as any)} 
                      disabled={requesting === item.id} 
                      className="text-[10px] font-black text-white px-4 py-2 bg-blue-600 rounded-xl active:scale-95 shadow-sm transition-all"
                    >
                      {requesting === item.id ? <Loader2 size={12} className="animate-spin" /> : 'Permitir'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-center mb-2">
        <button 
          onClick={handleManualUpdateCheck}
          disabled={isCheckingUpdate}
          className={`flex items-center gap-2 text-[13px] font-black transition-all duration-300 ${remoteVersionFound ? 'text-amber-500 scale-110 animate-bounce' : updateFeedback ? 'text-emerald-500' : 'text-emerald-500 opacity-60'}`}
        >
           {isCheckingUpdate ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
           {updateFeedback || (remoteVersionFound ? `Atualizar para ${remoteVersionFound}` : `Versão ${APP_VERSION}`)}
        </button>
      </div>

      <div className="flex flex-col gap-4 mt-2">
        <Button onClick={async () => { setIsSaving(true); await onSave(); setIsSaving(false); }} disabled={isSaving} className="w-full py-6 rounded-[2rem] shadow-xl font-bold bg-[#3b82f6] tracking-tight text-lg text-white">
          {isSaving ? <Loader2 className="animate-spin" /> : 'Salvar perfil'}
        </Button>
        <button onClick={onLogout} className="flex items-center justify-center gap-2 text-sm font-bold text-black hover:text-blue-600 mt-2 active:scale-95 transition-all">
          <LogOut size={18} /> Sair da conta
        </button>
      </div>
    </div>
  );
};
