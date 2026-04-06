```markdown
---
type: troubleshooting
severity: high | medium | low
lastUpdated: [[YYYY-MM-DD]]
tags: [troubleshooting, bug, [area-afetada]]
---

# 🚨 Troubleshooting: [Título do Problema]

## 📌 Sintoma
[Descreva o comportamento inesperado ou o erro que o usuário/desenvolvedor está enfrentando. Inclua mensagens de erro exatas, se houver.]

**Exemplo:** "O aplicativo falha ao iniciar no ambiente de desenvolvimento com a mensagem 'Firebase: Error: Missing or insufficient permissions (auth/permission-denied)'."

## 💥 Causa Raiz
[Explique a causa fundamental do problema. Por que ele acontece?]

**Exemplo:** "As regras de segurança do Firestore não permitem acesso de leitura/escrita para usuários não autenticados ou para a conta de serviço usada no ambiente de desenvolvimento."

## 🛠️ Solução Passo-a-Passo
[Forneça instruções claras e numeradas para resolver o problema.]

### Passo 1: Verificar Regras de Segurança do Firebase
1. Acesse o [Console do Firebase](https://console.firebase.google.com).
2. Navegue até **Firestore Database** > **Regras**.
3. Verifique se as regras permitem acesso para o ambiente de desenvolvimento.
   ```
   // Exemplo de regra que permite acesso para testes (NÃO USAR EM PRODUÇÃO)
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true; // Apenas para desenvolvimento!
       }
     }
   }
   ```

### Passo 2: Verificar Credenciais de Autenticação
1. Certifique-se de que o usuário está logado ou que as credenciais da conta de serviço estão configuradas corretamente.
2. No ambiente local, verifique se as variáveis de ambiente para as chaves da API Firebase estão corretas.

### Passo 3: Limpar Cache e Recompilar
1. Limpe o cache do projeto:
   ```bash
   npm cache clean --force
   rm -rf node_modules
   npm install
   ```
2. Recompile o aplicativo:
   ```bash
   npm run dev
   ```

## 🛡️ Prevenção
[Como evitar que este problema ocorra novamente no futuro?]
- [ ] Implementar testes automatizados para regras de segurança.
- [ ] Criar um ambiente de desenvolvimento com regras de segurança mais permissivas, mas isolado da produção.
- [ ] Documentar claramente as permissões necessárias para cada ambiente.

## 🔗 Links Relacionados
- [[How-To: Configurar Regras de Segurança do Firestore]]
- [Documentação oficial do Firebase sobre regras de segurança](https://firebase.google.com/docs/firestore/security/get-started)
- [Issue no GitHub sobre problema similar](https://github.com/myuser/myplacar/issues/XXX)

#troubleshooting #[area-afetada] #[severidade]
```
