import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // CRITICAL FIX: Do NOT precache index.html.
        // When a new deploy happens, the SW would serve the OLD cached
        // index.html which references OLD hashed JS chunks that no longer
        // exist on the server — causing silent 404s and an infinite spinner.
        // By excluding HTML from precache, the browser always fetches a
        // fresh index.html from the network on navigation.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],

        // For navigation requests (typing a URL, refreshing), always go to
        // the network first. Fall back to index.html only if offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],

        // Network-first for navigation so fresh HTML is always loaded
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      manifest: {
        name: 'Bhuiyan Books',
        short_name: 'Bhuiyan Books',
        description: 'Bhuiyan Workforce Management',
        theme_color: '#050D1A',
        background_color: '#050D1A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icon-192.png',     sizes: '192x192', type: 'image/png' },
          { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512.png',     sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ]
      }
    })
  ],
})
