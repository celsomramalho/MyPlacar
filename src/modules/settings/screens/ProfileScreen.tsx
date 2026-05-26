
import React, { useState, useEffect, useCallback } from 'react';
import { User, ShieldCheck, Save, Loader2, LogOut, Smartphone, Laptop, Watch, CheckCircle2, AlertCircle, Mic, MapPin, Camera, RotateCw, Star, Eye, EyeOff, Hash, Lock, Check as CheckIcon, Shield, Fingerprint } from 'lucide-react';
import { Input } from '@shared/components/Input';
import { Button } from '@shared/components/Button';
import { MatchSettings } from '../../../types';
import type { UserProfile } from '@modules/auth/types';
import { validatePassword } from '@modules/auth/services/passwordPolicy';
import { formatPortugueseName, applyGoldenRule } from '@shared/utils/formatters';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { APP_VERSION } from '../../../constants';
import { getAuthInstance, getDb, updateUserProfileFields } from '@infra/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import {
  detectDeviceLabel,
  readLocalDeviceLabel,
  saveLocalDeviceLabel,
} from '../services/profileDevice';
import {
  checkProfilePermissions,
  measureProfileLatency,
  requestProfilePermission,
  type ProfilePermissionStatus,
  type RequestableProfilePermission,
} from '../services/profilePermissions';
import { reloadAppWithFreshVersion } from '../services/profileVersionUpdate';

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
  onVersionTap?: () => void;
}

type PermissionType = 'mic' | 'loc' | 'cam' | 'passkey';

const getDeviceIcon = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('rel')) return Watch;
  if (l.includes('cel') || l.includes('phone')) return Smartphone;
  return Laptop;
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

