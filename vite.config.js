import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative, not a hard-coded path. Every asset URL is resolved against
  // wherever index.html happens to be served from, so the same build works at
  // /finance-checklist-app/, at /finance-tracker-app/, at the root of a custom
  // domain, and on any host. Renaming the site has blanked the screen twice;
  // this removes the whole class of failure rather than re-pointing it.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Finance Tracker',
        short_name: 'Finance',
        description: 'Controle de pagamentos mensais e anuais',
        theme_color: '#ffffff',
        background_color: '#f4f5f8',
        display: 'standalone',
        // Relative for the same reason as `base` — resolved against the
        // manifest's own location, so the installed app follows the site.
        start_url: './',
        scope: './',
        lang: 'pt-BR',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache all app assets so it works fully offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
