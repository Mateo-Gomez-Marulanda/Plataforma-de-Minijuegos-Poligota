// Configuración de Vite (servidor de desarrollo) y de Vitest (pruebas en jsdom).
// El servidor de desarrollo reenvía /api y /ws al gateway: el navegador solo habla con el puerto 5173,
// así que basta con compartir ese puerto para que otra persona pueda jugar.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dirección del gateway: localhost en desarrollo local; en Docker Compose es el servicio "gateway".
const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite rechaza por defecto los nombres de host que no conoce (como el de un túnel de VS Code).
    allowedHosts: true,
    proxy: {
      '/api': { target: gateway, changeOrigin: true },
      '/ws': { target: gateway, ws: true, changeOrigin: true },
    },
  },
  test: { environment: 'jsdom', environmentOptions: { jsdom: { url: 'http://localhost:5173' } } },
});
