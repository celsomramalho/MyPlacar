import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { registerServiceWorker } from '@pwa/registerServiceWorker';
import './index.css';

registerServiceWorker();

// Alguns navegadores móveis exibem o menu nativo ao detectar um toque longo.
// Evita que esse menu cubra o placar enquanto o MyPlacar está aberto.
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
}, true);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
