import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serveImagesPlugin } from './vite-plugin-serve-images'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveImagesPlugin()],
  publicDir: 'public',
  server: {
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/excel': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // Don't rewrite the path
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
