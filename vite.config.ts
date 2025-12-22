
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 載入環境變數
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 這是關鍵：Vercel 需要這些定義來在前端替換環境變數
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY),
      'process.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY),
      'process.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
      // 預留其他 Firebase 變數
      'process.env': JSON.stringify({
        ...env,
        API_KEY: env.API_KEY || process.env.API_KEY
      }),
      'global': 'window',
    },
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        buffer: 'buffer',
        stream: 'stream-browserify',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