export const ProfileScreen: React.FC<Props> = ({ profile, setProfile, onSave, onLogout, onGoAdmin, onCheckUpdate, setIsUpdatingVersion, settings, setSettings, onVersionTap }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [confirmResetPasskey, setConfirmResetPasskey] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [isTestingLat, setIsTestingLat] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, ProfilePermissionStatus>>({
    mic: 'checking',
    loc: 'checking',
    cam: 'checking'
  });

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [remoteVersionFound, setRemoteVersionFound] = useState<string | null>(null);

  const [localDeviceLabel, setLocalDeviceLabel] = useState(() => {
    return readLocalDeviceLabel();
  });

  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const isPremium = profile.planType === 'premium';

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) return;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const hasPassword = user.providerData.some(p => p.providerId === 'password');
        if (hasPassword && (profile.authMethod === 'pin' || !profile.authMethod)) {
          const updated: UserProfile = { ...profile, authMethod: 'password' };
          setProfile(updated);
          try {
            localStorage.setItem('myPlacarUserProfile', JSON.stringify(updated));
          } catch (e) {}
          setIsMigrationModalOpen(false);
          return;
        }
      }
      
      if (profile.authMethod === 'pin' || !profile.authMethod) {
        setIsMigrationModalOpen(true);
      } else {
        setIsMigrationModalOpen(false);
      }
    });

    return () => unsubscribe();
  }, [profile.authMethod, profile.email]);

  const passwordValidation = validatePassword(newPassword);

  const handleCreatePassword = async () => {
    if (!passwordValidation.isValid) return;
    
    setIsMigrating(true);
    setMigrationError(null);
    try {
      const auth = getAuthInstance();
      const db = getDb();
      if (!auth || !db) throw new Error("Erro de conexão com o servidor.");

      const cleanEmail = profile.email.toLowerCase().trim();

      try {
        await createUserWithEmailAndPassword(auth, cleanEmail, newPassword);
      } catch (unknownError) {
        const authError = unknownError as { code?: string; message?: string };
        console.log("Firebase Auth Error Details:", { code: authError.code, message: authError.message, full: unknownError });
        if (authError.code === 'auth/email-already-in-use') {
          try {
            await signInWithEmailAndPassword(auth, cleanEmail, newPassword);
          } catch (signInError) {
            const signInAuthError = signInError as { code?: string; message?: string };
            if (signInAuthError.code === 'auth/wrong-password' || signInAuthError.code === 'auth/invalid-credential') {
              throw new Error("Este e-mail já possui uma senha cadastrada diferente da digitada.");
            }
            throw signInError;
          }
        } else if (authError.code === 'auth/invalid-email') {
          throw new Error("O formato do e-mail é inválido.");
        } else if (authError.code === 'auth/network-request-failed') {
          throw new Error("Falha na conexão com a internet. Verifique seu sinal.");
        } else if (authError.code === 'auth/weak-password') {
          throw new Error("A senha escolhida é muito fraca para o sistema.");
        } else if (authError.message?.includes('signup-are-blocked') || authError.code === 'auth/operation-not-allowed') {
          throw new Error(`O cadastro de novas senhas está temporariamente desativado pelo administrador. (Erro: ${authError.code})`);
        } else {
          throw new Error(`${authError.message || 'Erro desconhecido'} (Código: ${authError.code || 'sem código'})`);
        }
      }

      // Pequena pausa para garantir que a sessão do Firebase Auth seja propagada
      await new Promise(resolve => setTimeout(resolve, 500));

      const updatedProfile: UserProfile = { ...profile, authMethod: 'password' };
      setProfile(updatedProfile);
      
      // Persistência imediata no localStorage e Firestore
      try {
        localStorage.setItem('myPlacarUserProfile', JSON.stringify(updatedProfile));
        await updateUserProfileFields(db, cleanEmail, {
          authMethod: 'password'
        });
      } catch (e) {
        console.error("Erro ao persistir migração:", e);
      }
      
      setIsMigrationModalOpen(false);
    } catch (unknownMigrationError) {
      const migrationError = unknownMigrationError as { message?: string };
      console.error("Erro na migração:", migrationError);
      setMigrationError(migrationError.message || "Erro ao processar sua nova senha. Tente novamente.");
    } finally {
      setIsMigrating(false);
    }
  };

  // Detecção automática de hardware
  useEffect(() => {
    if (!localDeviceLabel) {
      const detected = detectDeviceLabel(settings?.isWatchMode);
      setLocalDeviceLabel(detected);
      saveLocalDeviceLabel(detected);
    }
  }, [settings?.isWatchMode, localDeviceLabel]);

  const checkPermissions = useCallback(async () => {
    const nextStates = await checkProfilePermissions();
    setPermissions(prev => ({ ...prev, ...nextStates }));
  }, []);

  const testLatency = async () => {
    if (isTestingLat) return;
    setIsTestingLat(true);
    try {
      setLatency(await measureProfileLatency());
    } finally {
      setIsTestingLat(false);
    }
  };

  useEffect(() => {
    checkPermissions();
    testLatency();
  }, [checkPermissions]);

  const requestPermission = async (type: RequestableProfilePermission) => {
    setRequesting(type);
    try {
      await requestProfilePermission(type);
      await checkPermissions();
    } catch {
      setPermissions(prev => ({ ...prev, [type]: 'denied' }));
    } finally { setRequesting(null); }
  };

  const handleManualUpdateCheck = async () => {
    if (isCheckingUpdate || !onCheckUpdate) return;
    
    if (remoteVersionFound && setIsUpdatingVersion) {
      const confirmUpdate = globalThis.confirm(`Nova versão ${remoteVersionFound} disponível. Deseja atualizar agora?`);
      if (confirmUpdate) {
        setIsUpdatingVersion(true);
        await reloadAppWithFreshVersion(remoteVersionFound);
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
    { id: 'mic', label: 'Microfone', sublabel: 'Para comandos de voz', icon: <Mic size={22} />, color: 'bg-blue-50 text-blue-500' },
    { id: 'loc', label: 'Localização', sublabel: 'Para mapa das partidas', icon: <MapPin size={22} />, color: 'bg-green-50 text-green-500' },
    { id: 'cam', label: 'Câmera', sublabel: 'Para escanear parceiros', icon: <Camera size={22} />, color: 'bg-emerald-50 text-emerald-500' },
    { id: 'passkey', label: 'Biometria', sublabel: 'Login sem senha', icon: <Fingerprint size={22} />, color: 'bg-blue-50 text-blue-500' }
  ];

  const handleRegisterPasskey = async (isReset = false) => {
    if (!globalThis.PublicKeyCredential) {
      alert("Seu navegador ou dispositivo não suporta biometria.");
      return;
    }

    setIsRegisteringPasskey(true);
    setConfirmResetPasskey(false);
    try {
      // Se for recadastro, limpa a chave antiga do Firestore antes de gerar uma nova
      if (isReset && profile.email) {
        try {
          const db = getDb();
          if (db) {
            await updateUserProfileFields(db, profile.email, {
              passkeyCredentialId: "",
              passkeyPublicKey: ""
            });
          }
        } catch (clearErr) {
          console.warn("Myplacar: Não foi possível limpar chave antiga.", clearErr);
        }
      }

      const challenge = new Uint8Array(32);
      globalThis.crypto.getRandomValues(challenge);

      const userId = profile.email || 'user';
      const userHandle = new TextEncoder().encode(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: "MyPlacar",
          id: globalThis.location.hostname,
        },
        user: {
          id: userHandle,
          name: userId,
          displayName: profile.nickname || profile.name || userId,
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        timeout: 60000,
        attestation: "none",
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential | null;

      if (credential && credential.rawId) {
        const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const updatedProfile = {
          ...profile,
          passkeyCredentialId: rawId,
          passkeyPublicKey: "registered"
        };
        setProfile(updatedProfile);

        // Salvamento imediato para garantir persistência
        try {
          localStorage.setItem('myPlacarUserProfile', JSON.stringify(updatedProfile));
          const db = getDb();
          if (db && profile.email) {
            await updateUserProfileFields(db, profile.email, {
              passkeyCredentialId: rawId,
              passkeyPublicKey: "registered"
            });
          }
        } catch (saveErr) {
          console.error("Myplacar: Erro ao salvar biometria imediatamente.", saveErr);
        }

        alert(isReset ? "Biometria recadastrada com sucesso!" : "Biometria cadastrada e salva com sucesso!");
      }
    } catch (unknownErr) {
      const err = unknownErr as { name?: string; message?: string };
      console.error(err);
      if (err.name === 'InvalidStateError') {
        alert("Esta chave já está cadastrada neste dispositivo. Tente usar outro método de autenticação biométrica.");
      } else if (err.name === 'NotAllowedError') {
        alert("Recadastro cancelado pelo usuário.");
      } else {
        alert("Não foi possível habilitar a biometria neste dispositivo.");
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

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
            <p className="text-xs font-bold text-black truncate lowercase">{profile.email}</p>
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
          
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input 
                label={<div className="flex items-center gap-2"><Smartphone size={16} className="text-blue-600" /> <span>Nome deste aparelho</span></div>} 
                value={localDeviceLabel} 
                onChange={(e) => {
                  const val = applyGoldenRule(e.target.value, true);
                  setLocalDeviceLabel(val);
                  saveLocalDeviceLabel(val);
                  if (settings && setSettings) {
                    setSettings({ ...settings, deviceLabel: val });
                  }
                }} 
                placeholder="Ex: Note, Celular, Tablet"
              />
            </div>
            <div className="w-[42px] h-[44px] rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
              {React.createElement(getDeviceIcon(localDeviceLabel), { size: 14 })}
            </div>
          </div>

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
                  {item.id === 'passkey' ? (
                    profile.passkeyCredentialId ? (
                      confirmResetPasskey ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setConfirmResetPasskey(false)}
                            className="text-[10px] font-black text-slate-500 px-3 py-2 border border-slate-200 rounded-xl active:scale-95 transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleRegisterPasskey(true)}
                            disabled={isRegisteringPasskey}
                            className="text-[10px] font-black text-white px-3 py-2 bg-red-500 rounded-xl active:scale-95 shadow-sm transition-all"
                          >
                            {isRegisteringPasskey ? <Loader2 size={12} className="animate-spin" /> : 'Confirmar'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-blue-500">
                            <CheckCircle2 size={16} />
                            <span className="text-[10px] font-black uppercase">Ativo</span>
                          </div>
                          <button
                            onClick={() => setConfirmResetPasskey(true)}
                            className="text-[10px] font-black text-slate-500 px-3 py-2 border border-slate-200 rounded-xl active:scale-95 transition-all"
                          >
                            Recadastrar
                          </button>
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => handleRegisterPasskey(false)}
                        disabled={isRegisteringPasskey}
                        className="text-[10px] font-black text-white px-4 py-2 bg-blue-600 rounded-xl active:scale-95 shadow-sm transition-all"
                      >
                        {isRegisteringPasskey ? <Loader2 size={12} className="animate-spin" /> : 'Habilitar'}
                      </button>
                    )
                  ) : (
                    status === 'granted' ? (
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
                        onClick={() => requestPermission(item.id as 'mic' | 'loc' | 'cam')} 
                        disabled={requesting === item.id} 
                        className="text-[10px] font-black text-white px-4 py-2 bg-blue-600 rounded-xl active:scale-95 shadow-sm transition-all"
                      >
                        {requesting === item.id ? <Loader2 size={12} className="animate-spin" /> : 'Permitir'}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4 mt-2">
        {/* Modal de Migração */}
        {isMigrationModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner">
                  <ShieldCheck size={40} strokeWidth={2.5} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-black tracking-tight">Segurança reforçada</h3>
                  <p className="text-sm font-bold text-slate-500 leading-relaxed">
                    Estamos melhorando a segurança do MyPlacar. Agora você precisa criar uma senha forte para acessar sua conta.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <Lock size={16} className="text-blue-600" />
                    <label className="text-[13px] font-bold text-black leading-tight">Crie sua nova senha</label>
                  </div>
                  <Input 
                    type={showNewPassword ? "text" : "password"} 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)}
                    className="h-16 text-lg font-bold rounded-3xl"
                    placeholder="Sua senha forte"
                    rightAction={<button onClick={() => setShowNewPassword(!showNewPassword)} className="p-3 text-slate-400">{showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>}
                  />
                  
                  {/* Indicador de força da senha */}
                  <div className="flex gap-1.5 px-1 mt-2">
                    {[1, 2, 3, 4].map((step) => {
                      const strength = [
                        passwordValidation.hasMinLength,
                        passwordValidation.hasUpper,
                        passwordValidation.hasLower,
                        passwordValidation.hasSpecial
                      ].filter(Boolean).length;
                      
                      let colorClass = "bg-slate-100";
                      if (step <= strength) {
                        if (strength <= 1) colorClass = "bg-red-500";
                        else if (strength <= 2) colorClass = "bg-amber-500";
                        else if (strength <= 3) colorClass = "bg-blue-500";
                        else colorClass = "bg-emerald-500";
                      }
                      
                      return (
                        <div 
                          key={step} 
                          className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${colorClass}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-3xl p-5 space-y-3 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitos obrigatórios</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasMinLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasMinLength ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                        {passwordValidation.hasMinLength && <CheckIcon size={10} />}
                      </div>
                      6+ caracteres
                    </div>
                    <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasUpper ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasUpper ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                        {passwordValidation.hasUpper && <CheckIcon size={10} />}
                      </div>
                      1 Maiúscula
                    </div>
                    <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasLower ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasLower ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                        {passwordValidation.hasLower && <CheckIcon size={10} />}
                      </div>
                      1 Minúscula
                    </div>
                    <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasSpecial ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasSpecial ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                        {passwordValidation.hasSpecial && <CheckIcon size={10} />}
                      </div>
                      1 Especial
                    </div>
                  </div>
                </div>

                {migrationError && (
                  <div className="p-4 bg-red-50 text-red-500 rounded-2xl text-[11px] font-bold border border-red-100 flex items-center gap-2">
                    <AlertCircle size={14} /> {migrationError}
                  </div>
                )}

                <Button 
                  onClick={handleCreatePassword}
                  disabled={!passwordValidation.isValid || isMigrating}
                  className="w-full py-6 rounded-4xl font-black shadow-xl text-lg bg-blue-600 text-white flex items-center justify-center gap-3"
                >
                  {isMigrating ? <Loader2 className="animate-spin" /> : <><Shield size={20} /> Ativar nova senha</>}
                </Button>
                
                <p className="text-[10px] font-bold text-slate-400 text-center px-4">
                  Seu PIN atual continuará funcionando apenas para identificação rápida entre parceiros.
                </p>
              </div>
            </div>
          </div>
        )}

        <Button 
          onClick={async () => { setIsSaving(true); await onSave(); setIsSaving(false); }} 
          disabled={isSaving} 
          className="w-full py-6 rounded-[2rem] shadow-xl font-black bg-blue-600 tracking-tight text-lg text-white flex items-center justify-center gap-4"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <><Save size={24} /> Salvar perfil</>}
        </Button>
      </div>
    </div>
  );
};
