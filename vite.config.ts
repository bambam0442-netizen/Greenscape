import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GreenScape Landscape Mockup Studio',
        short_name: 'GreenScape',
        description: 'Fast field-ready landscape mockups with realistic plant placement',
        theme_color: '#143d2b',
        background_color: '#f4f7f2',
        display: 'standalone',
        start_url: '/',
        icons: []
      }
    })
  ]
})
