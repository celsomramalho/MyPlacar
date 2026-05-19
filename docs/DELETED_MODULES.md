# Módulos removidos (Passo 9 — dependency-cruiser)

**Data:** 2026-05-18 · branch `refactor/dependency-cruiser`

Arquivos placeholder (`export {}`) reservados para “fase 2” da arquitetura, nunca importados. A funcionalidade real já vive em `src/screens/` e outros módulos ativos.

| Removido | Motivo | Onde está a funcionalidade hoje |
|----------|--------|----------------------------------|
| `src/routes/index.ts` | Entrypoint vazio | Navegação via `Screen` em `App.tsx` |
| `src/modules/teams/index.ts` | Placeholder | `TeamSection`, partners, settings |
| `src/modules/spectator/index.ts` | Placeholder | `src/screens/SpectatorScreen.tsx` |
| `src/modules/scoreBoard/index.ts` | Placeholder | `src/screens/ScoreboardScreen.tsx` |
| `src/modules/communications/index.ts` | Placeholder | `src/screens/CommunicationsScreen.tsx` |
| `src/modules/admin/index.ts` | Placeholder | `src/screens/AdminScreen.tsx` |

Pastas vazias (`teams/`, `spectator/`, etc.) podem ser recriadas quando houver migração DDD real (Passo 15 do roteiro).
