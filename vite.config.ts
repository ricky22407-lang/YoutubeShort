import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'global': 'window',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      stream: 'stream-browserify',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'stream-browserify'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});