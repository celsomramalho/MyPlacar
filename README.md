# MyPlacar

[![Vercel](https://img.shields.io/badge/deploy-vercel-blue)](https://vercel.com/) [![issues](https://img.shields.io/github/issues/celsomramalho/MyPlacar)](https://github.com/celsomramalho/MyPlacar/issues) [![license](https://img.shields.io/github/license/celsomramalho/MyPlacar)](https://github.com/celsomramalho/MyPlacar)

PWA esportivo para placar eletrônico, com controle por voz, placar ao vivo para espectadores e gestão de torneios.

Versão atual do app: definida em `APP_VERSION` (`src/constants.ts`).

## Principais funcionalidades

- **Placar de partidas** com motores de pontuação próprios para **tênis**, **beach tênis** e **pickleball** (os demais esportes do catálogo ainda estão desativados).
- **Controle por voz e narração** do placar (hooks `useVoiceControl`, `useScoreAnnouncer` e `useGeminiReferee`).
- **Placar ao vivo** com sincronização em tempo real, tela para espectadores e placar público.
- **Torneios e eventos**: categorias, chaves (brackets), fila de partidas por quadra, inscrições, times formados e patrocinadores.
- **Pagamentos** de inscrições via Mercado Pago (funções em `api/`).
- **Histórico de partidas** com sincronização na nuvem e tela de localização (Leaflet).
- **Parceiros, comunicados** e **painel administrativo** (usuários, eventos, regras de voz).
- **PWA** com service worker, modo offline básico e prompt de instalação.
- **Capacitor** configurado para empacotamento mobile (veja [Mobile](#mobile-capacitor)).

## Stack

| Área | Tecnologia |
|------|-----------|
| UI | React 18, TypeScript, Tailwind CSS v4, Lucide React, Shoelace |
| Build | Vite 7 |
| Dados e autenticação | Firebase (Firestore, Auth, Storage) |
| Backend serverless | Funções em `api/` (Vercel) com `firebase-admin` |
| Pagamentos | Mercado Pago |
| E-mail | Resend (`api/enviar-email.js`) |
| IA e voz | Google Gemini (`@google/genai`) e APIs de voz do navegador |
| Mobile | Capacitor 8 |
| Testes | Vitest |
| Qualidade | `tsc`, dependency-cruiser, knip |

## Como rodar localmente

**Pré-requisitos:** Node.js 22 (versão usada no CI; o mínimo declarado é 18) e [pnpm](https://pnpm.io/) 10.

```bash
pnpm install
pnpm dev
```

O app sobe em `http://localhost:3000`. Em desenvolvimento, as chamadas a `/api` são encaminhadas pelo proxy do Vite para `https://myplacar.app.br`, então você não precisa rodar as funções serverless localmente para usar o app.

> O repositório também tem um `package-lock.json`, e o workflow `build-check.yml` usa npm. O fluxo principal (`ci.yml` e o campo `packageManager`) é pnpm.

### Scripts

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento (porta 3000) |
| `pnpm build` | Build de produção em `dist/` |
| `pnpm preview` | Serve o build localmente |
| `pnpm lint` | Checagem de tipos (`tsc --noEmit`) |
| `pnpm test` | Roda os testes (Vitest) |
| `pnpm test:watch` / `pnpm test:ui` | Testes em modo watch / com interface |
| `pnpm depcruise` | Valida as regras de dependência entre camadas |
| `pnpm depcruise:report` | Gera o relatório de dependências em `docs/report.html` |
| `pnpm knip` | Procura arquivos, exports e dependências sem uso |

O CI (`.github/workflows/ci.yml`) executa `lint`, `test` e `depcruise` em cada push na `main` e em pull requests.

## Variáveis de ambiente

As funções em `api/` leem estas variáveis no servidor (configure no painel da Vercel):

| Variável | Uso |
|----------|-----|
| `FIREBASE_SERVICE_ACCOUNT` | JSON da conta de serviço do Firebase Admin |
| `RESEND_API_KEY` | Envio de e-mails |
| `MERCADO_PAGO_ACCESS_TOKEN` | Cobranças no Mercado Pago |
| `MERCADO_PAGO_CLIENT_ID` / `MERCADO_PAGO_CLIENT_SECRET` | OAuth do organizador |
| `MERCADO_PAGO_APP_CLIENT_ID` / `MERCADO_PAGO_APP_CLIENT_SECRET` | Credenciais da aplicação Mercado Pago |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Validação do webhook |
| `APP_BASE_URL` / `VITE_APP_BASE_URL` | URL pública do app (callbacks e links) |

No cliente (opcionais, com valores padrão): `VITE_RESEND_FROM` e `VITE_AWS_SES_REPLY_TO`.

Nunca versione chaves ou segredos.

## Estrutura do projeto

```text
src/
  app/             Rotas, shell, providers e hooks de orquestração
  modules/         Domínios do app
    admin/ auth/ communications/ events/ game/
    history/ home/ live/ partners/ settings/ ui/
  infrastructure/  I/O externo (Firebase, e-mail)
  pwa/             Service worker e prompt de instalação
  shared/          Componentes, hooks e utils transversais
api/               Funções serverless (Mercado Pago, e-mail, admin)
tests/             Testes de regressão dos motores e regras de domínio
public/            Manifest, service worker e fontes
docs/              Documentação técnica e planos de refatoração
```

Cada módulo segue o padrão `components/`, `hooks/`, `screens/`, `services/` e `types.ts`, e os módulos de regra de negócio (`game`, `events`, `live`) têm uma pasta `domain/` com motores puros e testados. As dependências entre camadas são validadas pelo dependency-cruiser (`.dependency-cruiser.cjs`).

Aliases de importação: `@app`, `@core`, `@modules`, `@infra`, `@shared`, `@pwa` e `@routes`.

## Firebase

- Banco: Firestore na região `southamerica-east1` (`firebase.json`).
- Regras: `firestore.rules`. Índices: `firestore.indexes.json`.
- Publicar regras e índices: `firebase deploy --only firestore`.

## Deploy

- **Web:** Vercel, usando `vercel.json` (cabeçalhos de cache do service worker, rewrites do webhook do Mercado Pago e fallback de SPA). Saída de build em `dist/`.
- **Service worker:** `public/sw.template.js` é a fonte; o Vite gera `sw.js` com o nome de cache baseado em `APP_VERSION`. Ao publicar uma versão nova, atualize `APP_VERSION` em `src/constants.ts`.

### Mobile (Capacitor)

`capacitor.config.ts` aponta para `dist/`. O repositório ainda não inclui a pasta `android/` e o `appId` é um valor provisório (`com.example.myplacar`); ajuste-o e rode `npx cap add android` antes de gerar o app.

## Documentação

Documentação atual em `docs/`:

- [architecture-restructure-roadmap.md](docs/architecture-restructure-roadmap.md): roadmap da reestruturação arquitetural.
- [PLANO_REFATORACAO_CHAVES_PARTIDAS_EVENTO.md](docs/PLANO_REFATORACAO_CHAVES_PARTIDAS_EVENTO.md), [PLANO_REFATORACAO_FILA_QUADRAS.md](docs/PLANO_REFATORACAO_FILA_QUADRAS.md) e [PLANO_REFATORACAO_INSCRICOES_TORNEIO.md](docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md): planos por domínio de eventos.
- [plano-refatoracao-live-sync.md](docs/plano-refatoracao-live-sync.md): sincronização do placar ao vivo.
- [checklist-integracao-mercado-pago.md](docs/checklist-integracao-mercado-pago.md): checklist da integração de pagamentos.
- [plano-remocao-supabase.md](docs/plano-remocao-supabase.md): remoção do Supabase.
- [relacao_todos_arquivos de src.md](docs/relacao_todos_arquivos%20de%20src.md): relação dos arquivos de `src/`.

Documentos de referência e histórico em [`docs/historico/`](docs/historico/):

- [ARCHITECTURE.md](docs/historico/ARCHITECTURE.md): guia de imports e camadas.
- [00-overview.md](docs/historico/00-overview.md), [01-quickstart.md](docs/historico/01-quickstart.md), [02-architecture.md](docs/historico/02-architecture.md), [03-firebase.md](docs/historico/03-firebase.md), [04-deploy.md](docs/historico/04-deploy.md), [05-api-and-data-models.md](docs/historico/05-api-and-data-models.md), [06-contributing.md](docs/historico/06-contributing.md), [07-security.md](docs/historico/07-security.md), [08-faq.md](docs/historico/08-faq.md) e [09-roadmap.md](docs/historico/09-roadmap.md): primeira série de documentos do projeto, que podem estar desatualizados.
- `architecture-phase-1-decisions.md` e `architecture-phase-2-*.md`: decisões das fases da reforma arquitetural.

Outros arquivos na raiz: [AI_RULES.md](AI_RULES.md) (regras para desenvolvimento assistido por IA), [CHANGELOG.md](CHANGELOG.md) e [SECURITY.md](SECURITY.md).

## Contribuindo

1. Crie uma branch a partir da `main`.
2. Antes de abrir o PR, rode `pnpm lint`, `pnpm test` e `pnpm depcruise`.
3. Siga as regras de [AI_RULES.md](AI_RULES.md): ajustes pontuais, sem duplicar lógica existente, textos de interface em sentence case.
4. Abra o PR e solicite revisão.

## Licença

O `package.json` declara a licença ISC, mas o repositório não tem um arquivo `LICENSE`. Adicione um antes de distribuir o código.

## Contato

Autor: [celsomramalho](https://github.com/celsomramalho). Para dúvidas ou problemas, abra uma [issue](https://github.com/celsomramalho/MyPlacar/issues).
