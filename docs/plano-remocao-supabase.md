# Plano de inventário e remoção do Supabase

## Objetivo

Remover a integração Supabase do MyPlacar e manter Firebase/Firestore como backend utilizado pelo aplicativo. Este documento registra o inventário estático do repositório e um roteiro verificável para uma etapa futura. Nenhum código ou dado remoto foi alterado durante este inventário.

## Inventário do repositório antes da remoção

### Papel identificado antes da Fase 2

- O fluxo de autenticação conectado à aplicação está em `src/modules/auth/screens/AuthScreen.tsx` e usa Firebase Authentication. Esse fluxo também chama `mirrorUser` para copiar o perfil ao Supabase.
- Firestore é usado para o histórico, perfis, parceiros e ícones. As chamadas Supabase encontradas são escritas ou exclusões de espelhos; não foram encontradas leituras Supabase nos fluxos ativos.
- O cliente Supabase está configurado estaticamente em `src/infrastructure/supabase/client.ts`.
- O componente `src/modules/auth/screens/Login.tsx` implementa login/cadastro via Supabase, mas a busca de referências encontrou apenas sua exportação no barrel de auth; não foi encontrada montagem desse componente na aplicação. Confirmar novamente antes de removê-lo.

### Tabelas Supabase inferidas a partir do código

| Tabela | Operações encontradas | Dados/campos indicativos | Origem funcional no app |
| --- | --- | --- | --- |
| `users` | upsert | email, nome, telefone, PIN, método de autenticação, plano, dados de passkey e outros campos de perfil | Perfil Firebase |
| `user_partners` | upsert e delete | email do titular, PIN/nome/apelido do parceiro, origem, data, gênero | `user_partners_metadata` no Firestore |
| `matches` | upsert e delete por ID/titular | email/PIN do titular, participantes, datas, placares e resumo | histórico local sincronizado ao Firestore |
| `sport_icons` | upsert e delete | ID, nome, URL, categoria, mecanismo, estado ativo | coleção Firestore `sport_icons` |
| `category_icons` | upsert e delete | ID, nome, URL, estado ativo | coleção Firestore `category_icons` |

Essa lista é inferida do código, não uma confirmação do schema remoto. As tabelas podem ter colunas, índices, triggers ou políticas adicionais.

### Pontos de código envolvidos

- Cliente e barrel: `src/infrastructure/supabase/client.ts`, `src/infrastructure/supabase/index.ts`.
- Espelhamento de perfil, parceiros e ícones: `src/infrastructure/supabase/mirror.ts`.
- Espelhamento/exclusão de partidas: `src/infrastructure/supabase/matches.ts`.
- Chamadas de espelhamento: `src/modules/auth/screens/AuthScreen.tsx`, `src/modules/game/GameContext.tsx`, `src/modules/partners/screens/PartnersScreen.tsx` e `src/modules/admin/services/adminPersistence.ts`.
- Exclusões de partidas: `src/modules/history/services/historySync.ts` e `src/modules/history/hooks/useMatchDeletion.ts`.
- Migração administrativa Firebase → Supabase: `src/infrastructure/supabase/adminMigration.ts`, `src/modules/admin/screens/AdminScreen.tsx` e `src/modules/admin/components/AdminSupabaseMigrationCard.tsx`.
- Login Supabase aparentemente sem uso: `src/modules/auth/screens/Login.tsx`.
- Dependências diretas em `package.json`: `@supabase/supabase-js`, `@supabase/auth-ui-react`, `@supabase/auth-ui-shared`.
- Documentação/configuração também cita Supabase, incluindo `AI_RULES.md` e `docs/architecture-restructure-roadmap.md`; documentação histórica inclui referências adicionais.

### Itens parecidos que pertencem ao Firebase e devem permanecer

- Firestore `sport_icons` e `category_icons`, lidas pelo app para exibir/selecionar ícones.
- Firestore `user_partners_metadata`, usado para persistir parceiros.
- Firestore `users` e `matches`, usados pelos fluxos de perfil e histórico.
- Arquivos em `src/infrastructure/firebase/`, regras e índices Firebase relacionados.

