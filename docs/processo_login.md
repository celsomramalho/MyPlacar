# MyPlacar — Documentação do Processo de Login e Autenticação

> Documento gerado em 05/04/2026. Reflete o estado atual do código após as correções de domínio, Google Auth e biometria.

---

## Visão Geral

O sistema de autenticação do MyPlacar é composto por **três camadas independentes**:

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Identidade | Firebase Auth | Armazena credenciais (e-mail/senha) |
| Perfil | Firebase Firestore | Armazena dados do usuário (`users/{email}`) |
| E-mails transacionais | EmailJS | Envia confirmação de cadastro e boas-vindas |
| Espelho | Supabase | Réplica passiva do Firestore (fire-and-forget) |

O **Firestore é a fonte de verdade** em todas as leituras. O Firebase Auth valida apenas senha. O PIN e a biometria são validados diretamente contra o Firestore.

---

## Arquivos Envolvidos

```
src/
├── screens/
│   └── AuthScreen.tsx          ← Tela principal: todos os fluxos de auth
├── firebase.ts                 ← Inicialização do Firebase App, Auth e Firestore
├── infrastructure/email/
│   └── index.ts                ← Wrapper tecnico de e-mails transacionais
├── infrastructure/supabase/
│   ├── client.ts               ← Instância do Supabase
│   └── mirror.ts               ← Espelho passivo para Supabase
├── components/
│   └── SupabaseAuthProvider.tsx ← Context provider (sessão Supabase)
├── utils/
│   └── formatters.ts           ← formatPortugueseName, applyGoldenRule
├── constants.ts                ← APP_VERSION
└── types.ts                    ← Interface UserProfile
```

---

## Modos da Tela (`mode`)

O `AuthScreen` opera em **6 modos** controlados pelo estado `mode`:

| Modo | Descrição |
|---|---|
| `login` | Tela inicial — e-mail + senha ou PIN |
| `register` | Formulário de cadastro |
| `confirm_email` | Aguardando código de 6 dígitos |
| `verifying` | Animação de conclusão (2,5s) antes de entrar |
| `recovery_sent` | Confirmação de envio de recuperação |
| `reset_password` | Redefinição de senha via link do Firebase |

O modo inicial é determinado pelos query params da URL:
- `?mode=resetPassword&oobCode=...` → `reset_password`
- `?ref=`, `?pin_ref=` ou `?joinEvent=` → `register`
- Sem params → `login`

---

## Fluxo 1 — Login com Senha

```
Usuário digita e-mail + senha
         ↓
useEffect detecta e-mail válido → consulta Firestore
→ seta authMethod = 'password' ou 'pin' conforme campo do usuário
         ↓
handleLogin()
         ↓
[Offline?] → usa perfil do localStorage (mesmo e-mail) → onAuthSuccess
         ↓
[Online]
signInWithEmailAndPassword(auth, email, senha)   ← Firebase Auth
         ↓
getDocFromServer(db, "users", email)             ← Firestore (sem cache)
         ↓
onAuthSuccess(profile, rememberMe)
```

**Erros tratados:**
- `auth/wrong-password`, `auth/invalid-credential` → "E-mail ou senha incorretos."
- `auth/unauthorized-domain` → "Este domínio não está autorizado no Firebase."

**localStorage envolvido:**
- `MyPlacarSavedEmail` — salvo se `rememberMe = true`
- `MyPlacarUserProfile` — usado para login offline

---

## Fluxo 2 — Login com PIN

```
Usuário digita e-mail + PIN (5 caracteres)
         ↓
handleLogin() → authMethod === 'pin'
         ↓
getDocFromServer(db, "users", email)
         ↓
Compara userData.pin === pin.toUpperCase().trim()
         ↓
[OK]  → onAuthSuccess(profile, rememberMe)
[NOK] → "Pin incorreto, tente novamente."
```

O PIN **não passa pelo Firebase Auth** — é validado exclusivamente contra o Firestore.

**localStorage envolvido:**
- `MyPlacarSavedEmail` e `MyPlacarSavedPin` — salvos se `rememberMe = true`

---

## Fluxo 3 — Login com Google (OAuth)

