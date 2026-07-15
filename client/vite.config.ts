import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
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
            // Force connection: keep-alive upstream
            req.socket.setTimeout(0);
          });
          proxy.on('error', (err: any, _req, res: any) => {
            // Suppress ECONNRESET + ECONNREFUSED noise for SSE — the client handles
            // reconnects via exponential backoff so these logs are just noise.
            const isExpectedDisconnect =
              err?.code === 'ECONNRESET' ||
              err?.code === 'ECONNREFUSED' ||
              err?.code === 'ENOTFOUND';

            if (!isExpectedDisconnect) {
              // Log unexpected errors only
              console.error('[SSE proxy] Unexpected error:', err?.code, err?.message);
            }

            // Close response if still open
            if (res && !res.headersSent) {
              try { res.end(); } catch (_) {}
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


