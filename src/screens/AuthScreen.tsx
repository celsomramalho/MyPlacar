import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, CheckCircle2, AlertCircle, ArrowRight, UserPlus, LogIn, MailCheck, ExternalLink, ShieldCheck, Eye, EyeOff, Send, SearchCheck, KeyRound, Sparkles, Ticket, RotateCw, ArrowLeft, Hash, User as UserIcon, Check as CheckIcon, Trophy } from 'lucide-react';
import { Input } from '../components/Input.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { UserProfile } from '../types.ts';
import { getDb } from '../firebase.ts';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, Firestore } from 'firebase/firestore';
import { ScoreboardIcon } from '../components/ScoreboardIcon.tsx';
import { formatPortugueseName, applyGoldenRule } from '../utils/formatters.ts';
import { APP_VERSION } from '../constants.ts';

interface Props {
  onAuthSuccess: (profile: UserProfile, stayConnected: boolean) => void;
  onCheckUpdate: () => Promise<string | boolean>;
  setIsUpdatingVersion: (val: boolean) => void;
  initialReferralPin?: string;
}

export const AuthScreen: React.FC<Props> = ({ onAuthSuccess, onCheckUpdate, setIsUpdatingVersion, initialReferralPin = '' }) => {
  const [showSplash, setShowSplash] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [remoteVersionFound, setRemoteVersionFound] = useState<string | null>(null);
  
  const [mode, setMode] = useState<'login' | 'register' | 'confirm_email' | 'verifying' | 'recovery_sent'>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('ref') || params.get('pin_ref') || params.get('joinEvent')) ? 'register' : 'login';
  });

  const [email, setEmail] = useState(() => localStorage.getItem('myPlacarSavedEmail') || '');
  const [pin, setPin] = useState(() => localStorage.getItem('myPlacarSavedPin') || ''); 
  
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedVerifyCode, setGeneratedVerifyCode] = useState(() => localStorage.getItem('myPlacarPendingVerifyCode') || '');
  const [showPin, setShowPin] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('myPlacarPendingName') || '');
  
  const [referralPin, setReferralPin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return initialReferralPin || params.get('refPin') || params.get('pin_ref') || params.get('ref') || '';
  });
  const [lookupName, setLookupName] = useState('');
  const [isSearchingReferral, setIsSearchingReferral] = useState(false);
  const [eventDetails, setEventDetails] = useState<{ name: string, bannerUrl?: string } | null>(null);
  
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAutoConfirming, setIsAutoConfirming] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initialCheck = async () => {
      try {
        const result = await onCheckUpdate();
        if (typeof result === 'string') {
          setRemoteVersionFound(result);
        }
      } catch (e) {
        console.error("Erro na verificação inicial:", e);
      }
    };
    initialCheck();
  }, [onCheckUpdate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventPin = params.get('joinEvent');
    if (eventPin) {
        const db = getDb();
        if (db) {
            getDoc(doc(db as Firestore, "events", eventPin)).then(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.active) {
                      setEventDetails({ name: data.name, bannerUrl: data.bannerUrl });
                    }
                }
            });
        }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get('email');
    const urlCode = params.get('code');

    if (urlEmail && urlCode) {
        setEmail(urlEmail);
        setVerificationCode(urlCode);
        setMode('confirm_email');
        setIsAutoConfirming(true);
        setIsLoading(true);
        setStatusText('Verificando seu e-mail automaticamente...');
        
        localStorage.setItem('myPlacarPendingVerifyCode', urlCode);
        setGeneratedVerifyCode(urlCode);

        try {
            window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {
            console.warn("History API not available or blocked:", e);
        }

        const autoConfirmTimer = setTimeout(async () => {
            try {
                await handleConfirmEmailInternal(urlEmail, urlCode);
            } catch (error) {
                setError("Erro ao verificar automaticamente, tente digitar o código manualmente.");
            } finally {
                setIsAutoConfirming(false);
                setIsLoading(false);
            }
        }, 300);
        return () => clearTimeout(autoConfirmTimer);
    }
  }, []);


  useEffect(() => {
    const lookupReferrer = async () => {
      const clean = referralPin.toUpperCase().trim();
      if (clean.length === 5) {
        setIsSearchingReferral(true);
        try {
          const db = getDb();
          if (!db) return;
          const q = query(collection(db as any, "users"), where("pin", "==", clean));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            setLookupName(`${data.nickname || data.name.split(' ')[0]} te convidou`);
          } else {
            setLookupName('Pin não localizado');
          }
        } catch (e) {
          setLookupName('Pin não localizado');
        } finally {
          setIsSearchingReferral(false);
        }
      } else {
        setLookupName('');
      }
    };
    lookupReferrer();
  }, [referralPin]);

  useEffect(() => {
    setError(null);
  }, [mode]);

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

  const sendEmail = async (templateId: string, templateParams: any) => {
    const data = {
      service_id: 'jqwq howd ypts pfho', 
      template_id: templateId,
      user_id: 'A7y2Vx7kzDN-rI1yL', 
      template_params: templateParams,
    };

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      return response.ok;
    } catch (error) {
      console.error('Erro EmailJS:', error);
      return false;
    }
  };

  const handleLogin = async () => {
    if (!email || !pin) {
      setError("Preencha seu e-mail e pin de acesso.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusText('Autenticando...');
    try {
      const db = getDb();
      if (!db) throw new Error("Erro de conexão.");
      const cleanEmail = email.toLowerCase().trim();
      const userSnap = await getDoc(doc(db as Firestore, "users", cleanEmail));
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        if (userData.pin === pin.toUpperCase().trim()) {
          if (rememberMe) {
            localStorage.setItem('myPlacarSavedEmail', cleanEmail);
            localStorage.setItem('myPlacarSavedPin', pin.toUpperCase().trim());
          } else {
            localStorage.removeItem('myPlacarSavedEmail');
            localStorage.removeItem('myPlacarSavedPin');
          }
          onAuthSuccess(userData, rememberMe);
        } else {
          setError("Pin incorreto, tente novamente.");
        }
      } else {
        setError("E-mail não localizado no sistema.");
      }
    } catch (e: any) {
      setError("Não foi possível realizar o login agora.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRegister = async () => {
    if (!email || !name) {
      setError("Preencha seu nome e e-mail para continuar.");
      return;
    }

    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length < 2) {
      setError("Por favor, digite seu nome e sobrenome.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Validando seu cadastro...');
    try {
      const db = getDb();
      if (!db) throw new Error("Erro de conexão.");
      const cleanEmail = email.toLowerCase().trim();
      const userRef = doc(db as Firestore, "users", cleanEmail);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setError("Este e-mail já possui cadastro. Use a recuperação de pin.");
        return;
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      localStorage.setItem('myPlacarPendingVerifyCode', code);
      localStorage.setItem('myPlacarPendingName', name);
      localStorage.setItem('myPlacarSavedEmail', cleanEmail);
      setGeneratedVerifyCode(code);
      
      setStatusText('Enviando seu código por e-mail...');

      const appBaseUrl = 'https://myplacar-244305581318.us-west1.run.app';
      const confirmationLink = `${appBaseUrl}/?email=${encodeURIComponent(cleanEmail)}&code=${code}`;

      const emailSent = await sendEmail('template_v9fhxz3', {
        to_name: name.split(' ')[0],
        email: cleanEmail,
        pin_code: code,
        confirmation_link: confirmationLink,
        app_access_link: appBaseUrl,
        subject: "Código de verificação - MyPlacar",
        from_name: "MyPlacar"
      });

      if (emailSent) {
        setMode('confirm_email');
      } else {
        throw new Error("Não foi possível enviar o e-mail agora.");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao processar seu cadastro.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmEmailInternal = async (targetEmail: string, code: string) => {
    const expectedCode = localStorage.getItem('myPlacarPendingVerifyCode') || generatedVerifyCode;
    
    if (code !== expectedCode) {
      setError("Código de segurança incorreto.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Finalizando seu cadastro...');
    
    try {
      const db = getDb();
      if (!db) throw new Error("Erro de conexão.");
      
      const cleanEmail = targetEmail.toLowerCase().trim();
      const storedName = localStorage.getItem('myPlacarPendingName') || name || "Jogador";
      const finalPin = Math.random().toString(36).substring(2, 7).toUpperCase();
      
      const newProfile = {
        name: formatPortugueseName(storedName),
        nickname: storedName.split(' ')[0],
        email: cleanEmail,
        phone: '', 
        pin: finalPin,
        isProfileComplete: true,
        emailVerified: true,
        referredByPin: referralPin.toUpperCase().trim(),
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db as Firestore, "users", cleanEmail), newProfile);
      
      const appBaseUrl = 'https://myplacar-244305581318.us-west1.run.app'; 
      await sendEmail('template_wn0f65h', {
        to_name: newProfile.nickname,
        email: cleanEmail,
        pin_code: finalPin,
        app_access_link: appBaseUrl,
        subject: "Seu pin de acesso - MyPlacar",
        from_name: "MyPlacar"
      });

      setMode('verifying');
      localStorage.removeItem('myPlacarPendingReferral');
      localStorage.removeItem('myPlacarPendingReferralPin');
      localStorage.removeItem('myPlacarPendingVerifyCode');
      localStorage.removeItem('myPlacarPendingName');
      
      setTimeout(() => onAuthSuccess(newProfile as unknown as UserProfile, rememberMe), 2500);
    } catch (e: any) {
      setError("Erro ao salvar seus dados. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmEmail = () => {
    handleConfirmEmailInternal(email, verificationCode);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Digite seu e-mail para recuperar o pin.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusText('Processando sua recuperação...');
    try {
      const db = getDb();
      if (!db) throw new Error("Erro de conexão.");
      const cleanEmail = email.toLowerCase().trim();
      const userRef = doc(db as Firestore, "users", cleanEmail);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("E-mail não localizado.");
      }
      
      const userData = userSnap.data();
      const userPin = userData?.pin || '';
      const userName = userData?.nickname || "Jogador";

      setStatusText('Enviando seu pin por e-mail...');
      const appBaseUrl = 'https://myplacar-244305581318.us-west1.run.app'; 
      const emailSent = await sendEmail('template_wn0f65h', {
        to_name: userName,
        email: cleanEmail,
        pin_code: userPin,
        app_access_link: appBaseUrl,
        subject: "Recuperação de pin - MyPlacar",
        from_name: "MyPlacar"
      });

      if (emailSent) {
        setMode('recovery_sent');
      } else {
        throw new Error("Não foi possível enviar o e-mail.");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao recuperar seu pin.");
    } finally {
      setIsLoading(false);
    }
  };

  if (showSplash) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-1000 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
          <ScoreboardIcon className="w-56 h-56 mb-8 drop-shadow-[0_25px_50px_rgba(0,0,0,0.15)] animate-bounce" style={{animationDuration: '3s'}} />
          <div className="text-center space-y-4">
            <h1 className="text-[48px] font-black text-black tracking-tighter leading-none font-display">MyPlacar Pro</h1>
            <p className="text-[17px] font-bold text-black max-w-[280px]">O jogo em suas mãos</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col p-8 animate-in slide-in-from-bottom-6 duration-700 overflow-y-auto no-scrollbar">
      <div className="flex flex-col items-center justify-center mb-10 mt-6 text-center">
        <ScoreboardIcon className="w-32 h-32 mb-6 drop-shadow-2xl" />
        <h1 className="text-[36px] font-black text-black tracking-tighter leading-none font-display">MyPlacar Pro</h1>
      </div>

      {eventDetails && (
        <div className="max-w-md mx-auto w-full mb-10 animate-in zoom-in duration-500">
          <p className="text-[11px] font-black text-slate-400 mb-3 px-2">Inscrição para o evento:</p>
          <div className="bg-white rounded-[2rem] overflow-hidden shadow-xl border border-slate-100 relative group">
             {eventDetails.bannerUrl ? (
                <img src={eventDetails.bannerUrl} className="w-full h-32 object-cover" alt="" />
             ) : (
                <div className="w-full h-24 bg-slate-50 flex items-center justify-center">
                   <Trophy size={32} className="text-amber-500 opacity-20" />
                </div>
             )}
             <div className="p-4 bg-white">
                <p className="text-sm font-black text-black truncate">{eventDetails.name}</p>
             </div>
          </div>
        </div>
      )}

      <div className="space-y-6 flex-1 max-w-md mx-auto w-full">
        {mode === 'register' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 ml-1">
              <UserIcon size={16} className="text-blue-600" />
              <label className="text-[13px] font-bold text-black leading-tight">Seu nome completo <span className="text-red-500">*</span></label>
            </div>
            <Input value={name} onChange={e => setName(formatPortugueseName(e.target.value))} className="h-16 text-lg font-bold rounded-3xl" />
          </div>
        )}
        
        {(mode !== 'confirm_email' && mode !== 'verifying' && mode !== 'recovery_sent') && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 ml-1">
              <Mail size={16} className="text-blue-600" />
              <label className="text-[13px] font-bold text-black leading-tight">E-mail de acesso {mode === 'register' && <span className="text-red-500">*</span>}</label>
            </div>
            <Input 
              type="email" 
              placeholder="exemplo@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="h-16 text-lg font-bold rounded-3xl"
            />
          </div>
        )}

        {mode === 'register' && (
           <div className="space-y-3 animate-in fade-in duration-500">
              <div className="flex items-center gap-2 ml-1">
                <Hash size={16} className="text-blue-600" />
                <label className="text-[13px] font-bold text-black leading-tight">Pin de quem te convidou</label>
              </div>
              <div className="bg-slate-50 rounded-[2rem] p-4 shadow-sm border border-slate-100">
                <div className="flex gap-2">
                    <div className="relative w-28 shrink-0">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600"><Hash size={14} /></div>
                      <input 
                        type="text" 
                        placeholder="Pin" 
                        maxLength={5} 
                        value={referralPin} 
                        onChange={e => setReferralPin(e.target.value.toUpperCase().trim())} 
                        className="w-full h-14 pl-8 pr-2 bg-white border border-slate-200 rounded-2xl text-base font-black outline-none focus:ring-2 focus:ring-emerald-500/20" 
                      />
                      {isSearchingReferral && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" />}
                    </div>
                    <div 
                      className={`flex-1 h-14 rounded-2xl px-4 flex items-center justify-center transition-all ${referralPin.length === 5 && lookupName !== 'Pin não localizado' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : (referralPin.length === 5 ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-gray-100 text-gray-300')}`}
                    >
                      <span className="text-xs font-black truncate flex items-center gap-2">
                        {isSearchingReferral ? 'Buscando...' : (
                          !referralPin ? 'Digite o pin' : (
                            lookupName === 'Pin não localizado' ? 'Pin não localizado' : (
                              <div className="flex items-center gap-2"><span>{lookupName}</span> <CheckIcon size={16} className="text-white" /></div>
                            )
                          )
                        )}
                      </span>
                    </div>
                </div>
              </div>
           </div>
        )}

        {mode === 'login' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 ml-1">
              <Hash size={16} className="text-blue-600" />
              <label className="text-[13px] font-bold text-black leading-tight">Pin de acesso</label>
            </div>
            <Input 
              placeholder="•••••" 
              type={!showPin ? "password" : "text"} 
              value={pin} 
              onChange={e => setPin(e.target.value.toUpperCase().trim())} 
              rightAction={<button onClick={() => setShowPin(!showPin)} className={`p-3 transition-colors ${showPin ? 'text-emerald-500' : 'text-red-500'}`}>{showPin ? <Eye size={20} /> : <EyeOff size={20} />}</button>} 
              className="text-center font-black text-3xl tracking-[0.4em] h-16 rounded-4xl" 
            />
            <button onClick={handleForgotPassword} className="w-full text-right text-[11px] font-black text-brand-500">Esqueci meu pin</button>
          </div>
        )}

        {mode === 'confirm_email' && (
          <div className="space-y-6">
             <p className="text-xs font-bold text-black text-center">
               {isAutoConfirming ? 'Verificando seu e-mail automaticamente...' : (
                 <>Código de segurança enviado para seu e-mail, abra sua caixa postal ou veja no spam. Caso esteja no spam marque como <strong>não spam</strong>, assim no próximo e-mail ele já irá para sua caixa postal.</>
               )}
             </p>
             <Input 
               placeholder="000000" 
               value={verificationCode} 
               onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
               className="h-20 text-center text-4xl font-black rounded-4xl" 
               disabled={isAutoConfirming}
             />
          </div>
        )}

        {mode === 'recovery_sent' && (
          <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in duration-500">
             <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <MailCheck size={40} strokeWidth={3} />
             </div>
             <p className="text-lg font-black text-black tracking-tight text-center">E-mail de recuperação enviado!</p>
             <p className="text-xs font-bold text-slate-500 mt-2 text-center">Verifique sua caixa de entrada para recuperar o acesso.</p>
          </div>
        )}

        {mode === 'verifying' && (
          <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in duration-500">
             <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <CheckIcon size={40} strokeWidth={3} />
             </div>
             <p className="text-lg font-black text-black tracking-tight">E-mail validado com sucesso!</p>
             <p className="text-xs font-bold text-slate-500 mt-2">Redirecionando para o placar...</p>
          </div>
        )}

        {error && <div className="p-4 bg-red-50 text-red-500 rounded-3xl text-[11px] font-bold border border-red-100 flex items-center gap-2 animate-in shake">{error}</div>}
      </div>

      <div className="flex flex-col gap-4 mt-20 pb-12 items-center max-w-md mx-auto w-full">
        {mode !== 'verifying' && mode !== 'recovery_sent' && (
          <Button 
            disabled={isLoading} 
            onClick={mode === 'login' ? handleLogin : (mode === 'confirm_email' ? handleConfirmEmail : handleRequestRegister)} 
            className="w-full py-6 rounded-4xl font-black shadow-xl text-xl !bg-brand-600 text-white gap-3"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-sm font-bold">{statusText || 'Processando...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {mode === 'login' ? 'Entrar no MyPlacar' : (
                  mode === 'confirm_email' ? 'Validar código de segurança' : <>Solicitar cadastro <UserPlus size={20} className="text-white" /></>
                )}
              </div>
            )}
          </Button>
        )}

        {mode === 'recovery_sent' && (
          <Button 
            onClick={() => setMode('login')} 
            className="w-full py-6 rounded-4xl font-black shadow-xl text-xl !bg-brand-600 text-white gap-3"
          >
            Voltar para o login
          </Button>
        )}
        
        {mode === 'login' && (
          <div className="w-full flex items-center px-4 gap-2">
            <span className="text-[11px] font-black text-black">Manter conectado</span>
            <Toggle id="remember-me" checked={rememberMe} onChange={setRememberMe} />
          </div>
        )}

        {mode === 'login' ? (
          <div className="w-full flex flex-col items-center">
            <Button onClick={() => setMode('register')} variant="secondary" className="w-full py-6 rounded-4xl font-black border-2 border-brand-100 text-brand-600 text-xl">
              Criar nova conta
            </Button>
            
            <button 
              onClick={handleManualUpdateCheck} 
              disabled={isCheckingUpdate}
              className={`flex items-center gap-2 text-[13px] font-black mt-8 transition-all duration-300 ${remoteVersionFound ? 'text-amber-500 scale-110 animate-bounce' : updateFeedback ? 'text-emerald-500' : 'text-emerald-500 opacity-60'}`}
            >
               {isCheckingUpdate ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
               {updateFeedback || (remoteVersionFound ? `Atualizar para ${remoteVersionFound}` : `Versão ${APP_VERSION}`)}
            </button>
          </div>
        ) : (mode !== 'verifying' && mode !== 'recovery_sent') ? (
          <button onClick={() => setMode('login')} className="text-black text-xs font-black py-4">Já tenho uma conta</button>
        ) : null}
      </div>
    </div>
  );
};