Remover por nome de tabela sem distinguir o provedor pode quebrar recursos ativos.

### Resultado da Fase 1

- [x] Confirmado por inspeção estática: o Firebase/Firestore é a origem usada pelos fluxos ativos; as chamadas Supabase identificadas são espelhamentos/exclusões e uma ferramenta administrativa.
- [x] Registrado que, conforme informado pelo usuário, os dados atuais do Supabase são dados de teste sem necessidade de retenção.
- [ ] Inventário do dashboard Supabase: não concluído. O painel não estava acessível nesta sessão; tabelas e recursos remotos não foram inspecionados.
- [ ] Ponto de restauração Git: não criado. `git status --short` não retornou e precisou ser interrompido; não criei commit/tag sem conseguir confirmar quais alterações preexistentes seriam incluídas.

### Limites deste inventário

O repositório não confirma quais recursos existem atualmente no painel Supabase. Antes de encerrar o projeto remoto, verificar no dashboard:

- [ ] Projeto e organização/conta proprietária, plano atual e data de renovação/cobrança.
- [ ] Tabelas, linhas, tamanhos, views, funções SQL, triggers, índices e políticas RLS.
- [ ] Usuários e provedores em Supabase Auth; confirmar se o componente legado chegou a ser utilizado.
- [ ] Edge Functions, Storage buckets, Realtime, webhooks e extensões habilitadas.
- [ ] Domínios autorizados, chaves, secrets, URLs de callback e integrações externas.
- [ ] Backups, retenção/exportação necessária e dependências operacionais fora deste repositório.

Não foram encontradas chamadas no código consultado para Supabase Storage, Realtime ou Edge Functions. Isso não prova que esses recursos estejam ausentes do projeto remoto ou de integrações externas.

## Plano de execução futuro

### Fase 1 — Preparação

- [x] Confirmar que o Firebase é a fonte de verdade para contas, perfis, parceiros, partidas e ícones, com base no código ativo.
- [ ] Fazer o inventário do dashboard listado acima e registrar a confirmação real das tabelas/recursos.
- [x] Confirmar necessidade de retenção: o usuário informou que os dados de teste do Supabase não são relevantes; não será planejada migração desses dados para o Firebase.
- [ ] Exportar os dados Supabase somente se surgir requisito de retenção/auditoria; não importar a réplica de volta no Firebase sem comparar, pois o Firestore já é a origem identificada no código.
- [ ] Registrar credenciais/integrações externas que precisem ser rotacionadas ou removidas ao desligar o projeto.
- [ ] Criar um ponto de restauração/commit antes das alterações de código (adiado até ser possível verificar o estado Git e evitar incluir trabalho preexistente).

### Fase 2 — Remoção do código

- [x] Retirar chamadas `mirrorUser` dos fluxos de autenticação e perfil; preservar integralmente as gravações Firebase.
- [x] Retirar chamadas `mirrorPartners` e espelhamento de parceiros; preservar leitura/gravação em `user_partners_metadata` do Firestore.
- [x] Retirar `mirrorMatches` e deletes Supabase do histórico; manter sync/download/delete no Firestore.
- [x] Retirar `mirrorIcon`/`deleteIcon` do serviço administrativo; manter gravação e remoção de ícones no Firestore.
- [x] Remover migração Firebase → Supabase e seu card/ação administrativa.
- [x] Confirmar que `Login.tsx` não é usado e removê-lo junto com exports/imports Supabase.
- [x] Excluir a infraestrutura Supabase (`client.ts`, `mirror.ts`, `matches.ts`, `adminMigration.ts`, `index.ts`) após eliminar todos os imports.
- [x] Remover dependências Supabase do `package.json` e atualizar `pnpm-lock.yaml` e `package-lock.json`.
- [x] Remover regra de chunk `vendor-supabase` obsoleta do `vite.config.ts`.
- [x] Atualizar documentação ativa; preservar referências históricas fora do código ativo e identificar o roadmap atualizado.

### Fase 3 — Verificação funcional

