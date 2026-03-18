import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Usa o sw.js customizado como base, mas injeta o manifesto de cache via injectManifest
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.js',
      // Garante que o SW seja registrado automaticamente
      registerType: 'autoUpdate',
      // Inclui todos os assets gerados pelo Vite no pré-cache
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/node_modules/**'],
      },
      manifest: false, // já temos manifest.json próprio
      devOptions: {
        enabled: false, // não ativa SW em dev para evitar cache confuso
      },
    }),
  ],
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/firestore',
      'firebase/auth',
      'firebase/storage',
      '@google/genai',
      'lucide-react',
      'leaflet'
    ]
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('leaflet')) return 'vendor-leaflet';
            if (id.includes('@google/genai')) return 'vendor-gemini';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        },
      },
    },
  },
});
