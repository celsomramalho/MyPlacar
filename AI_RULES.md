# MyPlacar Pro - AI Development Rules

## 🧠 Filosofia de Desenvolvimento (CRÍTICO)
1. **Respeito ao Legado**: O app já veio funcional. Nunca reescreva uma lógica existente sem antes entendê-la completamente.
2. **Análise Cirúrgica**: Antes de qualquer alteração, localize as variáveis e funções existentes nos arquivos `types.ts`, `constants.ts` e nos hooks.
3. **Não Duplicação**: Só crie novas variáveis, estados ou lógicas se for comprovado que não existe nada similar no código.
4. **Ajustes Pontuais**: Para correções e melhorias, foque apenas no trecho necessário. Não altere o que não foi solicitado.
5. **Recursos Novos**: Para funcionalidades inéditas, siga o padrão de arquitetura do projeto (Interface -> Componente -> Tela).
6. **Memória Permanente**: Este arquivo é a memória do AI. Regras combinadas em chat devem ser registradas aqui para persistirem entre sessões.

## 🛠 Tech Stack
- **Framework**: React 18.x com TypeScript.
- **Styling**: Tailwind CSS v4 (Utility-first).
- **Build Tool**: Vite.
- **Backend/Database**: Firebase (Firestore) + Supabase (Auth/Edge Functions).
- **Icons**: Lucide React (Exclusivo).
- **AI Integration**: Google Gemini AI (@google/genai).

## 📐 Diretrizes de Código
- **Types First**: Sempre verifique `src/types.ts` antes de manipular estados.
- **Motor de Jogo**: A lógica de pontuação reside em `src/utils/tennisEngine.ts`. Não a duplique em componentes.
- **Mobile-First**: O design deve ser responsivo e focado em dispositivos móveis/relógios.
- **Voz**: Use `useGeminiReferee` e `useScoreAnnouncer` para toda interação sonora.

## 🗣 Como solicitar alterações
- **Para Corrigir/Melhorar**: "No arquivo [X], ajuste a função [Y] para que [Z]. Use a variável [W] que já existe."
- **Para Novo Recurso**: "Crie o recurso [A]. Pode criar novos tipos e componentes seguindo o padrão do app."

## 🎨 UI/UX Guidelines
- **Escrita (Sentence Case)**: Todo novo texto, label ou mensagem deve usar obrigatoriamente "Sentence case" (ex: "Configurações do sistema", "Novo jogador").
- **Exceção de Marca**: O nome do app **MyPlacar** é a única exceção e deve manter sempre essa grafia exata.
- **Golden Rule**: Aplicar a lógica de Sentence Case programaticamente via `applyGoldenRule` sempre que possível.
- **Feedback**: Usar modais e toasts para estados de sucesso/erro.
- **Performance**: Usar `LazySportIcon` para ícones de esportes.