- [x] Busca em `src`, `package.json` e lockfiles confirma zero imports, chamadas, configuração e dependências Supabase em código ativo.
- [x] Varredura final em `src`, `api`, `public`, manifests, regras Firebase, `vercel.json` e `vite.config.ts`: nenhum cliente, URL, chave, import, SDK ou destino de chunk Supabase restante.
- [x] `npm run lint` passa (`tsc --noEmit`).
- [x] `npm test` passa: 10 arquivos e 128 testes.
- [x] `npm run depcruise` passa: 248 módulos, 859 dependências, sem violações.
- [x] `npm run build` passa.
- [x] Usuário confirmou testes básicos com vários métodos de autenticação Firebase.
- [ ] Testar criação/edição de perfil e plano no Firestore.
- [ ] Testar adicionar/remover parceiro e confirmar persistência em `user_partners_metadata` no Firestore.
- [x] Usuário confirmou gravação do histórico no Firebase.
- [ ] Testar sincronização, download, exclusão de partidas e limpeza completa do histórico no Firestore.
- [x] Usuário confirmou abertura de lives e finalização de partidas em eventos.
- [ ] Testar criar/editar/excluir ícones administrativos e carregar os ícones nas telas consumidoras.
- [x] Busca estática confirma ausência de cliente e chamadas Supabase no código/configuração executável.
- [ ] Capturar tráfego de rede no navegador durante smoke test e confirmar ausência de requests Supabase.

**Registro de execução em 2026-10-06:** `npm run build` passou novamente após as últimas alterações. O usuário confirmou testes básicos de vários métodos de autenticação Firebase, gravação do histórico, abertura de lives e finalização de partidas em eventos; esses fluxos foram exercitados sem regressões aparentes. Restam testes de edição do perfil/plano, parceiros, exclusão/download do histórico e gestão de ícones. Eles não são necessários para confirmar ausência de tráfego Supabase, pois a varredura do código executável, dependências e configuração não encontrou integração Supabase. Não executei ações que criem/alterem dados do Firebase compartilhado.

**Conclusão da Fase 3:** concluída no escopo de eliminar gravações Supabase pelo aplicativo. A busca final não encontrou código, dependência ou configuração que inicialize o Supabase ou envie requisições para ele; o usuário também validou os principais fluxos Firebase. Os testes adicionais listados acima são verificações gerais de regressão Firebase, não bloqueiam essa conclusão. A Fase 4 é separada e trata do encerramento do projeto/recursos remotos.

### Fase 4 — Encerramento remoto

- [ ] Confirmar que a versão sem Supabase foi publicada e validada em produção.
- [x] Confirmar no código que a aplicação atual não tem cliente/chamadas Supabase; o usuário também relatou que o projeto foi originalmente apenas um espelho do Firebase.
- [ ] Confirmar no painel/logs que não há consumidores externos ou tráfego legítimo fora do app.
- [ ] Revogar/remover secrets, chaves, callbacks e integrações associados, conforme inventário.
- [x] Usuário informou que os dados de teste do Supabase não são relevantes para retenção.
- [ ] Exportar/guardar dados se surgir necessidade posterior de retenção/auditoria.
- [ ] Excluir recursos e projeto Supabase no dashboard apenas após validação, inspeção dos recursos e confirmação explícita imediatamente antes da exclusão irreversível.
- [ ] Verificar faturamento/assinatura após o encerramento e guardar evidência de conclusão.

**Estado observado em 2026-10-06:** a captura fornecida pelo usuário mostra o projeto `MyPlacar` no plano Free e pausado. A tela informa que os dados/backups/storage permanecem seguros, que o projeto pode ser retomado até 2027-10-13 e que depois disso não será retomável, embora os dados ainda possam ser baixados. O link aberto nesta sessão redirecionou para login, então não foi possível inspecionar recursos, integrações, logs ou faturamento no dashboard. Nenhuma ação remota foi executada; o projeto está pausado, não excluído. Como a integração foi removida do código, o app atual não grava mais nesse projeto. A exclusão permanente não foi realizada.

## Critério de conclusão

Considerar a remoção da integração no aplicativo concluída após as Fases 2 e 3, com ausência de clientes, dependências e chamadas Supabase. O encerramento total da conta/projeto remoto é uma ação separada da Fase 4 e ainda não foi executado.
