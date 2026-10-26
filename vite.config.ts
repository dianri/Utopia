import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'radar.svg'],
      manifest: {
        name: 'Las Meriendas: Monster Hunt',
        short_name: 'MonsterHunt',
        description: 'Juego cooperativo táctico de geolocalización en tiempo real contra el Monstruo de Las Meriendas',
        theme_color: '#080c10',
        background_color: '#080c10',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/radar.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/radar.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openfreemap-tiles-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 días
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre': ['maplibre-gl'],
          'supabase': ['@supabase/supabase-js'],
          'vendor': ['react', 'react-dom', 'lucide-react', 'canvas-confetti']
        }
      }
    }
  }
});
