# Etapa1: prompt para mapear domínios de forma bruta:
Analise o material abaixo e levante uma lista bruta de domínios do sistema.
Para cada item, informe:

nome do domínio
descrição curta
tipo:

domínio claro
subdomínio
capacidade transversal
detalhe técnico
ambíguo

Depois agrupe em:

centrais/transversais
fluxo principal
periféricos/administrativos
técnicos/infraestruturais

Regras:

não inventar
não priorizar ainda
marcar hipóteses
apontar lacunas e ambiguidades

## Resultado - Etapa 1:
Lista bruta de domínios — MyPlacar

### 1) Tabela de domínios (não priorizada)

#	Nome	Descrição curta	Tipo
1	Game / Partida	Estado de uma partida (GameState, Player, pointHistory, sets, currentSet, isMatchOver). Núcleo do produto. Vive em modules/game (GameContext.tsx, useGame, useGameRules, useScoreboardEngine).	domínio claro
2	Scoreboard / Placar (UI)	Tela e overlays que exibem/operam o placar (ScoreboardScreen.tsx, ScoreboardDisplay.tsx, WatchBoard.tsx, modules/scoreBoard).	subdomínio (de Game)
3	Score Engines (esportes)	Motores de pontuação por modalidade: tennisEngine.ts, pickleballEngine.ts, scoreEngine.ts, sportEngine.ts. SportDefinition com grupos raquetes/coletivos/mesa/cartas/outros.	subdomínio (de Game)
4	Pickleball (estado isolado)	PickleballState, PickleballServerState, regras de saque/lados/rally, usePickleballAnnouncer. Tipos próprios em types.ts.	subdomínio (de Score Engines)
5	Tennis (regras)	tennisEngine.ts, tie-break, no-ad, golden rule, switchSidesOdd.	subdomínio (de Score Engines)
6	Live / Sessão ao vivo	Sessão multi-dispositivo de uma partida: LivePapel (owner/judge/observer/spectator), LiveType (controller/watcher), controllers, commandOwner, liveVersion, heartbeat. modules/live, LiveContext.tsx, useLiveActions, useLiveFirestoreSync.	domínio claro
7	Spectator / Public Scoreboard	Visualização sem controle: modules/spectator, SpectatorScreen, PublicScoreboardRoute, deep link via useDeepLinkScreen.	subdomínio (de Live)
8	Watch tokens	infrastructure/firebase/watchTokens.ts — tokens para visualizar partidas. Hipótese: relacionado a modos watch/spectator.	detalhe técnico — lacuna
9	Auth / Identidade	Login, PIN, password, passkey, e-mail verificado, reset; modules/auth (AuthScreen, Login), useAppAuth, useAppLogout, authSession.ts, authCodes.ts, passwordPolicy.ts, firebase/userProfiles.ts, firebase/users.ts.	domínio claro
10	User Profile	UserProfile (types.ts), ProfileScreen.tsx, profileDevice/profilePermissions/profileVersionUpdate. Inclui isAdmin, planType, premiumUntil.	domínio claro (com sobreposição com Auth)
11	Plano / Premium	Campos `planType: 'free'	'premium', premiumUntilemUserProfile`. Sem módulo dedicado. Hipótese: ainda embrionário.
12	Partners / Parceiros	Gestão de parceiros para duplas: Partner, modules/partners (10 services: addPartner, applyPartnerSelection, mergePartnersByPin, autoRegisterPartnerByPin, createReferral/Self/Manual/Queue/Partner, guessPartnerGender, sanitizePartnersForCloud).	domínio claro
13	Queue / Fila de jogadores	QueuePlayer, playerQueue em LS, createQueuePartner. Possivelmente subdomínio de Partners ou de Game (escolha de jogadores).	ambíguo
14	Teams / Times	Pasta modules/teams existe e TeamSection.tsx em settings. Lacuna: pasta listada mas conteúdo não inspecionado.	ambíguo — lacuna
15	Tournaments / Events	Eventos/torneios: TournamentEvent, TournamentMatch, TournamentPair, TournamentEntry. modules/events (TournamentsScreen, EventDetailScreen), services (joinTournamentEvent, updateTournamentMatchProgress, fetchRegisteredEvents, getActiveEventEntryDate), useTournamentSession.	domínio claro
16	History / Histórico de partidas	MatchHistoryItem, modules/history (createHistoryItem, filterHistory, groupHistoryByDate, persist/merge/markSynced/historySync), useHistoryCloud, HistorySection.tsx.	domínio claro
17	Communications / Comunicados	Mensagens e enquetes: Communication, PollOption, Reply, modules/communications (CommunicationsScreen, AdminCommunicationsPanel, notificationService.ts), useCommunicationsBadge.	domínio claro
18	Notifications (push/email)	Flags pushSent, emailSent em Communication; notificationService.ts; infrastructure/email.	capacidade transversal
19	Voice / Anunciante de voz	Comandos e narração de voz: VoiceCommands, useScoreAnnouncer, usePickleballAnnouncer, useVoiceControl, narratorGender, voiceCommands em MatchSettings.	capacidade transversal
20	AI / Gemini Referee	useGeminiReferee.ts, GeminiVoiceName, GeminiPersona, useGeminiVoice, GEMINI_API_KEY. Pasta infrastructure/ai aparece vazia (lacuna).	capacidade transversal — lacuna
21	Judge / Juiz	JudgeInfo, judge?.pin/nickname, useJudgeLookup, judgePin legado, eventos judge_added/removed.	subdomínio (de Live)
22	Settings / Configurações	MatchSettings + preferências globais: modules/settings (SettingsScreen, HelpScreen, ProfileScreen, SettingsTabs, SettingsHeader), useAppConfig.	domínio claro
23	Sport Icons / Assets visuais	customSportIcon(s), customCategoryIcons, cloudSportIcons/Categories, firebase/adminIcons.ts, LazySportIcon.tsx, ScoreboardIcon.tsx.	subdomínio (de Settings/Admin)
24	Admin	Painel administrativo: modules/admin (AdminScreen, AdminBottomNav, AdminEventsPanel, AdminUsersPanel, AdminVoiceRulesPanel, AdminConfirmModals, AdminSupabaseMigrationCard, AdminHiddenFileInputs, AdminStatusAlert), abas configs/users/icons/events/comms.	domínio periférico
25	Referral / Marketing	referredByPin, createReferralPartner, deep link ?ref=, initialReferralPin.	periférico
26	Deep Links / Navegação por URL	useDeepLinkScreen, getInitialScreen, appNavigation.ts, query params (reset password, join event, spectator, public-scoreboard, force logout).	capacidade transversal
27	App Routing / Telas	Screen enum, AppScreenRouter, rotas em src/app/* (AdminRoute, AuthRoute, EventDetailRoute, NewGameRoute, PartnersRoute, PublicScoreboardRoute, ScoreboardRoute, SettingsRoute).	técnico/infra
28	UI Context / Estado de UI	UIContext, modais globais, currentScreen, voiceLogs, drawer, GlobalOverlays, NavigationDrawer.	técnico/infra
29	Logger / Log de live	LiveLogEntry/LiveLogType, LogViewer, useAppLogger.	técnico/infra
30	Error Handling	ErrorBoundary.tsx, override de window.alert para modal.	técnico/infra
31	PWA / Install / Offline	useInstallPwa, InstallPwaModal, manifest, sw.js, inject-sw-version.mjs, useAppOfflineMode, useOnlineSync.	técnico/infra
32	Mobile / Capacitor	capacitor.config.ts. Empacotamento mobile.	técnico/infra
33	Wake Lock / Brightness / Screen Dim	useWakeLock, brightness, screenDimTimeout em settings.	capacidade transversal
34	Device / Identificação de dispositivo	useAppDeviceName, utils/device.ts, deviceLabel, ownerDeviceId, deviceType.	técnico/infra
35	Versioning / Migration de dados	CURRENT_DATA_VERSION, useVersionTap, profileVersionUpdate, processo_versioning.md.	técnico/infra
36	Match Timer / Pause	useMatchTimer, matchDuration, isPaused, accumulatedPausedTime.	subdomínio (de Game)
37	Cloud Mirror / Sync	useRemoteCloudMatch, supabaseMirror, infrastructure/supabase/mirror.ts, historySync.ts, mergeDownloadedHistory.ts, cloudSync flag.	técnico/infra
38	Firebase Infra (Firestore)	infrastructure/firebase/* — client, matches, liveMatches, users, userProfiles, events, communications, systemConfig, watchTokens, adminEvents, adminIcons.	técnico/infra
39	Supabase Infra	infrastructure/supabase/* — client, matches, mirror, adminMigration; integrations/supabase/client.ts. Hipótese: migração em curso (Firebase → Supabase) confirmada por AdminSupabaseMigrationCard.	técnico/infra
40	Email Infra	infrastructure/email/index.ts (~10KB), api/enviar-email.js, api/gerar-link-reset.js, teste-ses.js (sugere AWS SES — hipótese).	técnico/infra
41	Serverless API (Vercel functions)	api/enviar-email.js, api/gerar-link-reset.js.	técnico/infra
42	System Config	firebase/systemConfig.ts, system/config Firestore doc, appUrl, handleCheckUpdate.	periférico
43	Location / Geo	LocationScreen.tsx (em modules/history!), campo location: {lat,lng} em MatchHistoryItem. Ambiguidade: localização está sob history.	ambíguo — lacuna
44	Help / Onboarding	HelpScreen.tsx em settings.	periférico
45	Stats / Estatísticas	stats: {p1Aces, p2Aces, p1Faults, p2Faults, totalPoints} em MatchHistoryItem, MatchTimeline.tsx.	subdomínio (de History/Game)
46	Reactions / Polls / Replies	Em Communication (reactions, poll, replies, readBy).	subdomínio (de Communications)
47	Sanitização / Validação	utils/sanitize.ts, validation.ts, safeJsonParse.ts.	técnico/infra

### 2) Agrupamento
# A. Centrais / Transversais
Game / Partida (1) — núcleo
Live / Sessão ao vivo (6) — núcleo de uso multi-device
Auth / Identidade (9)
User Profile (10)
Voice / Anunciante (19) — transversal
AI / Gemini Referee (20) — transversal
Deep Links / Navegação por URL (26) — transversal
Notifications (push/email) (18) — transversal
Wake Lock / Brightness / Screen Dim (33) — transversal

# B. Fluxo principal
Scoreboard / Placar (UI) (2)
Score Engines (3) → Tennis (5), Pickleball (4)
Match Timer / Pause (36)
History (16) + Stats (45)
Spectator / Public Scoreboard (7)
Judge (21)
Partners (12) + Queue (13) + Teams (14, lacuna)
Tournaments / Events (15)
Settings (22) + Sport Icons (23)
Communications (17) + Reactions/Polls/Replies (46)

# C. Periféricos / Administrativos
Admin (24)
Help / Onboarding (44)
Referral / Marketing (25)
Plano / Premium (11) — embrionário
System Config (42)
Location / Geo (43) — ambíguo

# D. Técnicos / Infraestruturais
App Routing / Telas (27)
UI Context (28)
Logger / Log de live (29)
Error Handling (30)
PWA / Install / Offline (31)
Mobile / Capacitor (32)
Device (34)
Versioning / Migration (35)
Cloud Mirror / Sync (37)
Firebase Infra (38)
Supabase Infra (39)
Email Infra (40)
Serverless API (Vercel) (41)
Watch tokens (8) — hipótese
Sanitização / Validação (47)

### 3) Hipóteses, lacunas e ambiguidades
# Hipóteses (marcadas):
(8) watchTokens provavelmente serve para autorizar acesso de modo watch/spectator — não verificado em código.
(11) Plano free/premium parece embrionário (sem módulo billing/subscription).
(39) Migração Firebase → Supabase em curso (existe AdminSupabaseMigrationCard + adminMigration.ts + mirror.ts); ainda não há substituição completa.
(40) teste-ses.js sugere AWS SES como provider de email.

# Lacunas:
src/infrastructure/ai/ aparece sem arquivos no listing — código de IA está em hooks/useGeminiReferee.ts, não na pasta dedicada.
src/modules/teams/ listado mas não inspeccionado (conteúdo desconhecido).
src/shared/types/ e src/shared/hooks/ listados mas vazios no glob.
src/services/ quase vazio (só supabaseMirror.ts) — papel pouco definido vs infrastructure/.
Não há módulo billing/subscription apesar dos campos planType/premiumUntil.
Não há módulo dedicado a queue de jogadores — está espalhado.

# Ambiguidades de fronteira:
Queue (13) — pertence a Partners ou a Game/NewGame?
Teams (14) — pasta dedicada existe mas há TeamSection.tsx dentro de settings/components. Fronteira incerta.
Location (43) — LocationScreen vive em modules/history mas conceitualmente é geo de partidas; coleção/campo está em MatchHistoryItem.
Judge (21) — fica entre Live (papel) e Partners (lookup useJudgeLookup).
Voice (19) vs AI (20) — useGeminiVoice está em MatchSettings (Game/Settings) mas a lógica vive em hooks transversais; fronteira indefinida.
User Profile (10) vs Auth (9) — alta sobreposição (PIN é identificador e credencial).
Sport Icons (23) — gerenciados em Admin, persistidos em MatchSettings e em cloud (Firestore); pertencem a Settings, Admin ou Assets?
Notifications (18) — vive entre Communications e Email Infra; ainda não tem módulo próprio.
Cloud Mirror (37) vs Supabase Infra (39) — sobrepostos: mirror.ts é parte da migração.
Routing (27) está parcialmente em src/app/*Route.tsx e parcialmente no enum Screen + AppScreenRouter.

# Etapa2: prompt para classificar domínio:
Classifique e priorize os domínios abaixo.
Para cada domínio, informe:

categoria
impacto (1 a 5)
centralidade (1 a 5)
complexidade (1 a 5)
risco (1 a 5)
incerteza (1 a 5)
prioridade total
justificativa curta
recomendação
próxima ação

Regras:

separar fato, inferência e lacuna
não inventar
ser objetivo

Régua:

21 a 25 = mapear agora
16 a 20 = segunda onda
10 a 15 = mapear depois
5 a 9 = backlog

Domínios: 
C. Periféricos / Administrativos
Admin (24)
Help / Onboarding (44)
Referral / Marketing (25)
Plano / Premium (11) — embrionário
System Config (42)
Location / Geo (43) — ambíguo
D. Técnicos / Infraestruturais
App Routing / Telas (27)
UI Context (28)
Logger / Log de live (29)
Error Handling (30)
PWA / Install / Offline (31)
Mobile / Capacitor (32)
Device (34)
Versioning / Migration (35)
Cloud Mirror / Sync (37)
Firebase Infra (38)
Supabase Infra (39)
Email Infra (40)
Serverless API (Vercel) (41)
Watch tokens (8) — hipótese
Sanitização / Validação (47)


## Resultado - Etapa 2:

Classificação e Priorização — Domínios Centrais / Transversais
Tabela de scores
#	Domínio	Impacto	Centralidade	Complexidade	Risco	Incerteza	Total	Faixa
6	Live / Sessão ao vivo	5	5	5	5	3	23	Mapear agora
1	Game / Partida			5	5	5	5	2	22	Mapear agora
9	Auth / Identidade		4	4	4	4	3	19	Segunda onda
10	User Profile			3	4	3	3	3	16	Segunda onda
19	Voice / Anunciante		3	3	4	3	3	16	Segunda onda
18	Notifications			3	2	3	3	4	15	Mapear depois
20	AI / Gemini Referee		2	2	3	3	4	14	Mapear depois
26	Deep Links / Navegação	3	3	2	2	2	12	Mapear depois
33	Wake Lock / Brightness	2	2	1	1	1	7	Backlog

# Detalhamento por domínio
1. Live / Sessão ao vivo — Total: 23 (MAPEAR AGORA)
Dimensão	Score	Base
Impacto	5	Fato: feature diferenciadora do produto (multi-device em tempo real)
Centralidade	5	Fato: acoplado a Game, Spectator, Judge, Controllers, Tournaments
Complexidade	5	Fato: useLiveFirestoreSync = 48KB; LiveContext = 23KB; heartbeat + controller handoff + liveVersion anti-stale
Risco	5	Inferência: race conditions multi-device, perda de controle, writes stale entre troca de posse
Incerteza	3	Lacuna: interação exata entre commandOwner e liveVersion não está em doc explícito; depende de leitura do hook de 48KB

# Justificativa: É o domínio com mais estado distribuído e mais cenários de falha concorrente. Qualquer mudança em Game/Scoreboard pode quebrar Live silenciosamente.

# Recomendação: Mapear máquina de estados (papéis × tipos × transitions) antes de qualquer refatoração em Game.

# Próxima ação: Extrair diagrama de estados LivePapel × LiveType × commandOwner com transições documentadas a partir do useLiveFirestoreSync.tsx.

2. Game / Partida — Total: 22 (MAPEAR AGORA)
Dimensão	Score	Base
Impacto	5	Fato: GameContext.tsx = 67KB; ScoreboardScreen.tsx = 129KB; todo o produto gira em torno de GameState
Centralidade	5	Fato: referenciado por Live, History, Tournaments, Partners, Settings, Spectator
Complexidade	5	Fato: GameState tem ~50 campos; 3 engines de pontuação; pickleball state isolado; undo/redo via pointHistory
Risco	5	Fato: arquivo de 129KB de tela + 67KB de context = alta probabilidade de regressão a cada mudança
Incerteza	2	Fato: bem tipado (types.ts), documentado (APP_LOGIC_INVENTORY), engines com funções puras

# Justificativa: Maior concentração de lógica do sistema. Riscos vêm do tamanho, não de indefinição.

# Recomendação: Mapear fronteiras internas (engine × state × UI × config) para identificar seams de extração.

# Próxima ação: Catalogar as responsabilidades de GameContext.tsx (handlers, effects, state slices) para identificar sub-contextos naturais.

3. Auth / Identidade — Total: 19 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	4	Fato: porta de entrada de toda interação autenticada
Centralidade	4	Fato: ownerPin permeia Game, Live, Tournaments, Partners, History
Complexidade	4	Fato: AuthScreen.tsx = 65KB; 4 métodos (PIN, password, passkey, email); authSession.ts, authUrls.ts
Risco	4	Inferência: coexistência de PIN (identidade) + Firebase Auth + passkey → caminhos de fallback pouco claros
Incerteza	3	Lacuna: status real do passkey (implementado? beta?); fronteira entre PIN (identidade local) e Firebase Auth (identidade cloud) não documentada explicitamente

# Justificativa: Não bloqueia refatorações de Game/Live agora, mas qualquer mudança de identidade afeta todos os domínios.

# Recomendação: Documentar a relação entre pin, uid (Firebase Auth) e passkeyCredentialId antes de tocar em auth.

# Próxima ação: Mapear os 4 fluxos de autenticação (PIN simples, password+email, passkey, referral) e seus pontos de convergência.

4. User Profile — Total: 16 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	3	Fato: configurações pessoais, plano, admin flag
Centralidade	4	Fato: consumido por Game (ownerPin), Admin (isAdmin), Partners, Live
Complexidade	3	Fato: ProfileScreen.tsx = 32KB; ~15 campos em UserProfile
Risco	3	Inferência: campos planType/premiumUntil existem mas sem lógica de enforcement visível
Incerteza	3	Lacuna: fronteira com Auth indefinida (ambos manipulam o mesmo doc users/{id})

# Justificativa: Estável, mas overlap com Auth pode gerar confusão. Premium sem enforcement = debt latente.

# Recomendação: Definir boundary explícita Auth (credenciais/sessão) vs Profile (dados do usuário).

# Próxima ação: Listar quais writes vão para users/ de Auth vs Profile vs Admin para delimitar ownership.

5. Voice / Anunciante — Total: 16 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	3	Fato: feature de uso ativo durante partidas (acessibilidade + experiência)
Centralidade	3	Fato: consome MatchSettings, pointHistory, GameState; toca Settings e Scoreboard
Complexidade	4	Fato: useScoreAnnouncer = 27KB; usePickleballAnnouncer = 10KB; speech synthesis + Gemini voice + comandos de voz
Risco	3	Inferência: variação de API de speech entre navegadores/devices
Incerteza	3	Lacuna: fronteira Voice vs AI/Gemini indefinida (ambos lidam com narração)

# Justificativa: Grande em código, mas isolável — depende de Game, não é dependido por outros domínios.

# Recomendação: Tratar como domínio consumidor de Game (read-only do state). Definir interface clara com Gemini.

# Próxima ação: Mapear quais dados de GameState cada announcer consome para definir a interface mínima.

6. Notifications (push/email) — Total: 15 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: engajamento de usuários via communications
Centralidade	2	Fato: restrito a modules/communications + infrastructure/email
Complexidade	3	Inferência: push browser + email (AWS SES?) + serverless functions
Risco	3	Inferência: deliverability, permissões de push, dependência externa
Incerteza	4	Lacuna: implementação de push não localizada; AWS SES é hipótese (baseado em teste-ses.js); notificationService.ts tem apenas 2KB

# Justificativa: Domínio com mais incerteza que complexidade comprovada. Scope real pode ser menor do que aparenta.

# Recomendação: Verificar se push está de fato implementado ou é apenas placeholder.

# Próxima ação: Ler notificationService.ts e infrastructure/email/index.ts para confirmar implementação real.

7. AI / Gemini Referee — Total: 14 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	2	Inferência: feature opcional/experimental (enhancement sobre Voice)
Centralidade	2	Fato: hook isolado (useGeminiReferee = 10KB), sem dependentes
Complexidade	3	Fato: integração com API Gemini, personas, vozes nomeadas
Risco	3	Inferência: dependência de API key + quota + latência externa
Incerteza	4	Lacuna: infrastructure/ai/ vazia; não há doc sobre status (experimental? produção?); boundary com Voice não definida

#Justificativa: Isolado e provavelmente experimental. Baixa prioridade para mapeamento detalhado.

# Recomendação: Manter isolado. Classificar como feature flag até clarificar maturidade.

# Próxima ação: Verificar se useGeminiReferee é chamado condicionalmente (feature flag) ou sempre ativo.

8. Deep Links / Navegação por URL — Total: 12 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: habilita compartilhamento, spectator, reset de senha, join de torneio
Centralidade	3	Fato: toca Auth, Spectator, Events, Public Scoreboard
Complexidade	2	Fato: useDeepLinkScreen = 1.8KB; appNavigation.ts = 1.3KB; URL parsing simples
Risco	2	Fato: stateless na maioria; baixo acoplamento
Incerteza	2	Fato: bem mapeado no APP_LOGIC_INVENTORY (linhas, blocos, destinos)

# Justificativa: Pequeno, bem entendido, baixo risco. Já foi extraído para hooks dedicados.

# Recomendação: Deixar como está. Revisitar apenas se routing mudar (ex.: migração para React Router).

# Próxima ação: Nenhuma imediata. Incluir em review se houver migração de navegação.

9. Wake Lock / Brightness / Screen Dim — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: melhoria de UX durante partidas ativas
Centralidade	2	Fato: usado apenas no Scoreboard ativo
Complexidade	1	Fato: useWakeLock = 1.1KB; usa API nativa do browser
Risco	1	Fato: API bem suportada, fallback silencioso se indisponível
Incerteza	1	Fato: escopo completamente definido (3 campos em settings)

# Justificativa: Trivial e autocontido. Zero necessidade de mapeamento adicional.

# Recomendação: Ignorar em qualquer esforço de mapeamento/refatoração.

# Próxima ação: Nenhuma.

Resumo visual por faixa
┌─────────────────────────────────────────────────────────┐
│  MAPEAR AGORA (21-25)                                   │
│  ■ Live / Sessão ao vivo .............. 23              │
│  ■ Game / Partida ..................... 22              │
├─────────────────────────────────────────────────────────┤
│  SEGUNDA ONDA (16-20)                                   │
│  □ Auth / Identidade .................. 19              │
│  □ User Profile ....................... 16              │
│  □ Voice / Anunciante ................. 16              │
├─────────────────────────────────────────────────────────┤
│  MAPEAR DEPOIS (10-15)                                  │
│  ○ Notifications ...................... 15              │
│  ○ AI / Gemini Referee ................ 14              │
│  ○ Deep Links ......................... 12              │
├─────────────────────────────────────────────────────────┤
│  BACKLOG (5-9)                                          │
│  · Wake Lock / Brightness .............. 7              │
└─────────────────────────────────────────────────────────┘

Classificação e Priorização — Domínios do Fluxo Principal
Tabela de scores
#	Domínio	Impacto	Centralidade	Complexidade	Risco	Incerteza	Total	Faixa
2	Scoreboard / Placar (UI)				5	5	5	4	2	21	Mapear agora
3+4+5	Score Engines (Tennis + Pickleball)	5	4	4	3	2	18	Segunda onda
12+13+14	Partners + Queue + Teams		4	3	4	3	4	18	Segunda onda
15	Tournaments / Events					4	3	4	3	3	17	Segunda onda
16+45	History + Stats						4	3	3	3	2	15	Mapear depois
22+23	Settings + Sport Icons				3	4	3	2	2	14	Mapear depois
7	Spectator / Public Scoreboard			3	3	2	2	2	12	Mapear depois
17+46	Communications + Polls/Replies		3	2	3	2	2	12	Mapear depois
21	Judge									2	2	2	2	2	10	Mapear depois
36	Match Timer / Pause						2	2	1	1	1	7	Backlog

Detalhamento por domínio
1. Scoreboard / Placar (UI) — Total: 21 (MAPEAR AGORA)
Dimensão	Score	Base
Impacto			5	Fato: tela principal durante partida; onde o usuário passa 95% do tempo de uso ativo
Centralidade	5	Fato: consome Game, Live, Voice, Timer, Engines, Settings; é surface de todos os domínios core
Complexidade	5	Fato: ScoreboardScreen.tsx = 129KB (maior arquivo do projeto); ScoreboardDisplay.tsx = 21KB; WatchBoard.tsx = 27KB
Risco			4	Inferência: arquivo monolítico de 129KB = qualquer mudança pode regredir comportamento; mix de lógica e UI no mesmo arquivo
Incerteza		2	Fato: comportamento observável; tipagem forte via GameState; já usa useGame() / useLive()

# Justificativa: Maior arquivo do projeto e surface de interação primária. Concentra rendering + handlers + efeitos colaterais num único monolito.

# Recomendação: Mapear responsabilidades internas (quais blocos são rendering puro, quais são lógica de domínio, quais são efeitos Live).

# Próxima ação: Inventariar ScoreboardScreen.tsx por blocos (como feito com App.tsx no APP_LOGIC_INVENTORY) para identificar seams de extração.

2. Score Engines (Tennis + Pickleball) — Total: 18 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	5	Fato: regras de pontuação = core business; erros aqui = placar errado exibido
Centralidade	4	Fato: consumidos por Game/Scoreboard, mas com poucos dependentes (são "folhas" computacionais)
Complexidade	4	Fato: pickleballEngine.ts = 30KB (rally/side-out/duplas/simples, first-server rule); tennisEngine.ts = 7KB (tie-break, no-ad, golden rule); scoreEngine.ts = 3KB; sportEngine.ts = 966B
Risco	3	Fato: funções puras → testáveis, mas erro = impacto direto no resultado da partida
Incerteza	2	Fato: regras esportivas bem definidas; lógica determinística; tipos fortemente tipados (PickleballState, CourtSide, PickleballScoringMode)
Justificativa: Lógica de negócio pura e isolável. Alto impacto mas baixa incerteza — ideal para testes unitários.

Recomendação: Garantir cobertura de testes antes de refatorar Game/Scoreboard. São o "contrato" do domínio Game.

Próxima ação: Verificar se existem testes para engines; se não, listar cenários críticos (tie-break, side-out transition, first-server, match over).

3. Partners + Queue + Teams — Total: 18 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	4	Fato: define quem joga; alimenta duplas, torneios, seleção de jogadores
Centralidade	3	Fato: alimenta NewGame, Tournaments (pairs), Live (judge lookup), History (involvedPins)
Complexidade	4	Fato: PartnersScreen.tsx = 52KB; TeamSection.tsx = 32KB; 10 services em partners/services; 3 origens (referral/qrcode/manual); merge por PIN
Risco	3	Inferência: merge de partners por PIN pode gerar duplicatas; lógica de gênero inferido
Incerteza	4	Lacuna: modules/teams/ existe mas conteúdo não inspecionado; TeamSection vive em settings/components (não em teams); Queue sem módulo dedicado; fronteira Teams vs Partners indefinida
Justificativa: Domínio com a maior incerteza deste grupo. Três conceitos (Partners, Queue, Teams) sem fronteiras claras.

Recomendação: Inspecionar modules/teams/ e TeamSection.tsx para entender se Teams é um domínio separado ou apenas uma view sobre Partners.

Próxima ação: Abrir modules/teams/ e TeamSection.tsx para resolver se há duplicação ou apenas naming inconsistente.

4. Tournaments / Events — Total: 17 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	4	Fato: jogo organizado — diferenciador para uso em clubes/eventos
Centralidade	3	Fato: depende de Partners (pairs), Game (match state), Live (tornamentPin/MatchId), Auth (pin/coAdmin)
Complexidade	4	Fato: EventDetailScreen.tsx = 52KB; tipos compostos (TournamentEvent com arrays de matches[], pairs[], config); useTournamentSession = 6.2KB
Risco	3	Inferência: progressão de matches num torneio (status waiting→live→finished) com múltiplos atores (coAdminPins)
Incerteza	3	Lacuna: como um TournamentMatch interage com a live_matches/{pin} durante execução; estado intermediário quando partida de torneio é cancelada/resetada
Justificativa: Feature de alto valor mas com interação complexa com Live durante execução.

Recomendação: Mapear o ciclo de vida TournamentMatch → live_matches → match_history para entender handoffs.

Próxima ação: Traçar o fluxo de joinTournamentEvent → updateTournamentMatchProgress → conclusão para documentar transições.

5. History + Stats — Total: 15 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	4	Fato: persistência de resultados = valor acumulado para o usuário
Centralidade	3	Fato: consome saída de Game; alimenta sync cloud; lido por Profile
Complexidade	3	Fato: 9 services (create/filter/group/persist/merge/sync/markSynced/remove/getUnsynced); useHistoryCloud = 7.5KB; HistorySection = 17KB
Risco	3	Inferência: merge local/cloud pode perder ou duplicar dados; isSynced flag como controle de consistência
Incerteza	2	Fato: MatchHistoryItem bem tipado; services com nomes autoexplicativos; fluxo documentado
Justificativa: Importante mas estável e bem isolado. O risco principal é sync/merge, não arquitetura.

Recomendação: Tratar como domínio "resolvido" na arquitetura. Foco em robustez do sync, não refatoração.

Próxima ação: Verificar edge cases de mergeDownloadedHistory + historySync para garantir idempotência.

6. Settings + Sport Icons — Total: 14 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: configura comportamento de todos os jogos, mas é write-once/read-many
Centralidade	4	Fato: MatchSettings (~50 campos) consumido por Game, Engines, Voice, Live, Scoreboard
Complexidade	3	Fato: SettingsScreen.tsx = 11KB (relativamente enxuto); complexidade está no tipo, não na UI
Risco	2	Fato: config estática durante partida; erros aparecem antes de iniciar jogo
Incerteza	2	Fato: tipo MatchSettings bem documentado em types.ts; campos declarativos
Justificativa: Tipo grande mas comportamento simples (key-value store). Centralidade alta mas risco baixo.

Recomendação: Manter como está. Considerar split de MatchSettings em sub-tipos (sport config, voice config, display config) apenas se extrair sub-contextos de Game.

Próxima ação: Nenhuma imediata. Revisitar se/quando Game for decomposto em sub-contextos.

7. Spectator / Public Scoreboard — Total: 12 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: habilita audiência/compartilhamento de partidas ao vivo
Centralidade	3	Fato: depende de Live (estado), Deep Links (entrada), Game (rendering)
Complexidade	2	Fato: SpectatorScreen.tsx = 13KB; consumidor read-only do estado
Risco	2	Fato: read-only = sem side effects; falhas são visuais, não de dados
Incerteza	2	Fato: papel observer/spectator definido em LivePapel; fluxo claro
Justificativa: Domínio consumidor, não produtor. Baixa complexidade e risco.

Recomendação: Tratar como view sobre Live. Mapear apenas se necessário alterar permissões de visualização.

Próxima ação: Nenhuma prioritária.

8. Communications + Polls/Replies — Total: 12 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: comunicação com comunidade, enquetes, avisos
Centralidade	2	Fato: módulo isolado; toca apenas Admin (painel de gestão) e Notifications
Complexidade	3	Fato: CommunicationsScreen = 15KB; AdminCommunicationsPanel = 16KB; subtypes (Poll, Reply, reactions)
Risco	2	Fato: módulo autocontido; blast radius limitado ao próprio domínio
Incerteza	2	Fato: tipo Communication completo em types.ts; estrutura clara
Justificativa: Feature "social" isolada do fluxo core de partidas. Sem dependentes críticos.

Recomendação: Manter isolado. Evoluir independentemente do core (Game/Live).

Próxima ação: Nenhuma imediata. Revisar se Notifications for priorizado.

9. Judge — Total: 10 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	2	Fato: papel opcional em sessões live; não obrigatório para jogo funcionar
Centralidade	2	Fato: subconjunto de Live; usa Partners para lookup
Complexidade	2	Fato: JudgeInfo = 4 campos; useJudgeLookup = 1.2KB; coexistência campo legado + novo
Risco	2	Inferência: deprecação de judgePin/judgeNickname → judge sub-objeto; risco de leitura de docs antigos
Incerteza	2	Fato: migração documentada no tipo (@deprecated + T4.3); path claro
Justificativa: Escopo pequeno e caminho de migração já definido. Baixa prioridade.

Recomendação: Completar migração de campos legados quando tocar em Live.

Próxima ação: Incluir como sub-item ao mapear Live (verificar se leitura de docs antigos ainda usa campos legados).

10. Match Timer / Pause — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: feature auxiliar (duração/pausa); não afeta pontuação
Centralidade	2	Fato: lido por Game (matchDuration, isPaused) e salvo em History
Complexidade	1	Fato: useMatchTimer = 1KB; lógica trivial (start/stop/accumulate)
Risco	1	Fato: isolado; erros = tempo exibido incorreto, sem impacto em pontuação
Incerteza	1	Fato: campos claros (matchDuration, isPaused, accumulatedPausedTime, lastPauseTime)
Justificativa: Trivial e completamente autocontido. Zero necessidade de mapeamento.

Recomendação: Ignorar em esforços de mapeamento/refatoração.

Próxima ação: Nenhuma.

Resumo visual por faixa
┌─────────────────────────────────────────────────────────┐
│  MAPEAR AGORA (21-25)                                   │
│  ■ Scoreboard / Placar (UI) ........... 21              │
├─────────────────────────────────────────────────────────┤
│  SEGUNDA ONDA (16-20)                                   │
│  □ Score Engines (Tennis + Pickleball). 18              │
│  □ Partners + Queue + Teams ........... 18              │
│  □ Tournaments / Events ............... 17              │
├─────────────────────────────────────────────────────────┤
│  MAPEAR DEPOIS (10-15)                                  │
│  ○ History + Stats .................... 15              │
│  ○ Settings + Sport Icons ............. 14              │
│  ○ Spectator / Public Scoreboard ...... 12              │
│  ○ Communications + Polls/Replies ..... 12              │
│  ○ Judge .............................. 10              │
└─────────────────────────────────────────────────────────┘


Classificação e Priorização — Domínios Periféricos e Técnicos
C. Periféricos / Administrativos
#	Domínio	Impacto	Centralidade	Complexidade	Risco	Incerteza	Total	Faixa
24	Admin					3	3	4	2	2	14	Mapear depois
11	Plano / Premium			3	2	1	2	4	12	Mapear depois
43	Location / Geo			2	2	2	2	3	11	Mapear depois
25	Referral / Marketing	2	2	2	2	2	10	Mapear depois
42	System Config			2	2	1	1	1	7	Backlog
44	Help / Onboarding		1	1	1	1	1	5	Backlog

Admin (24) — Total: 14 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: gerencia config global, usuários, ícones, voice rules, eventos; afeta toda a plataforma
Centralidade	3	Fato: AdminScreen (665 linhas) importa de 10+ módulos: firebase/admin*, supabase/migration, events, communications, auth
Complexidade	4	Fato: 665 linhas + 10 componentes filhos; gerencia 5 tabs (configs/users/icons/events/comms); upload de ícones; sport engine config
Risco	2	Fato: restrito a admins (isAdmin flag); blast radius limitado a quem opera o painel
Incerteza	2	Fato: componentes bem decompostos em admin/components/*; services separados
Justificativa: Complexo internamente mas isolado do fluxo do usuário final. Refatorar quando necessário, não urgente.

Recomendação: Tratar como módulo "fechado". Revisar apenas se surgir necessidade de novos fluxos admin.

Próxima ação: Nenhuma prioritária. Considerar se migração Supabase exigir mudanças no AdminScreen.

Plano / Premium (11) — Total: 12 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Inferência: monetização futura; campos existem mas sem enforcement
Centralidade	2	Fato: apenas 2 campos em UserProfile (planType, premiumUntil); consumidos somente pelo Admin
Complexidade	1	Fato: zero lógica; campos declarativos sem guards, gates ou billing
Risco	2	Inferência: sem enforcement = qualquer feature "premium" pode ser acessada por free; risco de segurança se não gated
Incerteza	4	Lacuna: sem módulo billing, sem serviço de subscription, sem UI de upgrade, sem definição de quais features seriam premium
Justificativa: Debt de produto, não técnico. Campos sem significado operacional hoje.

Recomendação: Documentar como decisão pendente de produto. Não implementar enforcement sem requisitos claros.

Próxima ação: Registrar como item de backlog de produto: "Definir quais features são premium e desenhar fluxo de billing".

Location / Geo (43) — Total: 11 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	2	Fato: feature de visualização de mapa de partidas jogadas
Centralidade	2	Fato: LocationScreen = 159 linhas; lê de Game e Firebase; vive em modules/history
Complexidade	2	Fato: integração Leaflet, CircleMarkers, admin trigger oculto (tap counter → fetch all cloud matches)
Risco	2	Fato: read-only; dependência externa (leaflet); não afeta dados
Incerteza	3	Lacuna: posicionado em modules/history mas conceitualmente é geo; hidden admin view (easter egg?) não documentado; unclear se geolocation é coletado ativamente durante jogo
Justificativa: Feature isolada com ambiguidade de ownership. Não bloqueia nada.

Recomendação: Clarificar se geolocation é coletada (e quando) vs preenchida manualmente. Mover para submódulo próprio se crescer.

Próxima ação: Verificar onde o campo location: {lat, lng} é populado em MatchHistoryItem (ativo vs passivo).

Referral / Marketing (25) — Total: 10 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	2	Fato: mecanismo de growth (indicação por PIN via deep link)
Centralidade	2	Fato: toca Auth (URL params), Partners (createReferralPartner), deep links (?ref=)
Complexidade	2	Fato: fluxo simples: URL param → salva referredByPin → cria partner com origin 'referral'
Risco	2	Fato: baixo blast radius; falha = parceiro não criado automaticamente
Incerteza	2	Fato: código existe e funciona; unclear se há tracking/analytics associado
Justificativa: Funcional mas simples. Sem necessidade de mapeamento adicional.

Recomendação: Manter como está. Revisitar se houver demanda de analytics ou AB testing.

Próxima ação: Nenhuma.

System Config (42) — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: app-wide defaults (URL, version, error sound, golden rule, voice commands)
Centralidade	2	Fato: lido por useAppConfig; escrito por Admin
Complexidade	1	Fato: systemConfig.ts = 22 linhas; 2 funções (fetch + patch)
Risco	1	Fato: CRUD trivial; doc único no Firestore
Incerteza	1	Fato: interface FirebaseSystemConfig clara, campos documentados
Justificativa: Trivial e estável. Autocontido.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Help / Onboarding (44) — Total: 5 (BACKLOG)
Dimensão	Score	Base
Impacto	1	Fato: tela informativa estática
Centralidade	1	Fato: sem dependentes; nenhum módulo consome dados de Help
Complexidade	1	Fato: HelpScreen.tsx = 76 linhas; cards estáticos com ícones
Risco	1	Fato: zero side effects
Incerteza	1	Fato: trivial, props parcialmente unused
Justificativa: Irrelevante para mapeamento de domínio.

Recomendação: Ignorar completamente.

Próxima ação: Nenhuma.

D. Técnicos / Infraestruturais
#	Domínio	Impacto	Centralidade	Complexidade	Risco	Incerteza	Total	Faixa
38	Firebase Infra				5	5	3	3	2	18	Segunda onda
37	Cloud Mirror / Sync			4	3	3	4	3	17	Segunda onda
39	Supabase Infra				3	2	3	4	4	16	Segunda onda
27	App Routing / Telas			3	4	3	3	2	15	Mapear depois
31	PWA / Install / Offline		3	3	3	3	2	14	Mapear depois
28	UI Context					3	4	2	2	2	13	Mapear depois
35	Versioning / Migration		3	2	2	3	2	12	Mapear depois
40	Email Infra					2	2	2	2	3	11	Mapear depois
47	Sanitização / Validação		3	3	1	2	1	10	Mapear depois
41	Serverless API (Vercel)		2	2	1	2	2	9	Backlog
32	Mobile / Capacitor			2	1	1	1	3	8	Backlog
29	Logger / Log de live		2	2	1	1	1	7	Backlog
30	Error Handling				2	2	1	1	1	7	Backlog
34	Device						2	2	1	1	1	7	Backlog
8	Watch tokens				2	1	1	1	2	7	Backlog

Firebase Infra (38) — Total: 18 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	5	Fato: backend de todo o app; toda persistência passa por aqui
Centralidade	5	Fato: 13 arquivos consumidos por Game, Live, History, Auth, Admin, Communications, Events, Settings
Complexidade	3	Fato: camadas CRUD finas (maioria < 50 linhas); matches.ts = 4KB e users.ts = 4.6KB são os maiores
Risco	3	Inferência: migração para Supabase em curso → risco de dual-write inconsistente; quota Firestore
Incerteza	2	Fato: API estável; coleções documentadas em docs/05-api-and-data-models.md
Justificativa: Pilar fundamental do sistema. Simples individualmente mas crítico coletivamente. Migração em curso adiciona risco.

Recomendação: Mapear quais coleções já são espelhadas no Supabase vs exclusivas Firebase para entender o estado da migração.

Próxima ação: Cruzar infrastructure/firebase/*.ts vs infrastructure/supabase/mirror.ts para listar o que já foi duplicado.

Cloud Mirror / Sync (37) — Total: 17 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	4	Fato: persistência cross-device; dados duplicados entre Firebase e Supabase
Centralidade	3	Fato: toca History (historySync), Live (liveMatches), Supabase (mirror), Firebase (matches)
Complexidade	3	Fato: mirror.ts = 161 linhas (upsert users/matches/partners/icons); historySync = merge local/cloud; useHistoryCloud = 7.5KB
Risco	4	Inferência: dual-write Firebase+Supabase = potencial inconsistência; merge logic pode perder ou duplicar dados
Incerteza	3	Lacuna: unclear quando writes vão só para Firebase, só Supabase, ou ambos; sem doc de decisão sobre migração completa
Justificativa: Ponto de maior risco de consistência de dados no sistema. Dual-write sem estratégia clara documentada.

Recomendação: Documentar a estratégia de migração: qual é source-of-truth? Firebase-first + Supabase-mirror? Ou em transição para Supabase-primary?

Próxima ação: Mapear cada operação de write e classificar como Firebase-only / Supabase-only / dual-write para detectar gaps.

Supabase Infra (39) — Total: 16 (SEGUNDA ONDA)
Dimensão	Score	Base
Impacto	3	Fato: importância crescente conforme migração avança
Centralidade	2	Fato: hoje é secundário; consumido por mirror, adminMigration, History (match mirror)
Complexidade	3	Fato: 5 arquivos; adminMigration = 71 linhas (one-shot bulk); mirror.ts = 161 linhas (upsert functions com error suppression)
Risco	4	Inferência: migração em progresso sem completude definida; warn() supprime erros de conflito silenciosamente
Incerteza	4	Lacuna: sem doc de migração (timeline, escopo, rollback plan); AdminSupabaseMigrationCard sugere operação manual one-shot; incerto se é backup ou replacement
Justificativa: Maior incerteza entre os domínios técnicos. Estratégia de migração não documentada = risco latente.

Recomendação: Produzir ADR (Architecture Decision Record) sobre a migração: motivação, escopo, timeline, estratégia de fallback.

Próxima ação: Documentar decisão: Supabase é mirror de backup? Substituição futura do Firestore? Ou coexistência permanente?

App Routing / Telas (27) — Total: 15 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: orquestra navegação entre todas as telas
Centralidade	4	Fato: AppScreenRouter (291 linhas) renderiza todas as telas; consome useLive, useGame, useUI
Complexidade	3	Fato: interface AppScreenRouterProps grande; lazy imports; mix de overlays + navigation
Risco	3	Inferência: alteração em props pode quebrar qualquer tela; sem React Router (tudo manual via enum Screen)
Incerteza	2	Fato: documentado no APP_LOGIC_INVENTORY (Fase 6); path claro de simplificação
Justificativa: Hub de renderização. Bem mapeado mas ainda acoplado via props pesadas.

Recomendação: Tratar junto com simplificação do App.tsx (Fase 6 do roteiro existente).

Próxima ação: Seguir roteiro existente — migrar props para context hooks nas telas restantes.

PWA / Install / Offline (31) — Total: 14 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: app instalável no celular + funciona sem internet
Centralidade	3	Fato: service worker intercepta todo fetch; useAppOfflineMode inicializa game completo sem cloud
Complexidade	3	Fato: InstallPwaModal = 7.6KB; useAppOfflineMode = 72 linhas; inject-sw-version para cache bust
Risco	3	Inferência: offline bugs → partidas perdidas ao reconectar; service worker stale → UI desatualizada
Incerteza	2	Fato: padrões PWA estabelecidos; hooks já extraídos
Justificativa: Feature infraestrutural importante mas bem resolvida. Risco aparece na reconexão.

Recomendação: Garantir que sync post-offline (retorno ao online) está coberto por testes. Revisar junto com Cloud Mirror.

Próxima ação: Verificar o handshake offline→online em useHistoryCloud + useOnlineSync.

UI Context (28) — Total: 13 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: estado global de UI para toda a app
Centralidade	4	Fato: consumido por virtualmente todas as telas
Complexidade	2	Fato: UIContext.tsx = 83 linhas; container de state simples
Risco	2	Fato: sem side effects no context; apenas state + setters
Incerteza	2	Fato: bem tipado (UIContextValue = 64 linhas de types)
Justificativa: Pequeno, estável, bem definido. Centralidade alta mas complexidade baixa = risco controlado.

Recomendação: Manter. Considerar split apenas se crescer (ex.: separar queue state de navigation state).

Próxima ação: Nenhuma imediata.

Versioning / Migration (35) — Total: 12 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: garante integridade de dados ao atualizar versão
Centralidade	2	Fato: executa uma vez no startup; afeta localStorage e perfil
Complexidade	2	Fato: CURRENT_DATA_VERSION + efeito de migração (~45 linhas no App) + profileVersionUpdate
Risco	3	Inferência: migração mal escrita pode corromper dados persistidos; sem rollback automático
Incerteza	2	Fato: documentado em APP_LOGIC_INVENTORY (linhas 610–656); campo versionado
Justificativa: Crítico quando executa, mas executa raramente e é pontual.

Recomendação: Garantir que cada migração é idempotente e testada antes de release.

Próxima ação: Verificar se migração atual é idempotente (re-run seguro sem efeitos colaterais).

Email Infra (40) — Total: 11 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	2	Fato: envia emails de reset de senha e notificações
Centralidade	2	Fato: consumido por Auth (reset) e Communications (notifications)
Complexidade	2	Fato: infrastructure/email/index.ts = 9.8KB; 2 serverless functions
Risco	2	Fato: falha = email não enviado; não corrompe dados
Incerteza	3	Lacuna: provider confirmado como AWS SES (via teste-ses.js) mas config não visível; unclear se há fallback
Justificativa: Funcional e isolado. Incerteza no provider não impacta operação diária.

Recomendação: Documentar provider e credenciais necessárias. Manter isolado.

Próxima ação: Confirmar que enviar-email.js e gerar-link-reset.js usam SES diretamente vs SDK abstrato.

Sanitização / Validação (47) — Total: 10 (MAPEAR DEPOIS)
Dimensão	Score	Base
Impacto	3	Fato: guards contra dados corruptos no Firestore e deserialização
Centralidade	3	Fato: sanitizeForFirestore usado em writes; isValidGameState usado em restauração
Complexidade	1	Fato: 3 arquivos puros totalizando ~110 linhas; sem dependências externas
Risco	2	Inferência: bugs aqui = dados inválidos persistidos, mas funções são triviais e testáveis
Incerteza	1	Fato: funções puras com inputs/outputs claros
Justificativa: Importante mas trivial. Candidato ideal para testes unitários de segurança.

Recomendação: Garantir cobertura de testes para sanitizeForFirestore e isValidGameState.

Próxima ação: Verificar se existem testes; se não, criar como low-effort/high-value task.

Serverless API (Vercel) (41) — Total: 9 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: 2 endpoints (enviar email + gerar link reset)
Centralidade	2	Fato: consumidos por Auth e Email
Complexidade	1	Fato: 2 arquivos (~4KB total); lógica direta
Risco	2	Fato: funções serverless; falha = funcionalidade degradada, não crash
Incerteza	2	Fato: nomes autoexplicativos; escopo claro
Justificativa: Minimalista e funcional. Nada a mapear.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Mobile / Capacitor (32) — Total: 8 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Inferência: potencial de distribuição via app stores
Centralidade	1	Fato: apenas capacitor.config.ts (190 bytes); nenhum plugin nativo, nenhum código nativo visível
Complexidade	1	Fato: config trivial (appId + appName + webDir)
Risco	1	Fato: dormant; não afeta runtime atual
Incerteza	3	Lacuna: unclear se é placeholder futuro ou foi abandonado; sem builds nativos visíveis
Justificativa: Config sem uso ativo. Possivelmente abandonado.

Recomendação: Clarificar com stakeholder se mobile nativo é plano ativo. Se não, remover config.

Próxima ação: Perguntar: "Capacitor é roadmap ativo ou pode ser removido?"

Logger / Log de live (29) — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: debugging e auditoria de sessões live
Centralidade	2	Fato: LiveLogEntry/LiveLogType escritos por Live; LogViewer renderiza
Complexidade	1	Fato: tipos simples; viewer = componente display-only
Risco	1	Fato: read-only; não afeta operação
Incerteza	1	Fato: tipos completamente definidos em types.ts
Justificativa: Infraestrutura diagnóstica. Trivial.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Error Handling (30) — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: proteção contra crash da UI
Centralidade	2	Fato: wraps App; window.alert override
Complexidade	1	Fato: ErrorBoundary.tsx = 2.8KB; padrão React standard
Risco	1	Fato: captura erros, não os causa
Incerteza	1	Fato: padrão bem estabelecido
Justificativa: Standard, estável, autocontido.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Device (34) — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: identifica tipo de dispositivo para Live controllers
Centralidade	2	Fato: ownerDeviceId, deviceType em ControllerRecord
Complexidade	1	Fato: useAppDeviceName = 525B; device.ts = detecção simples
Risco	1	Fato: informacional; erro = label errado, não crash
Incerteza	1	Fato: escopo mínimo e claro
Justificativa: Trivial. Informação auxiliar sem impacto funcional.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Watch tokens (8) — Total: 7 (BACKLOG)
Dimensão	Score	Base
Impacto	2	Fato: habilita pareamento TV/watch-mode via QR code
Centralidade	1	Fato: fluxo isolado; watchTokens.ts = 42 linhas; collection watch_tokens
Complexidade	1	Fato: CRUD + subscribe (create pending → approve/expire → delete)
Risco	1	Fato: isolado; falha = pairing não funciona, sem data loss
Incerteza	2	Fato (atualizado): confirmado como flow de TV/watch-mode pairing; hipótese anterior resolvida
Justificativa: Feature nichos confirmada. Autocontida e trivial.

Recomendação: Ignorar.

Próxima ação: Nenhuma.

Resumo visual por faixa — Grupos C + D
┌────────────────────────────────────────────────────────┐
│  MAPEAR AGORA (21-25)                                  │
│  (nenhum)                                              │
├────────────────────────────────────────────────────────┤
│  SEGUNDA ONDA (16-20)                                  │
│  □ Firebase Infra ..................... 18             │
│  □ Cloud Mirror / Sync ................ 17             │
│  □ Supabase Infra ..................... 16             │
├────────────────────────────────────────────────────────┤
│  MAPEAR DEPOIS (10-15)                                 │
│  ○ App Routing / Telas ............... 15              │
│  ○ Admin ............................. 14              │
│  ○ PWA / Install / Offline ........... 14              │
│  ○ UI Context ........................ 13              │
│  ○ Plano / Premium ................... 12              │
│  ○ Versioning / Migration ............ 12              │
│  ○ Location / Geo .................... 11              │
│  ○ Email Infra ....................... 11              │
│  ○ Referral / Marketing .............. 10              │
│  ○ Sanitização / Validação ........... 10              │
├────────────────────────────────────────────────────────┤
│  BACKLOG (5-9)                                         │
│  · Serverless API ..................... 9              │
│  · Mobile / Capacitor ................. 8              │
│  · System Config ...................... 7              │
│  · Logger ............................. 7              │
│  · Error Handling ..................... 7              │
│  · Device ............................. 7              │
│  · Watch tokens ....................... 7              │
│  · Help / Onboarding .................. 5              │
└────────────────────────────────────────────────────────┘

Consolidação final — Todos os grupos (A + B + C + D)
Faixa "Mapear Agora" (21-25)
Rank	Domínio				Total	Grupo
1	Live / Sessão ao vivo		23	A
2	Game / Partida				22	A
3	Scoreboard / Placar (UI)	21	B

Faixa "Segunda Onda" (16-20)
Rank	Domínio				Total	Grupo
4	Auth / Identidade			19	A
5	Firebase Infra				18	D
5	Score Engines				18	B
5	Partners + Queue + Teams	18	B
8	Cloud Mirror / Sync			17	D
8	Tournaments / Events		17	B
10	User Profile				16	A
10	Voice / Anunciante			16	A
10	Supabase Infra				16	D

#Observação-chave sobre infraestrutura
Os 3 domínios de infra na segunda onda (Firebase, Cloud Mirror, Supabase) formam um cluster de migração que deve ser tratado como unidade:
# Fato: dual-write existe (Firebase + Supabase mirror)
# Lacuna: sem ADR documentando a estratégia (backup vs replacement vs coexistência)
# Risco: inconsistência de dados entre backends se estratégia não for explicitada
# Recomendação consolidada: Antes de mapear domínios de negócio da segunda onda, produzir um ADR sobre a estratégia de persistência:
"Firebase-first com mirror vs migração para Supabase-primary".