```
Usuário clica "Entrar com Google"
         ↓
[isOnline === false] → bloqueia com mensagem
         ↓
new GoogleAuthProvider()
signInWithPopup(auth, provider)              ← Firebase Auth (popup)
         ↓
result.user.email (normalizado para lowercase)
         ↓
getDocFromServer(db, "users", email)         ← Firestore
         ↓
[Perfil existe] → onAuthSuccess(userData, rememberMe)
         ↓
[Perfil não existe] → cria novo perfil:
  {
    name, nickname,
    email,
    phone: '',
    pin: (5 chars aleatórios uppercase),
    authMethod: 'password',
    isProfileComplete: true,
    emailVerified: true,
    referredByPin,
    createdAt: serverTimestamp()
  }
  → setDoc(db, "users", email)
  → mirrorUser(newProfile)        ← Supabase (fire-and-forget)
  → onAuthSuccess(newProfile, rememberMe)
```

**Pré-requisito no Firebase Console:**
Domínios autorizados em Authentication → Settings → Authorized domains:
- `myplacar.app.br`
- `www.myplacar.app.br`

**Erros tratados:**
- `auth/popup-closed-by-user` → "Login cancelado pelo usuário."

---

## Fluxo 4 — Login com Biometria (WebAuthn / Passkey)

```
Usuário clica "Entrar com biometria"
         ↓
[!window.PublicKeyCredential] → "Seu navegador não suporta biometria."
         ↓
navigator.credentials.get({
  publicKey: {
    challenge: (32 bytes aleatórios),
    rpId: window.location.hostname,   ← deve ser "myplacar.app.br"
    userVerification: "required",
    timeout: 60000
  }
})
         ↓
assertion.rawId → convertido para base64 (rawId)
         ↓
query(users, where("passkeyCredentialId", "==", rawId))  ← Firestore
         ↓
[Encontrado] → onAuthSuccess(userData, rememberMe)
[Não encontrado] → "Biometria não reconhecida ou não cadastrada."
```

**Erros tratados:**
- `NotAllowedError` → "Autenticação cancelada pelo usuário."

**Importante:** A chave é vinculada ao domínio exato onde foi cadastrada. Após migração de domínio, o usuário deve recadastrar via ProfileScreen → Biometria → Recadastrar.

---

## Fluxo 5 — Cadastro de Novo Usuário

```
Usuário preenche nome completo + e-mail + senha
         ↓
Validações:
  - Nome com pelo menos 2 partes (nome + sobrenome)
  - Senha: mínimo 6 chars, 1 maiúscula, 1 minúscula, 1 especial
  - E-mail não pode já existir no Firestore
         ↓
Gera código de verificação: 6 dígitos numéricos aleatórios
         ↓
localStorage:
  MyPlacarPendingVerifyCode  ← código gerado
  MyPlacarPendingName        ← nome digitado
  MyPlacarSavedEmail         ← e-mail
  MyPlacarPendingPassword    ← senha (temporário, apagado após confirmação)
         ↓
[ENVIA E-MAIL DE CONFIRMAÇÃO]
emailService.sendEmail('template_v9fhxz3', {
  to_name:           primeiro nome,
  email:             e-mail do usuário,
  pin_code:          código de 6 dígitos,
  confirmation_link: https://myplacar.app.br/?email=...&code=...,
  app_access_link:   https://myplacar.app.br,
  subject:           "Código de verificação - MyPlacar",
  from_name:         "MyPlacar",
  reply_to:          celsomramalho@gmail.com
})
         ↓
mode → 'confirm_email'
```

---

## Fluxo 6 — Confirmação de E-mail

