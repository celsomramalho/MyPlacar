import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dyadComponentTagger from '@dyad-sh/react-vite-component-tagger';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [dyadComponentTagger(), react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800, // Aumenta um pouco o limite tolerado
    rollupOptions: {
      output: {
        // Separa as bibliotecas em chunks diferentes para melhorar o carregamento e cache
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet';
            }
            if (id.includes('@google/genai')) {
              return 'vendor-gemini';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            return 'vendor'; // Outras libs menores ficam no chunk vendor padrão
          }
        },
      },
    },
  },
});