import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Registro do Service Worker para suporte PWA/Offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('MyPlacar: ServiceWorker registrado com sucesso:', registration.scope);
      })
      .catch(error => {
        console.error('MyPlacar: Falha ao registrar ServiceWorker:', error);
      });
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