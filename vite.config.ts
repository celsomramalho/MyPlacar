import { defineConfig, Plugin } from 'vite';
/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ── Lê APP_VERSION de constants.ts ─────────────────────────────────────────
const constantsRaw = readFileSync(resolve(__dirname, 'src/constants.ts'), 'utf-8');
const versionMatch  = constantsRaw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
const APP_VERSION   = versionMatch ? versionMatch[1] : Date.now().toString();
const CACHE_NAME    = `myplacar-v${APP_VERSION}`;

console.log(`\n🔖 MyPlacar build — versão: ${APP_VERSION} | cache: ${CACHE_NAME}\n`);

// ── Plugin: gera dist/sw.js (build) e public/sw.js (dev) a partir do template ──
// O public/sw.js gerado aqui NÃO deve ser commitado (.gitignore).
// É necessário em dev porque o Vite serve /public diretamente sem passar pelo bundle.
function swInjectPlugin(): Plugin {
  return {
    name: 'sw-inject-cache-name',

    // Roda no início do servidor de dev → gera public/sw.js para o Vite servir
    buildStart() {
      const templatePath  = resolve(__dirname, 'public/sw.template.js');
      const devOutputPath = resolve(__dirname, 'public/sw.js');
      try {
        const template = readFileSync(templatePath, 'utf-8');
        const output   = template.replace(/%%CACHE_NAME%%/g, CACHE_NAME);
        writeFileSync(devOutputPath, output, 'utf-8');
        console.log(`✅ sw.js (dev) gerado com CACHE_NAME = "${CACHE_NAME}"`);
      } catch (e) {
        console.error('❌ Erro ao gerar sw.js (dev):', e);
      }
    },

    // Roda ao fim do build de produção → sobrescreve dist/sw.js
    closeBundle() {
      const templatePath   = resolve(__dirname, 'public/sw.template.js');
      const distOutputPath = resolve(__dirname, 'dist/sw.js');
      try {
        const template = readFileSync(templatePath, 'utf-8');
        const output   = template.replace(/%%CACHE_NAME%%/g, CACHE_NAME);
        writeFileSync(distOutputPath, output, 'utf-8');
        console.log(`✅ sw.js (dist) gerado com CACHE_NAME = "${CACHE_NAME}"`);
      } catch (e) {
        console.error('❌ Erro ao gerar sw.js (dist):', e);
      }
    },
  };
}

function htmlVersionPlugin(): Plugin {
  return {
    name: 'html-inject-app-version',
    transformIndexHtml(html) {
      return html.replace(/%%APP_VERSION%%/g, APP_VERSION);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'spa',
  plugins: [
    react(),
    htmlVersionPlugin(),
    swInjectPlugin(),
  ],
  resolve: {
    alias: {
      '@modules':  resolve(__dirname, 'src/modules'),
      '@shared':   resolve(__dirname, 'src/shared'),
      '@infra':    resolve(__dirname, 'src/infrastructure'),
      '@routes':   resolve(__dirname, 'src/routes'),
    },
  },
  define: {
    // Disponível no código React via import.meta.env ou como constante
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    // Garante fallback correto caso o sw.js seja processado pelo bundler
    'self.__CACHE_NAME__': JSON.stringify(CACHE_NAME),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/firestore',
      'firebase/auth',
      'firebase/storage',
      '@google/genai',
      'lucide-react',
      'leaflet',
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    alias: {
      '@modules': resolve(__dirname, 'src/modules'),
      '@shared':  resolve(__dirname, 'src/shared'),
      '@infra':   resolve(__dirname, 'src/infrastructure'),
      '@routes':  resolve(__dirname, 'src/routes'),
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase'))      return 'vendor-firebase';
            if (id.includes('leaflet'))       return 'vendor-leaflet';
            if (id.includes('@google/genai')) return 'vendor-gemini';
            if (id.includes('lucide-react'))  return 'vendor-icons';
            // React e ReactDOM raramente mudam — chunk dedicado maximiza cache de longo prazo
            if (id.includes('react-dom') || id.includes('/react/'))
                                              return 'vendor-react';
            // Supabase isolado: não invalida cache do React ao atualizar
            if (id.includes('@supabase'))     return 'vendor-supabase';
            return 'vendor';
          }
        },
      },
    },
  },
});
