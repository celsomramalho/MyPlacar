import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Lê APP_VERSION direto de constants.ts para injetar no sw.js sem duplicar
const constantsRaw = readFileSync(resolve(__dirname, 'src/constants.ts'), 'utf-8');
const versionMatch = constantsRaw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
const APP_VERSION  = versionMatch ? versionMatch[1] : Date.now().toString();

// https://vitejs.dev/config/
export default defineConfig({
  // Expõe APP_VERSION e CACHE_NAME para o código do app via import.meta.env
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __CACHE_NAME__:  JSON.stringify(`myplacar-v${APP_VERSION}`),
  },
  plugins: [
    react(),
  ],
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
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase'))    return 'vendor-firebase';
            if (id.includes('leaflet'))     return 'vendor-leaflet';
            if (id.includes('@google/genai')) return 'vendor-gemini';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        },
      },
    },
  },
});
