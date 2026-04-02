import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [ 
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: { /* copie do seu manifest.json */ },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}']
      },
      devOptions: { enabled: true }
    })
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
