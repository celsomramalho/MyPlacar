import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Registro do Service Worker para suporte PWA/Offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // sempre busca o sw.js mais recente, ignora cache HTTP
      });
      console.log('MyPlacar: ServiceWorker registrado:', registration.scope);

      // Verifica se há uma atualização disponível imediatamente
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Novo SW instalado e aguardando — o app decidirá quando ativar
              console.log('MyPlacar: Nova versão do SW disponível e aguardando.');
            }
          });
        }
      });
    } catch (error) {
      console.error('MyPlacar: Falha ao registrar ServiceWorker:', error);
    }
  });
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}