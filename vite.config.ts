import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // rutas relativas: permite publicar la app en una subcarpeta (p. ej. GitHub Pages)
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lectura de notas',
        short_name: 'Notas',
        description: 'Entrenador de lectura de notas en el pentagrama',
        lang: 'es',
        display: 'standalone',
        orientation: 'any',
        background_color: '#14161b',
        theme_color: '#14161b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // incluye las muestras de piano para que suenen también sin conexión
        globPatterns: ['**/*.{js,css,html,woff,svg,png,mp3}'],
      },
    }),
  ],
  server: { host: true },
});
