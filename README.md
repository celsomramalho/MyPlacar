# MyPlacar

[![Vercel](https://img.shields.io/badge/deploy-vercel-blue)](https://vercel.com/) [![issues](https://img.shields.io/github/issues/celsomramalho/MyPlacar)](https://github.com/celsomramalho/MyPlacar/issues) [![license](https://img.shields.io/github/license/celsomramalho/MyPlacar)](https://github.com/celsomramalho/MyPlacar)

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

Descrição
---------
MyPlacar é um aplicativo para gerenciar placares de partidas em tempo real. Esta aplicação é uma PWA (Progressive Web App) escrita em TypeScript/React, com backend de dados no Firebase (Firestore) e possibilidade de empacotamento com Capacitor.

Principais funcionalidades
- Criar/editar partidas e placares em tempo real.
- Persistência de dados com Firestore.
- PWA com suporte offline básico (service worker).
- Estrutura para empacotamento mobile com Capacitor.

Sumário de documentação
- docs/00-overview.md — Visão geral do projeto
- docs/01-quickstart.md — Instalação e execução local
- docs/02-architecture.md — Arquitetura do projeto
- docs/architecture-phase-1-decisions.md — Decisões oficiais para encerramento da fase 1 da reforma arquitetural
- docs/03-firebase.md — Configuração e deploy do Firebase
- docs/04-deploy.md — Deploy (Vercel / Firebase / Capacitor)
- docs/05-api-and-data-models.md — Modelos de dados (Firestore & types.ts)
- docs/06-contributing.md — Guia de contribuição
- docs/07-security.md — Segurança resumida
- docs/08-faq.md — Perguntas frequentes / troubleshooting
- docs/09-roadmap.md — Roadmap do projeto
- CHANGELOG.md — Histórico de releases

Onde começar
1. Leia docs/01-quickstart.md para configurar o ambiente local.
2. Confira docs/03-firebase.md para preparar o Firebase antes de rodar a aplicação.
3. Depois de ajustes, abra um PR e solicite revisão.

Licença
-------
(Se houver licença no repositório, mantener. Caso não, adicionar informação.)

Contato
-------
Autor: celsomramalho — ver histórico de commits para contato direto.