```
Usuário digita o código de 6 dígitos
(ou clica no link do e-mail → URL com ?email=...&code=... → autoconfirma)
         ↓
handleConfirmEmailInternal(email, code)
         ↓
Compara com MyPlacarPendingVerifyCode
         ↓
[Código incorreto] → "Código de segurança incorreto."
         ↓
[Correto]
createUserWithEmailAndPassword(auth, email, senha)   ← Firebase Auth
         ↓
Gera PIN definitivo: 5 chars alphanumeric uppercase aleatório
         ↓
newProfile = {
  name:              formatPortugueseName(nome),
  nickname:          primeiro nome,
  email,
  phone:             '',
  pin:               PIN gerado,
  authMethod:        'password',
  isProfileComplete: true,
  emailVerified:     true,
  referredByPin:     PIN de quem indicou (se houver),
  createdAt:         serverTimestamp()
}
         ↓
setDoc(db, "users", email)           ← Firestore
mirrorUser(newProfile)               ← Supabase (fire-and-forget)
         ↓
[ENVIA E-MAIL DE BOAS-VINDAS]
emailService.sendEmail('template_wn0f65h', {
  to_name:        nickname,
  email:          e-mail do usuário,
  pin_code:       PIN gerado,
  app_access_link: https://myplacar.app.br,
  subject:        "Seu pin de acesso - MyPlacar",
  from_name:      "MyPlacar",
  reply_to:       celsomramalho@gmail.com
})
         ↓
Limpa localStorage temporário:
  MyPlacarPendingPassword
  MyPlacarPendingReferral
  MyPlacarPendingVerifyCode
  MyPlacarPendingName
         ↓
mode → 'verifying' (animação 2,5s)
         ↓
onAuthSuccess(newProfile, rememberMe)
```

---

## Fluxo 7 — Recuperação de Acesso

```
Usuário clica "Esqueci minha senha"
         ↓
Busca perfil no Firestore pelo e-mail
         ↓
[Não existe] → "E-mail não localizado no sistema."
         ↓
[Existe]
Tenta sendPasswordResetEmail(auth, email, { url: resetLink })  ← Firebase
         ↓
[authMethod === 'pin' OU Firebase falhou]
emailService.sendEmail('template_wn0f65h', {
  to_name:         nickname,
  email:           e-mail do usuário,
  pin_code:        PIN atual do usuário,
  app_access_link: https://myplacar.app.br,
  subject:         "Recuperação de acesso - MyPlacar",
  from_name:       "MyPlacar",
  reply_to:        celsomramalho@gmail.com
})
         ↓
mode → 'recovery_sent' + showRecoveryInfoModal = true
```

---

## Fluxo 8 — Redefinição de Senha (via link do e-mail)

```
Usuário abre link do e-mail Firebase:
  https://myplacar.app.br/?mode=resetPassword&oobCode=XXXX
         ↓
AuthScreen inicia com mode = 'reset_password'
auth.signOut() → limpa sessão anterior
verifyPasswordResetCode(auth, oobCode) → recupera e-mail do usuário
         ↓
Usuário digita nova senha (mesmas regras de validação)
         ↓
confirmPasswordReset(auth, oobCode, novaSenha)
         ↓
mode → 'login'  + alert "Senha redefinida com sucesso!"
window.history.replaceState → limpa os params da URL
```

---

## E-mails Transacionais

O envio é feito via **EmailJS** (fetch direto, sem SDK), usando o serviço `service_2p1sm56`.

### Template `template_v9fhxz3` — Confirmação de Cadastro

Enviado em: **Fluxo 5** (início do cadastro)

| Variável | Valor |
|---|---|
| `to_name` | Primeiro nome do usuário |
| `email` | E-mail de destino |
| `pin_code` | Código de 6 dígitos |
| `confirmation_link` | `https://myplacar.app.br/?email=...&code=...` |
| `app_access_link` | `https://myplacar.app.br` |
| `subject` | "Código de verificação - MyPlacar" |
| `from_name` | "MyPlacar" |
| `reply_to` | celsomramalho@gmail.com |

O usuário pode confirmar clicando no link (autoconfirmação via URL) ou digitando o código manualmente na tela.

---

### Template `template_wn0f65h` — Boas-vindas / PIN de Acesso

Enviado em: **Fluxo 6** (após confirmação) e **Fluxo 7** (recuperação para usuários PIN)

| Variável | Valor |
|---|---|
| `to_name` | Nickname do usuário |
| `email` | E-mail de destino |
| `pin_code` | PIN de 5 caracteres do usuário |
| `app_access_link` | `https://myplacar.app.br` |
| `subject` | "Seu pin de acesso - MyPlacar" ou "Recuperação de acesso - MyPlacar" |
| `from_name` | "MyPlacar" |
| `reply_to` | celsomramalho@gmail.com |

