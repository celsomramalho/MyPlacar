import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, CheckCircle2, AlertCircle, ArrowRight, UserPlus, LogIn, MailCheck, ExternalLink, ShieldCheck, Eye, EyeOff, Send, SearchCheck, KeyRound, Sparkles, Ticket, RotateCw, ArrowLeft, Hash, User as UserIcon, Check as CheckIcon, Trophy, WifiOff, Fingerprint, Wifi } from 'lucide-react';
import { Input } from '../components/Input.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { UserProfile } from '../types.ts';
import { getDb, getAuthInstance } from '../firebase.ts';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp, collection, query, where, getDocs, Firestore } from 'firebase/firestore';
import { mirrorUser } from '../services/supabaseMirror.ts';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { ScoreboardIcon } from '../components/ScoreboardIcon.tsx';
import { emailService } from '../services/emailService.ts';
import { formatPortugueseName, applyGoldenRule } from '../utils/formatters.ts';
import { APP_VERSION } from '../constants.ts';

interface Props {
  onAuthSuccess: (profile: UserProfile, stayConnected: boolean) => void;
  onCheckUpdate: () => Promise<string | boolean>;
  setIsUpdatingVersion: (val: boolean) => void;
  onOfflineMode?: () => void;
  initialReferralPin?: string;
  appUrl: string;
}

