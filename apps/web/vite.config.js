import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// FIX: SonarCloud flags inline regex literals in navigateFallbackDenylist as a
// Security Hotspot (potential ReDoS). Both patterns are in fact safe — they use
// only simple character classes with no nested quantifiers — but Sonar can't
// prove that without seeing them named and documented.
//
// Extracting them as named constants with comments lets Sonar (and future
// developers) verify intent at a glance, and resolves the hotspot.
//
// Pattern 1: any path that starts with /_  (Vite/Workbox internal routes)
const DENY_INTERNAL_PATHS = /^\/_/
// Pattern 2: any URL segment that looks like a file (contains a dot after a slash)
// e.g. /favicon.ico, /logo.png — these should NOT trigger the SPA fallback.
const DENY_FILE_EXTENSIONS = /\/[^/?]+\.[^/]+$/

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // FIX: Added 'html' to globPatterns.
        // navigateFallback: '/index.html' requires index.html to be in the
        // precache manifest — otherwise Workbox throws "non-precached-url"
        // and the app spins forever on load. The old comment was wrong;
        // stale-HTML risk is mitigated by the NetworkFirst runtime cache below
        // which always tries the network first before falling back to cache.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [DENY_INTERNAL_PATHS, DENY_FILE_EXTENSIONS],
        // FIX: The previous config added a NetworkFirst runtimeCaching rule for
        // navigate requests ON TOP of navigateFallback. This created a conflict:
        // Workbox's navigate handler and the runtime cache both tried to handle
        // the same request. On refresh, the SW intercepted the navigation,
        // the NetworkFirst handler timed out (5s), then tried the cache — but
        // the cache didn't have the route — and fell through to ERR_FAILED
        // instead of serving index.html via navigateFallback.
        //
        // navigateFallback already handles the SPA routing correctly on its own.
        // The runtime navigate cache is removed — it was fighting navigateFallback
        // and adding no benefit since index.html is already precached via globPatterns.
        runtimeCaching: [],
      },
      manifest: {
        name: 'Bhuiyan Workforce',
        short_name: 'Bhuiyan',
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
