import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Registro do Service Worker para suporte PWA/Offline
if ('serviceWorker' in navigator) {
  // Listener para mensagem SW_ACTIVATED — recarrega a página quando um novo SW assume
  // Isso garante que o bundle JS novo seja carregado após o SW atualizar
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_ACTIVATED') {
      console.log('MyPlacar: novo SW ativado, recarregando para versão mais recente...');
      // Só recarrega se a página não foi carregada pelo próprio SW nesta sessão
      if (!sessionStorage.getItem('sw-reload-done')) {
        sessionStorage.setItem('sw-reload-done', '1');
        window.location.reload();
      }
    }
  });

  window.addEventListener('load', async () => {
    // Limpa o flag de reload ao carregar (permite reload na próxima atualização)
    sessionStorage.removeItem('sw-reload-done');
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
              console.log('MyPlacar: Nova versão do SW disponível e aguardando.');
            }
          });
        }
      });

      // Força verificação de atualização imediata
      await registration.update();
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