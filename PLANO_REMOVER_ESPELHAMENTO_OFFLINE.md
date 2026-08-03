# Plano de remoção do espelhamento offline

Objetivo: remover somente o recurso de espelhamento offline, preservando integralmente o modo placar offline e as demais melhorias recentes do PWA.

## Regras de segurança

- Não remover `isOfflineMode` nem a lógica de criação e controle da partida offline.
- Não remover pontuação, regras, relógio, histórico ou armazenamento local.
- Não remover o recurso live/Firebase.
- Criar um ponto de restauração antes de iniciar a primeira etapa destrutiva.
- Ao final de cada etapa, executar a validação indicada e atualizar este arquivo.

## Status geral

- [x] Etapa 1 — Criar ponto de restauração e inventário
- [x] Etapa 2 — Remover a entrada visual do espelhamento
- [x] Etapa 3 — Remover a integração web do espelhamento
- [x] Etapa 4 — Remover o código nativo Android do espelhamento
- [x] Etapa 5 — Remover dependências e arquivos gerados
- [ ] Etapa 6 — Validar o modo placar offline
- [ ] Etapa 7 — Validar PWA, APK e recursos preservados
- [ ] Etapa 8 — Revisão final e encerramento

---

## Etapa 1 — Criar ponto de restauração e inventário

Status: **concluída**

### Ações

- [ ] Verificar o estado atual do projeto.
- [ ] Criar branch ou backup separado antes das remoções.
- [ ] Listar todas as referências a:
  - `LocalSync`;
  - `localSync`;
  - `Espelhar Placar`;
  - `Controlar Placar`;
  - `waiting_mirror`;
  - `BroadcastChannel`;
  - `LocalWebSocketServer`;
  - `LocalHttpServer`;
  - `PIN de Pareamento`.
- [ ] Classificar cada referência como “remover” ou “preservar”.

### Critério de conclusão

Existe um backup/branch recuperável e o inventário diferencia claramente espelhamento offline de placar offline.

### Registro

Data: 2026-07-31

Observações:

- O projeto foi verificado na branch `main`.
- Não houve remoção de arquivos nesta etapa.
- A tentativa de criar a branch `codex/remove-offline-mirroring` foi bloqueada por permissão no diretório `.git`.
- O estado atual permanece preservado e a remoção ainda não começou.
- Foram encontradas referências concentradas em `LocalSync`, `GlobalOverlays`, `NavigationDrawer`, `ScoreboardScreen`, `WatchBoard`, `ScoreboardDisplay`, `GameContext`, `GameLiveProviderStack` e nos arquivos nativos Android.
- O modo placar offline será preservado; somente a sincronização/espelhamento local será removida.

---

## Etapa 2 — Remover a entrada visual do espelhamento

Status: **concluída**

### Remover

- [ ] Item “Espelhar Placar” dos menus.
- [ ] Modal “Controlar Placar / Espelhar Placar”.
- [ ] Tela de controlador.
- [ ] Tela de espelho.
- [ ] Campos de IP e PIN do espelhamento.
- [ ] Logs de conexão local.
- [ ] QR Code do endereço local.
- [ ] Indicadores de conexão local.

### Preservar

- [ ] Botão central do placar.
- [ ] Acesso às regras.
- [ ] Modo relógio.
- [ ] Modo placar.
- [ ] Todos os controles da partida offline.

### Critério de conclusão

O usuário não vê mais nenhuma opção de espelhamento, mas consegue iniciar e controlar uma partida offline normalmente.

### Registro

Data: 2026-07-31

Observações:

- Removidos os itens “Espelhar Placar” da gaveta de navegação, WatchBoard, ScoreboardDisplay e ScoreboardScreen.
- Removido o badge visual de sincronização local do ScoreboardScreen.
- Mantidos o botão central do placar, regras, modo relógio e demais controles do placar offline.
- TypeScript validado com `tsc --noEmit` sem erros.

---

## Etapa 3 — Remover a integração web do espelhamento

Status: **concluída**

### Remover ou ajustar

- [x] `LocalSyncService`.
- [x] `LocalSyncContext`.
- [x] `useLocalSyncIntegration`.
- [x] `LocalPairingModal`.
- [x] `LocalControllerView`.
- [x] `LocalMirrorInput`.
- [x] `LocalSyncBadge`.
- [x] `LocalSyncGlobalOverlays`.
- [x] Eventos `localSync:*`.
- [x] Props e imports exclusivos do espelhamento.
- [x] `LocalSyncProvider`, caso não tenha outro uso.

