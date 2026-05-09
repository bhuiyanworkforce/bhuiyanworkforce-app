import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      // FIX: Without navigateFallback, the Workbox service worker had no
      // instruction for what to serve on navigation requests (e.g. refreshing
      // /dashboard). It fell through to the network, which on Cloudflare Pages
      // returned a cached or stale response that never resolved — causing the
      // infinite spinner on every hard refresh.
      //
      // navigateFallback: '/index.html' tells Workbox to serve index.html for
      // all navigation requests that don't match a precached asset, which is
      // exactly what a SPA needs. React Router then takes over client-side.
      //
      // navigateFallbackDenylist excludes the Cloudflare _redirects file and
      // any API/worker routes from being swallowed by the fallback.
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
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
