# Arquitetura do projeto

Atualizacao importante:
- As decisoes arquiteturais da reforma estrutural em andamento estao registradas em [`architecture-phase-1-decisions.md`](./architecture-phase-1-decisions.md).
- Esse documento e a referencia oficial para encerrar a fase 1 e preparar a migracao incremental por dominio da fase 2.

Visão geral das pastas e arquivos principais
- App.tsx — ponto de entrada principal da aplicação React
- src/ — código-fonte da aplicação (componentes, páginas, utilitários)
- types.ts — tipos e interfaces TypeScript compartilhadas (modelos de domínio)
- firebase.ts — inicialização e helpers do Firebase
- public/ / index.html — PWA e HTML base
- sw.js — service worker (offline / caching)
- manifest.json — manifesto PWA
- vite.config.ts — configuração do Vite
- tailwind.config.js / postcss.config.js — configuração de estilo

Fluxo de dados
- Estado local e componentes React para UI.
- Persistência e sincronização via Firestore (coleções descritas em docs/05-api-and-data-models.md).
- Autenticação (se adicionada) via Firebase Auth (planejado no roadmap).

Observações sobre App.tsx
- App.tsx contém a composição das rotas e componentes principais; é o melhor ponto para entender os fluxos de inicialização (carregamento de config, inicialização do Firebase, providers).
- Types e modelos centrais ficam em types.ts — consulte para entender os shape dos documentos Firestore.

(Atualização: mapeamento de tipos)

Fonte de verdade dos tipos
- O arquivo `src/types.ts` contém todas as interfaces e tipos usados para modelar partidas, usuários, torneios e comunicações.
- Consulte `src/types.ts` para:
  - GameState, MatchSettings, MatchHistoryItem
  - UserProfile
  - TournamentEvent / TournamentMatch / TournamentPair / TournamentEntry
  - Communication, PollOption, Reply
- docs/05-api-and-data-models.md descreve como esses tipos mapeiam para coleções Firestore.

Pontos importantes
- Ao alterar a shape de dados em `src/types.ts`, atualize também `docs/05-api-and-data-models.md` e as regras do Firestore (`firestore.rules`).
- Para auditoria rápida: pesquise leituras/escritas no repo (ex.: queries de `collection('matches')`) para validar nomes de coleção usados em produção.