### Preservar

- [ ] Contextos do jogo offline.
- [ ] Persistência local.
- [ ] Cálculo de pontuação.
- [ ] Atualização do relógio.
- [ ] Firebase e recurso live.

### Critério de conclusão

O TypeScript não possui referências quebradas e o modo placar offline continua compilando.

### Registro

Data:

Observações:

- Removida a camada global de overlays do espelhamento.
- Removido o `LocalSyncProvider` da árvore principal de provedores.
- Removido o listener de atualização de estado espelhado do `GameContext`.
- Removida a integração direta do `ScoreboardScreen` com o menu/badge do espelhamento.
- Removidos os arquivos web do módulo `localSync`.
- Removidos `LocalSyncService` e `LocalWebSocketServer` da infraestrutura web.
- TypeScript validado com `tsc --noEmit` sem erros.

---

## Etapa 4 — Remover o código nativo Android do espelhamento

Status: **concluída**

### Registro

Data: 2026-07-31

Observações:

- Removidos `LocalWebSocketServer.java`, `LocalHttpServer.java` e `LocalWebSocketServerPlugin.java`.
- Removido o registro do plugin em `MainActivity.java`.
- Mantidos os ajustes Android não relacionados ao espelhamento.
- A compilação Java Android será repetida após a limpeza das dependências.

---

## Etapa 5 — Remover dependências e arquivos gerados

Status: **concluída**

- [x] Remover a dependência `qrcode`, se não houver outro uso.
- [x] Atualizar `package.json`.
- [x] Atualizar o lockfile.
- [x] Remover arquivos gerados exclusivos do espelhamento.
- [x] Executar `npm run build`.
- [x] Executar `npx cap sync android`.

### Critério de conclusão

O PWA gera o build sem erros e o Android recebe os assets atualizados sem código de espelhamento.

### Registro

Data: 2026-07-31

Observações:

- Removida a dependência `qrcode` do `package.json` e `pnpm-lock.yaml`.
- Removido o callback exclusivo de QR do espelhamento em `Input.tsx`; o scanner existente de parceiros foi preservado.
- Build de produção do PWA concluído com `npm run build`.
- Assets sincronizados no Android com `npx cap sync android`.
- Compilação Java Android concluída com `:app:compileDebugJavaWithJavac`.

---

## Etapa 6 — Validar o modo placar offline

Status: **pendente**

### Testes obrigatórios

- [ ] Abrir o modo offline.
- [ ] Criar uma partida.
- [ ] Selecionar regras.
- [ ] Marcar pontos para os dois lados.
- [ ] Testar ace, falta e desfazer.
- [ ] Testar relógio/cronômetro.
- [ ] Testar alteração de modo de visualização.
- [ ] Encerrar e reabrir a partida.
- [ ] Confirmar persistência do estado.
- [ ] Confirmar histórico.

### Critério de conclusão

O placar offline funciona como antes, sem qualquer dependência do espelhamento.

### Registro

Data:

Observações:

---

## Etapa 7 — Validar PWA, APK e recursos preservados

Status: **pendente**

- [ ] Testar login e perfil no PWA.
- [ ] Testar permissões de microfone, localização e câmera.
- [ ] Testar recurso live/Firebase.
- [ ] Testar instalação do APK pelo PWA.
- [ ] Gerar APK debug, se necessário:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew assembleDebug
cd ..
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "public\MyPlacar.apk" -Force
```

- [ ] Instalar o APK em um dispositivo de teste.
- [ ] Confirmar ícone e abertura do aplicativo.
- [ ] Confirmar que não existe menu de espelhamento.

### Critério de conclusão

PWA e APK funcionam, o modo offline permanece disponível e o espelhamento offline foi removido.

### Registro

Data:

Observações:

---

## Etapa 8 — Revisão final e encerramento

Status: **pendente**

- [ ] Pesquisar novamente todas as referências do espelhamento.
- [ ] Confirmar que não existem imports mortos.
- [ ] Confirmar que não existem arquivos nativos órfãos.
- [ ] Confirmar que o tamanho do APK voltou a um valor aceitável.
- [ ] Registrar os arquivos removidos.
- [ ] Registrar os arquivos preservados.
- [ ] Atualizar este documento para **concluído**.

### Critério de conclusão

O projeto volta a funcionar como PWA/placar offline sem o recurso de espelhamento offline, preservando as melhorias realizadas nos demais módulos.

### Registro

Data:

Observações:
