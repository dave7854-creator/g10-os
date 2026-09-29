import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
        towing: fileURLToPath(new URL('./towing.html', import.meta.url)),
        pay: fileURLToPath(new URL('./pay.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
        publicSite: fileURLToPath(new URL('./public-site.html', import.meta.url)),
        authCallback: fileURLToPath(new URL('./auth-callback.html', import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