export const AuthScreen: React.FC<Props> = ({ onAuthSuccess, onCheckUpdate, setIsUpdatingVersion, onOfflineMode, initialReferralPin = '', appUrl }) => {
  const [showSplash, setShowSplash] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [remoteVersionFound, setRemoteVersionFound] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [mode, setMode] = useState<'login' | 'register' | 'confirm_email' | 'verifying' | 'recovery_sent' | 'reset_password'>(() => {
    const params = new URLSearchParams(globalThis.location.search);
    if (params.get('mode') === 'resetPassword' && params.get('oobCode')) return 'reset_password';
    return (params.get('ref') || params.get('pin_ref') || params.get('joinEvent')) ? 'register' : 'login';
  });

  const [oobCode, setOobCode] = useState(() => new URLSearchParams(globalThis.location.search).get('oobCode') || '');

  const [email, setEmail] = useState(() => localStorage.getItem('MyPlacarSavedEmail') || '');
  const [pin, setPin] = useState(() => localStorage.getItem('MyPlacarSavedPin') || ''); 
  const [password, setPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<'pin' | 'password'>(() => {
    // Inicializa a partir do perfil salvo no localStorage quando disponível
    // (resolve offline e evita piscar de PIN → senha para usuários recorrentes)
    try {
      const savedProfile = localStorage.getItem('MyPlacarUserProfile');
      if (savedProfile) {
        const profile = JSON.parse(savedProfile) as UserProfile;
        if (profile?.authMethod) return profile.authMethod;
      }
    } catch (e) {}
    return 'password'; // padrão: senha (não PIN)
  });
  const [isCheckingAuthMethod, setIsCheckingAuthMethod] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedVerifyCode, setGeneratedVerifyCode] = useState(() => localStorage.getItem('MyPlacarPendingVerifyCode') || '');
  const [showPin, setShowPin] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('MyPlacarPendingName') || '');
  
  const [referralPin, setReferralPin] = useState(() => {
    const params = new URLSearchParams(globalThis.location.search);
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
  const [showRecoveryInfoModal, setShowRecoveryInfoModal] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState<{ 
    type: 'link' | 'pin', 
    value: string,
    userName?: string,
    userEmail?: string,
    userUid?: string
  }>({ type: 'pin', value: '' });

  // Monitor de conexão real — probe ativo em URL externa (não interceptada pelo SW)
  useEffect(() => {
    let cancelled = false;
    const checkConnection = async () => {
      try {
        // generate_204 é um endpoint do Google criado para detecção de conectividade.
        // Por ser externo, o SW da aplicação nunca o intercepta, garantindo resultado real.
        await fetch('https://www.google.com/generate_204', {
          cache: 'no-store',
          mode: 'no-cors',
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled) setIsOnline(true);
      } catch {
        // probe falhou; usa navigator.onLine como desempate para não
        // marcar offline em redes lentas que atingem o timeout
        if (!cancelled) setIsOnline(navigator.onLine);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    // eventos nativos atualizam imediatamente; probe confirma em seguida
    const handleOnline  = () => { setIsOnline(true); checkConnection(); };
    const handleOffline = () => { if (!cancelled) setIsOnline(false); };
    globalThis.addEventListener('online',  handleOnline);
    globalThis.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      globalThis.removeEventListener('online',  handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initialCheck = async () => {
      if (!isOnline) return;
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
  }, [onCheckUpdate, isOnline]);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const modeParam = params.get('mode');
    const codeParam = params.get('oobCode');

    if (modeParam === 'resetPassword' && codeParam) {
      const auth = getAuthInstance();
      if (auth) {
        auth.signOut().then(() => {
          localStorage.removeItem('MyPlacarSavedEmail');
          localStorage.removeItem('MyPlacarSavedPin');
          localStorage.removeItem('MyPlacarUser');
          localStorage.removeItem('MyPlacarRememberMe');
          
          setOobCode(codeParam);
          setMode('reset_password');
          
          verifyPasswordResetCode(auth, codeParam).then(email => {
            setEmail(email);
            setPassword('');
            setPin('');
          }).catch(e => {
            setError("Link de recuperação inválido ou expirado.");
          });
        });
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const eventPin = params.get('joinEvent');
    if (eventPin && isOnline) {
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
  }, [isOnline]);

  const handleConfirmEmailInternalRef = React.useRef<((email: string, code: string) => Promise<void>) | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const urlEmail = params.get('email');
    const urlCode = params.get('code');

    if (urlEmail && urlCode) {
        setEmail(urlEmail);
        setVerificationCode(urlCode);
        setMode('confirm_email');
        setIsAutoConfirming(true);
        setIsLoading(true);
        setStatusText('Verificando seu e-mail automaticamente...');
        
        localStorage.setItem('MyPlacarPendingVerifyCode', urlCode);
        setGeneratedVerifyCode(urlCode);

        try {
            globalThis.history.replaceState(null, '', globalThis.location.pathname);
        } catch (e) {
            console.warn("History API not available or blocked:", e);
        }

        const autoConfirmTimer = setTimeout(async () => {
            try {
                if (handleConfirmEmailInternalRef.current) {
                  await handleConfirmEmailInternalRef.current(urlEmail, urlCode);
                }
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
      if (!isOnline) return;
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
  }, [referralPin, isOnline]);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const handleManualUpdateCheck = async () => {
    if (isCheckingUpdate || !onCheckUpdate || !isOnline) return;
    
    if (remoteVersionFound && setIsUpdatingVersion) {
      setIsUpdatingVersion(true);
      // 1. Sinaliza ao SW em espera para assumir imediatamente
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            await new Promise<void>(resolve => {
              navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
              setTimeout(resolve, 2000);
            });
          }
        } catch (e) {}
      }
      // 2. Limpa todos os caches
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch (e) {}
      }
      // 3. Recarrega com cache-bust
      const url = new URL(globalThis.location.href);
      url.searchParams.set('v', remoteVersionFound);
      globalThis.location.href = url.toString();
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

  useEffect(() => {
    const checkAuthMethod = async () => {
      if (!isOnline) return;
      const cleanEmail = email.toLowerCase().trim();
      if (cleanEmail.includes('@') && cleanEmail.includes('.')) {
        const db = getDb();
        if (db) {
          setIsCheckingAuthMethod(true);
          try {
            const userSnap = await getDoc(doc(db as Firestore, "users", cleanEmail));
            if (userSnap.exists()) {
              const data = userSnap.data();
              // Fallback 'password': usuários sem authMethod explícito são antigos
              // que ainda não migraram — PIN só aparece quando confirmado pelo Firestore
              setAuthMethod(data.authMethod === 'pin' ? 'pin' : 'password');
            } else {
              // E-mail não encontrado — mantém 'password' como padrão
              setAuthMethod('password');
            }
          } catch (e) {
            // Erro de rede — mantém o estado atual sem alterar
          } finally {
            setIsCheckingAuthMethod(false);
          }
        }
      }
    };
    const timer = setTimeout(checkAuthMethod, 500);
    return () => clearTimeout(timer);
  }, [email, isOnline]);

  const validatePassword = (pass: string) => {
    const hasMinLength = pass.length >= 6;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return {
      hasMinLength,
      hasUpper,
      hasLower,
      hasSpecial,
      isValid: hasMinLength && hasUpper && hasLower && hasSpecial
    };
  };

  const passwordValidation = validatePassword(password);

  const handleLogin = async () => {
    if (!email || (authMethod === 'pin' ? !pin : !password)) {
      setError(authMethod === 'pin' ? "Preencha seu e-mail e pin de acesso." : "Preencha seu e-mail e senha.");
      return;
    }

    // Lógica de Login Offline
    if (!isOnline) {
      const savedProfileStr = localStorage.getItem('MyPlacarUserProfile');
      if (savedProfileStr) {
        try {
          const savedProfile = JSON.parse(savedProfileStr) as UserProfile;
          if (savedProfile.email.toLowerCase().trim() === email.toLowerCase().trim()) {
            // Usa o authMethod do perfil salvo — mais confiável que o estado
            // da tela que pode não ter sido verificado sem conexão
            const savedAuthMethod = savedProfile.authMethod || 'password';
            if (savedAuthMethod === 'pin') {
              if (savedProfile.pin === pin.toUpperCase().trim()) {
                onAuthSuccess(savedProfile, true);
                return;
              } else {
                setError("Pin incorreto para acesso offline.");
                return;
              }
            } else {
              // Senha: permite acesso offline se o e-mail bater com o último logado
              // (dispositivo privado, usuário já autenticou antes)
              onAuthSuccess(savedProfile, true);
              return;
            }
          }
        } catch (e) {}
      }
      setError("Acesso offline disponível apenas para o último usuário logado.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Autenticando...');
    try {
      const db = getDb();
      const auth = getAuthInstance();
      if (!db || !auth) throw new Error("Erro de conexão.");
      const cleanEmail = email.toLowerCase().trim();

      if (authMethod === 'password') {
        try {
          const cleanPassword = password.trim();
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
          const userSnap = await getDocFromServer(doc(db as Firestore, "users", cleanEmail));
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserProfile;
            const enriched = { ...userData, isAdmin: userData.isAdmin === true };
            if (rememberMe) {
              localStorage.setItem('MyPlacarSavedEmail', cleanEmail);
            } else {
              localStorage.removeItem('MyPlacarSavedEmail');
            }
            onAuthSuccess(enriched, rememberMe);
          }
        } catch (e: any) {
          console.error("Login error:", e);
          if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            setError("E-mail ou senha incorretos.");
          } else if (e.code === 'auth/unauthorized-domain') {
            setError("Este domínio não está autorizado no Firebase. Verifique as configurações do console.");
          } else {
            setError("Erro ao autenticar. Tente novamente.");
          }
        }
      } else {
        const userSnap = await getDocFromServer(doc(db as Firestore, "users", cleanEmail));
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          if (userData.pin === pin.toUpperCase().trim()) {
            if (rememberMe) {
              localStorage.setItem('MyPlacarSavedEmail', cleanEmail);
              localStorage.setItem('MyPlacarSavedPin', pin.toUpperCase().trim());
            } else {
              localStorage.removeItem('MyPlacarSavedEmail');
              localStorage.removeItem('MyPlacarSavedPin');
            }
            const enriched = { ...userData, isAdmin: userData.isAdmin === true };
            onAuthSuccess(enriched, rememberMe);
          } else {
            setError("Pin incorreto, tente novamente.");
          }
        } else {
          setError("E-mail não localizado no sistema.");
        }
      }
    } catch (e: any) {
      setError("Não foi possível realizar o login agora.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRegister = async () => {
    if (!isOnline) {
      setError("O cadastro de novos usuários exige conexão com a internet.");
      return;
    }
    if (!email || !name || !password) {
      setError("Preencha seu nome, e-mail e senha para continuar.");
      return;
    }

    if (!passwordValidation.isValid) {
      setError("A senha não atende aos requisitos de segurança.");
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
        setError("Este e-mail já possui cadastro. Use a recuperação de senha.");
        return;
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      localStorage.setItem('MyPlacarPendingVerifyCode', code);
      localStorage.setItem('MyPlacarPendingName', name);
      localStorage.setItem('MyPlacarSavedEmail', cleanEmail);
      localStorage.setItem('MyPlacarPendingPassword', password);
      setGeneratedVerifyCode(code);
      
      setStatusText('Enviando seu código por e-mail...');

      const appBaseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
      const confirmationLink = `${appBaseUrl}/?email=${encodeURIComponent(cleanEmail)}&code=${code}`;

      const emailSent = await emailService.sendEmail('template_v9fhxz3', {
        to_name: name.split(' ')[0],
        email: cleanEmail,
        pin_code: code,
        confirmation_link: confirmationLink,
        app_access_link: appBaseUrl,
        subject: "Código de verificação - MyPlacar",
        from_name: "MyPlacar",
        reply_to: "celsomramalho@gmail.com"
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
    handleConfirmEmailInternalRef.current = handleConfirmEmailInternal;
    const expectedCode = localStorage.getItem('MyPlacarPendingVerifyCode') || generatedVerifyCode;
    
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
      const storedName = localStorage.getItem('MyPlacarPendingName') || name || "Jogador";
      const storedPassword = localStorage.getItem('MyPlacarPendingPassword') || password;
      const finalPin = Math.random().toString(36).substring(2, 7).toUpperCase();
      
      const auth = getAuthInstance();
      if (auth && storedPassword) {
        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, storedPassword);
        } catch (e: any) {
          console.log("Firebase Register Error Details:", { code: e.code, message: e.message, full: e });
          if (e.message?.includes('signup-are-blocked') || e.code === 'auth/operation-not-allowed') {
            throw new Error(`O cadastro de novos usuários está temporariamente desativado. Entre em contato com o suporte. (Erro: ${e.code})`);
          }
          throw new Error(`${e.message} (Código: ${e.code})`);
        }
      }

      const newProfile = {
        name: formatPortugueseName(storedName),
        nickname: storedName.split(' ')[0],
        email: cleanEmail,
        phone: '', 
        pin: finalPin,
        authMethod: 'password',
        isProfileComplete: true,
        emailVerified: true,
        referredByPin: referralPin.toUpperCase().trim(),
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db as Firestore, "users", cleanEmail), newProfile);
      mirrorUser(newProfile as unknown as UserProfile);
      const appBaseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
      await emailService.sendEmail('template_wn0f65h', {
        to_name: newProfile.nickname,
        email: cleanEmail,
        pin_code: finalPin,
        app_access_link: appBaseUrl,
        subject: "Seu pin de acesso - MyPlacar",
        from_name: "MyPlacar",
        reply_to: "celsomramalho@gmail.com"
      });

      localStorage.removeItem('MyPlacarPendingPassword');

      setMode('verifying');
      localStorage.removeItem('MyPlacarPendingReferral');
      localStorage.removeItem('MyPlacarPendingReferralPin');
      localStorage.removeItem('MyPlacarPendingVerifyCode');
      localStorage.removeItem('MyPlacarPendingName');
      
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
    if (!isOnline) {
      setError("A recuperação de senha exige conexão com a internet.");
      return;
    }
    if (!email) {
      setError("Digite seu e-mail para recuperar seu acesso.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusText('Processando sua recuperação...');
    try {
      const db = getDb();
      const auth = getAuthInstance();
      if (!db || !auth) throw new Error("Erro de conexão.");
      const cleanEmail = email.toLowerCase().trim();
      const userRef = doc(db as Firestore, "users", cleanEmail);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("E-mail não localizado no sistema.");
      }
      
      const userData = userSnap.data();
      const userPin = userData?.pin || '';
      const userName = userData?.nickname || userData?.name || "Jogador";
      const userAuthMethod = userData?.authMethod || 'pin';
      const userUid = userData?.uid || userSnap.id;

      let firebaseEmailSent = false;
      const resetLink = `${appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl}/?mode=resetPassword`;
      try {
        await sendPasswordResetEmail(auth, cleanEmail, {
          url: resetLink,
          handleCodeInApp: true,
        });
        firebaseEmailSent = true;
        setRecoveryInfo({ 
          type: 'link', 
          value: resetLink,
          userName,
          userEmail: cleanEmail,
          userUid
        });
      } catch (e: any) {
        console.warn("Firebase reset error:", e);
        if (e.code === 'auth/unauthorized-domain') {
          setError("Este domínio não está autorizado no Firebase para enviar e-mails.");
          setIsLoading(false);
          return;
        }
      }

      if (userAuthMethod === 'pin' || !firebaseEmailSent) {
        setStatusText('Enviando dados de acesso por e-mail...');
        const appBaseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl; 
        const emailSent = await emailService.sendEmail('template_wn0f65h', {
          to_name: userName,
          email: cleanEmail,
          pin_code: userPin,
          app_access_link: appBaseUrl,
          subject: "Recuperação de acesso - MyPlacar",
          from_name: "MyPlacar",
          reply_to: "celsomramalho@gmail.com"
        });

        if (!emailSent && !firebaseEmailSent) {
          throw new Error("Não foi possível enviar o e-mail de recuperação.");
        }
        
        if (userPin) {
          setRecoveryInfo({ 
            type: 'pin', 
            value: userPin,
            userName,
            userEmail: cleanEmail,
            userUid
          });
        }
      }

      setMode('recovery_sent');
      setShowRecoveryInfoModal(true);
    } catch (e: any) {
      setError(e.message || "Erro ao recuperar seu acesso.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!globalThis.PublicKeyCredential) {
      setError("Seu navegador não suporta biometria.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Validando biometria...');

    try {
      const challenge = new Uint8Array(32);
      globalThis.crypto.getRandomValues(challenge);

      const options: any = {
        challenge,
        rpId: globalThis.location.hostname,
        userVerification: "required",
        timeout: 60000,
      };

      const assertion = await navigator.credentials.get({
        publicKey: options,
      }) as any;

      if (assertion) {
        const rawId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
        
        const db = getDb();
        if (!db) throw new Error("Erro de conexão.");
        
        const usersRef = collection(db as Firestore, "users");
        const q = query(usersRef, where("passkeyCredentialId", "==", rawId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error("Biometria não reconhecida ou não cadastrada.");
        }
        
        const userData = querySnapshot.docs[0].data() as UserProfile;
        const enriched = { ...userData, isAdmin: userData.isAdmin === true };
        onAuthSuccess(enriched, rememberMe);
      }
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError') {
        setError("Autenticação cancelada pelo usuário.");
      } else if (err.message === "Biometria não reconhecida ou não cadastrada.") {
        setError("Biometria não reconhecida ou não cadastrada.");
      } else {
        setError("Falha na autenticação biométrica.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!isOnline) {
      setError("A redefinição de senha exige conexão com a internet.");
      return;
    }
    if (!passwordValidation.isValid) {
      setError("A senha não atende aos requisitos de segurança.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusText('Redefinindo sua senha...');
    try {
      const auth = getAuthInstance();
      if (!auth) throw new Error("Erro de conexão.");
      await confirmPasswordReset(auth, oobCode, password);
      setMode('login');
      setError(null);
      alert("Senha redefinida com sucesso! Agora você pode entrar.");
      globalThis.history.replaceState(null, '', globalThis.location.pathname);
    } catch (e: any) {
      setError("Erro ao redefinir senha. O link pode ter expirado.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isOnline) {
      setError("O login com Google exige conexão com a internet.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusText('Conectando com google...');
    try {
      const auth = getAuthInstance();
      const db = getDb();
      if (!auth || !db) throw new Error("Erro de conexão.");
      
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user && user.email) {
        const cleanEmail = user.email.toLowerCase().trim();
        const userRef = doc(db as Firestore, "users", cleanEmail);
        const userSnap = await getDocFromServer(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          const enriched = { ...userData, isAdmin: userData.isAdmin === true };
          onAuthSuccess(enriched, rememberMe);
        } else {
          const finalPin = Math.random().toString(36).substring(2, 7).toUpperCase();
          const newProfile = {
            name: formatPortugueseName(user.displayName || "Jogador"),
            nickname: (user.displayName || "Jogador").split(' ')[0],
            email: cleanEmail,
            phone: '', 
            pin: finalPin,
            authMethod: 'password',
            isProfileComplete: true,
            emailVerified: true,
            referredByPin: referralPin.toUpperCase().trim(),
            createdAt: serverTimestamp()
          };
          
          await setDoc(userRef, newProfile);
          mirrorUser(newProfile as unknown as UserProfile);
          onAuthSuccess(newProfile as unknown as UserProfile, rememberMe);
        }
      }
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/popup-closed-by-user') {
        setError("Login cancelado pelo usuário.");
      } else {
        setError("Erro ao autenticar com google.");
      }
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
        
        {/* Indicador de Status de Rede */}
        <div className={`mt-4 px-4 py-1.5 rounded-full flex items-center gap-2 border transition-all duration-500 ${isOnline ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600 animate-pulse'}`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="text-[10px] font-black uppercase tracking-widest">{isOnline ? 'Online' : 'Modo Offline'}</span>
        </div>
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
        {mode === 'login' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center">
              <h2 className="text-2xl font-black text-black tracking-tight">Bem-vindo de volta</h2>
              <p className="text-slate-500 font-bold text-sm mt-1">
                {isOnline ? 'Acesse sua conta para continuar no MyPlacar Pro' : 'Acesse com seu perfil salvo localmente'}
              </p>
            </div>
          </div>
        )}

        {mode === 'register' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center">
              <h2 className="text-2xl font-black text-black tracking-tight">Criar nova conta</h2>
              <p className="text-slate-500 font-bold text-sm mt-1">Junte-se à comunidade MyPlacar Pro</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 ml-1">
                <UserIcon size={16} className="text-blue-600" />
                <label className="text-[13px] font-bold text-black leading-tight">Seu nome completo <span className="text-red-500">*</span></label>
              </div>
              <Input value={name} onChange={e => setName(formatPortugueseName(e.target.value))} className="h-16 text-lg font-bold rounded-3xl" />
            </div>
          </div>
        )}

        {mode === 'reset_password' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-2xl font-black text-black tracking-tight">Redefinir sua senha</h2>
              <p className="text-slate-500 font-bold text-sm mt-1">Crie uma nova senha para {email}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 ml-1">
                  <Lock size={16} className="text-blue-600" />
                  <label className="text-[13px] font-bold text-black leading-tight">Nova senha forte <span className="text-red-500">*</span></label>
                </div>
                <Input 
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  className="h-16 text-lg font-bold rounded-3xl"
                  placeholder="Digite sua nova senha"
                  rightAction={<button onClick={() => setShowPassword(!showPassword)} className="p-3 text-slate-400">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>}
                />
              </div>

              <div className="bg-slate-50 rounded-3xl p-4 space-y-2 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Requisitos da senha</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasMinLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasMinLength ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                      {passwordValidation.hasMinLength && <CheckIcon size={10} />}
                    </div>
                    Mín. 6 caracteres
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
                <div className="mt-3 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      Object.values(passwordValidation).filter(v => v === true).length <= 1 ? 'bg-red-500 w-1/4' :
                      Object.values(passwordValidation).filter(v => v === true).length <= 2 ? 'bg-orange-500 w-2/4' :
                      Object.values(passwordValidation).filter(v => v === true).length <= 3 ? 'bg-yellow-500 w-3/4' :
                      'bg-emerald-500 w-full'
                    }`}
                  />
                </div>
              </div>

              <Button 
                onClick={handleResetPassword} 
                disabled={isLoading || !passwordValidation.isValid}
                className="w-full h-16 rounded-3xl text-lg font-black shadow-xl shadow-blue-100"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : 'Salvar nova senha'}
              </Button>

              <button 
                onClick={() => setMode('login')} 
                className="w-full py-2 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors"
              >
                Voltar para o login
              </button>
            </div>
          </div>
        )}

        {(mode === 'login' || mode === 'register') && (
          <div className="space-y-2 animate-in fade-in duration-500">
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

        {mode === 'register' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="space-y-2">
              <div className="flex items-center gap-2 ml-1">
                <Lock size={16} className="text-blue-600" />
                <label className="text-[13px] font-bold text-black leading-tight">Crie uma senha forte <span className="text-red-500">*</span></label>
              </div>
              <Input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="h-16 text-lg font-bold rounded-3xl"
                rightAction={<button onClick={() => setShowPassword(!showPassword)} className="p-3 text-slate-400">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>}
              />
            </div>

            <div className="bg-slate-50 rounded-3xl p-4 space-y-2 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Requisitos da senha</p>
              <div className="grid grid-cols-2 gap-2">
                <div className={`flex items-center gap-2 text-[11px] font-bold ${passwordValidation.hasMinLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passwordValidation.hasMinLength ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                    {passwordValidation.hasMinLength && <CheckIcon size={10} />}
                  </div>
                  Mín. 6 caracteres
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
              <div className="mt-3 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    Object.values(passwordValidation).filter(v => v === true).length <= 1 ? 'bg-red-500 w-1/4' :
                    Object.values(passwordValidation).filter(v => v === true).length <= 2 ? 'bg-orange-500 w-2/4' :
                    Object.values(passwordValidation).filter(v => v === true).length <= 3 ? 'bg-yellow-500 w-3/4' :
                    'bg-emerald-500 w-full'
                  }`}
                />
              </div>
            </div>
          </div>
        )}

        {mode === 'login' && (
          <div className="space-y-4">
            {authMethod === 'password' ? (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 ml-1">
                  <Lock size={16} className="text-blue-600" />
                  <label className="text-[13px] font-bold text-black leading-tight">Senha de acesso</label>
                  {isCheckingAuthMethod && <Loader2 size={12} className="text-slate-400 animate-spin ml-1" />}
                </div>
                <Input 
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  className="h-16 text-lg font-bold rounded-3xl"
                  rightAction={<button onClick={() => setShowPassword(!showPassword)} className="p-3 text-slate-400">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>}
                />
                <button onClick={handleForgotPassword} className="w-full text-right text-[11px] font-black text-brand-500">Esqueci minha senha</button>
              </div>
            ) : (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 ml-1">
                  <Hash size={16} className="text-blue-600" />
                  <label className="text-[13px] font-bold text-black leading-tight">Pin de acesso</label>
                  {isCheckingAuthMethod && <Loader2 size={12} className="text-slate-400 animate-spin ml-1" />}
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
             <p className="text-lg font-black text-black tracking-tight text-center">{authMethod === 'password' ? 'E-mail de redefinição enviado!' : 'E-mail de recuperação enviado!'}</p>
             <p className="text-xs font-bold text-slate-500 mt-2 text-center">{authMethod === 'password' ? 'Siga as instruções no e-mail para criar uma nova senha.' : 'Verifique sua caixa de entrada para recuperar o acesso.'}</p>
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
            onClick={mode === 'login' ? handleLogin : (mode === 'confirm_email' ? handleConfirmEmail : (mode === 'reset_password' ? handleResetPassword : handleRequestRegister))} 
            className="w-full py-6 rounded-4xl font-black shadow-xl text-xl !bg-brand-600 text-white gap-3"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-sm font-bold">{statusText || 'Processando...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {mode === 'login' ? <><LogIn size={24} /> Entrar no MyPlacar</> : (
                  mode === 'confirm_email' ? 'Validar código de segurança' : <><UserPlus size={20} className="text-white" /> Solicitar cadastro</>
                )}
              </div>
            )}
          </Button>
        )}

        {mode === 'login' && isOnline && (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3 py-2">
              <div className="h-[1px] flex-1 bg-slate-100" />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ou</span>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>

            {globalThis.PublicKeyCredential && (
              <button 
                onClick={handlePasskeyLogin}
                disabled={isLoading}
                className="w-full py-4 rounded-3xl font-black border-2 border-blue-50 text-blue-600 flex items-center justify-center gap-3 active:scale-95 transition-all bg-blue-50/30"
              >
                <Fingerprint size={20} /> Entrar com biometria
              </button>
            )}

            <button 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 rounded-3xl font-black border-2 border-red-50 text-red-600 flex items-center justify-center gap-3 active:scale-95 transition-all bg-blue-50/30"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" /> Entrar com google
            </button>
          </div>
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
          <div className="w-full flex items-center justify-end px-4 gap-2">
            <span className="text-[11px] font-black text-black">Manter conectado</span>
            <Toggle id="remember-me" checked={rememberMe} onChange={setRememberMe} />
          </div>
        )}

        {mode === 'login' ? (
          <div className="w-full flex flex-col items-center gap-4">
            {isOnline && (
              <Button onClick={() => setMode('register')} variant="secondary" className="w-full py-6 rounded-4xl font-black border-2 border-brand-100 text-brand-600 text-xl gap-3">
                <UserPlus size={24} /> Criar nova conta
              </Button>
            )}
            
            <Button 
              onClick={handleManualUpdateCheck} 
              disabled={isCheckingUpdate || !isOnline}
              variant="secondary"
              className={`w-full py-4 rounded-4xl font-black border-2 text-lg gap-3 transition-all duration-300 ${remoteVersionFound ? 'border-amber-200 text-amber-600 animate-bounce' : 'border-emerald-100 text-emerald-600'} ${!isOnline ? 'opacity-50' : ''}`}
            >
               {isCheckingUpdate ? <Loader2 size={20} className="animate-spin" /> : <RotateCw size={20} />}
               {updateFeedback || (remoteVersionFound ? `Atualizar para ${remoteVersionFound}` : `Versão ${APP_VERSION}`)}
            </Button>

            <Button 
              onClick={onOfflineMode}
              variant="secondary"
              className="w-full py-4 rounded-4xl font-black border-2 border-slate-200 text-slate-500 text-lg gap-3"
            >
              <WifiOff size={20} /> Usar offline
            </Button>
          </div>
        ) : (mode !== 'verifying' && mode !== 'recovery_sent') ? (
          <Button 
            onClick={() => setMode('login')} 
            variant="secondary" 
            className="w-full py-4 rounded-4xl font-black border-2 border-slate-100 text-blue-600 text-lg gap-3 shadow-sm"
          >
            <ArrowLeft size={20} /> Já tenho uma conta
          </Button>
        ) : null}
      </div>

      {showRecoveryInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <KeyRound size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-black text-black tracking-tight">Informações de recuperação</h3>
                <p className="text-xs font-bold text-slate-500">Use as informações abaixo se não receber o e-mail em instantes.</p>
              </div>

              <div className="w-full space-y-1">
                <p className="text-sm font-black text-black">{recoveryInfo.userName}</p>
                <p className="text-xs font-bold text-slate-500">{recoveryInfo.userEmail}</p>
                {recoveryInfo.userUid && (
                  <p className="text-[10px] font-mono text-slate-400 mt-1">Uid: {recoveryInfo.userUid}</p>
                )}
              </div>

              <div className="w-full p-4 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {recoveryInfo.type === 'link' ? 'Status do envio' : 'Seu pin de acesso'}
                </p>
                <div className="w-full bg-white p-3 rounded-2xl border border-slate-200 text-center">
                  {recoveryInfo.type === 'link' ? (
                    <span className="text-sm font-black text-emerald-600">Link enviado com sucesso</span>
                  ) : (
                    <code className="text-sm font-black text-blue-600 break-all">{recoveryInfo.value}</code>
                  )}
                </div>
                {recoveryInfo.type === 'pin' && (
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(recoveryInfo.value);
                      alert("Copiado para a área de transferência!");
                    }}
                    className="flex items-center gap-2 text-[11px] font-black text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <SearchCheck size={14} /> Copiar informação
                  </button>
                )}
              </div>

              <Button onClick={() => setShowRecoveryInfoModal(false)} className="w-full py-4 rounded-3xl font-black shadow-lg">
                Entendi, fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};