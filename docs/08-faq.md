# FAQ e troubleshooting rápido

Q: A aplicação não conecta ao Firebase em desenvolvimento.
A: Verifique `.env.local`, os nomes das variáveis (prefixo VITE_) e se o projeto Firebase está ativo. Teste com o emulator.

Q: Os dados não aparecem em tempo real.
A: Confirme regras do Firestore (leitura permitida) e checar logs do console para erros de permissão.

Q: Como testar o service worker localmente?
A: Use um servidor HTTPS ou as ferramentas de preview do Vite / build + servidor estático com https.

Q: Build falha por falta de módulo/typings.
A: Rode `npm install` e cheque `tsconfig.json` para paths e opções.