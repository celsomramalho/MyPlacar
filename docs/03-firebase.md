# Firebase — configuração e deploy

Arquivos importantes
- firebase.ts — inicialização do SDK (veja os nomes das variáveis VITE_ usadas)
- firebase.json — configuração local do Firebase CLI / hosting
- .firebaserc — aliases de projetos
- firestore.rules — regras de segurança (verificar antes do deploy)
- firestore.indexes.json — índices do Firestore (se aplicável)

Recomendações
1. Crie um projeto no Firebase (Console).
2. Atualize as variáveis em `.env.local` conforme docs/01-quickstart.md.
3. Teste regras localmente com o Firebase Emulator:
```bash
npm i -g firebase-tools
firebase emulators:start --only firestore,auth
```

Deploy para Hosting (se usar Firebase Hosting)
```bash
firebase deploy --only hosting
```

Deploy de database / regras
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Segurança
- Revise `firestore.rules` e limite acessos indevidos.
- Se for usar Firebase Auth, ajuste regras para validar `request.auth.uid`.

Observação
- O projeto atualmente inclui `firestore.rules` e `firestore.indexes.json`. Antes de enviar para produção, confirme que as regras refletem as políticas desejadas.