---

## Detecção de Conectividade

O `AuthScreen` mantém o estado `isOnline` que controla a disponibilidade de todos os fluxos online.

```typescript
// Estado inicial — síncrono, disponível antes de qualquer fetch
const [isOnline, setIsOnline] = useState(navigator.onLine);

// Probe ativo a cada 15s usando URL externa (não interceptada pelo Service Worker)
await fetch('https://www.google.com/generate_204', {
  cache: 'no-store',
  mode: 'no-cors',
  signal: AbortSignal.timeout(4000),
});
```

Fluxos que exigem `isOnline === true`: login com senha, login com Google, cadastro, recuperação, redefinição de senha, verificação de método de auth.

Fluxos disponíveis offline: login com senha (último usuário logado via localStorage), login com PIN (último usuário logado).

---

## Estrutura do Documento `users/{email}` no Firestore

```typescript
{
  name:               string,    // Nome completo formatado
  nickname:           string,    // Primeiro nome
  email:              string,    // Chave do documento (lowercase)
  phone:              string,
  pin:                string,    // 5 chars uppercase — usado para login PIN
  authMethod:         'password' | 'pin',
  isProfileComplete:  boolean,
  emailVerified:      boolean,
  referredByPin:      string,    // PIN de quem indicou (pode ser vazio)
  createdAt:          Timestamp,
  isAdmin?:           boolean,
  planType?:          'free' | 'premium',
  passkeyCredentialId?: string,  // rawId base64 da chave WebAuthn
  passkeyPublicKey?:  string,    // "registered" (valor simbólico)
}
```

---

## localStorage — Chaves Utilizadas no Auth

| Chave | Conteúdo | Persistência |
|---|---|---|
| `MyPlacarUserProfile` | Objeto `UserProfile` completo | Sessão / permanente |
| `MyPlacarSavedEmail` | E-mail do último login | Se rememberMe = true |
| `MyPlacarSavedPin` | PIN do último login | Se rememberMe = true |
| `MyPlacarPendingVerifyCode` | Código de 6 dígitos | Temporário (apagado após confirm) |
| `MyPlacarPendingName` | Nome digitado no cadastro | Temporário |
| `MyPlacarPendingPassword` | Senha temporária pré-confirmação | Temporário (apagado após confirm) |

---

## Service Worker e Cache

O Service Worker (`public/sw.template.js`, gerado como `dist/sw.js` pelo Vite) usa um `CACHE_NAME` injetado em build time a partir do `APP_VERSION` em `constants.ts`.

```
constants.ts: APP_VERSION = '2.5.11'
      ↓
vite.config.ts (plugin swInjectPlugin)
      ↓
dist/sw.js: const CACHE_NAME = 'myplacar-v2.5.11';
```

A cada novo deploy com versão bumpeada, o browser detecta que o `sw.js` mudou, reinstala o SW, apaga o cache da versão anterior e baixa todos os assets novos. Sem bumpar o `APP_VERSION`, o cache não é invalidado e os usuários ficam na versão antiga.

---

## Diagrama Resumido

```
                        ┌─────────────────────────────────┐
                        │          AuthScreen.tsx          │
                        └───────────────┬─────────────────┘
                                        │
            ┌───────────────────────────┼────────────────────────────┐
            │                           │                            │
     ┌──────▼──────┐           ┌────────▼───────┐          ┌────────▼───────┐
     │  Login      │           │   Cadastro     │          │  Recuperação   │
     │  Senha/PIN  │           │   + Confirm    │          │  Senha/PIN     │
     │  Google     │           │   E-mail       │          │                │
     │  Biometria  │           │                │          │                │
     └──────┬──────┘           └────────┬───────┘          └────────┬───────┘
            │                           │                            │
            ▼                           ▼                            ▼
     Firebase Auth            EmailJS template_v9fhxz3      EmailJS template_wn0f65h
     Firestore                EmailJS template_wn0f65h      Firebase sendPasswordResetEmail
                              Firebase Auth (createUser)
                              Firestore (setDoc)
                              Supabase (mirrorUser)
```
