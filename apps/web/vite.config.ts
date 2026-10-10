import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReqWs', (upstream, request) => {
            upstream.on('response', (response) => {
              console.warn(
                `[aura] WebSocket handshake rejected: HTTP ${response.statusCode} for ${request.url}, Origin ${request.headers.origin ?? '(none)'}.` +
                  (response.statusCode === 403
                    ? ' Set the API WEB_ORIGIN to the browser origin and restart the API.'
                    : ' Check the API route and server logs.'),
              );
            });
          });
        },
      },
    },
  },
});
