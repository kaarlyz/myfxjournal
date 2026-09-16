import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts', 'lucide-react', 'framer-motion'],
          'vendor-i18n': ['i18next', 'react-i18next'],
        },
      },
    },
  },

  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    allowedHosts: true,

    proxy: {
      // SSE endpoint — needs special config: no buffering, no timeout
      '/api/events': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,

        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            // Keep SSE connection alive
            req.socket.setTimeout(0);
          });

          proxy.on('error', (err: any, _req, res: any) => {
            const isExpectedDisconnect =
              err?.code === 'ECONNRESET' ||
              err?.code === 'ECONNREFUSED' ||
              err?.code === 'ENOTFOUND';

            if (!isExpectedDisconnect) {
              console.error(
                '[SSE proxy] Unexpected error:',
                err?.code,
                err?.message
              );
            }

            if (res && !res.headersSent) {
              try {
                res.end();
              } catch (_) {}
            }
          });
        },
      },

      // General API proxy
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});