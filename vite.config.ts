import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Build tooling only — the app's runtime config lives in server/config.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiPort = env.PORT || '3000';
  return {
    root: path.resolve(__dirname, 'client'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@shared': path.resolve(__dirname, 'shared') },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/client'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
