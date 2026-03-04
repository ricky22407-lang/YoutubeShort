import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // ❌ 移除這行：'process.env': JSON.stringify({ ...env, ...process.env }),
      // ✅ 只暴露公開的變數（如果需要）
      // 'process.env.PUBLIC_APP_NAME': JSON.stringify('ShortsPilot'),
      'global': 'window',
    },
    resolve: {
      alias: {
        buffer: 'buffer',
        stream: 'stream-browserify',
      },
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});