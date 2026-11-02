// Configuración de Vite (servidor de desarrollo y build) y de Vitest (pruebas en jsdom).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom' },
});
