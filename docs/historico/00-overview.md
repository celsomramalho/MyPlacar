# Visão Geral

MyPlacar é uma aplicação para gerenciar placares de partidas em tempo real, voltada para partidas esportivas ou jogos informais. A aplicação é pensada como uma PWA, permitindo instalação em dispositivos móveis e atuação offline parcial.

Objetivos
- Fornecer uma interface simples para iniciar partidas, marcar pontos e finalizar.
- Persistência em Firestore para histórico e múltiplos dispositivos.
- Suporte a build mobile via Capacitor.

Tecnologias principais
- Frontend: React + TypeScript (App.tsx é o entry)
- Build/Dev: Vite
- Estilo: Tailwind CSS, PostCSS
- Backend (Data): Firebase Firestore, Realtime Rules
- PWA: manifest.json, service worker (sw.js)
- Mobile: Capacitor (capacitor.config.ts)
