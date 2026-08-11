import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves 404.html for any path with no file behind it, and has no
// SPA rewrite setting. Shipping a copy of index.html under that name is what
// lets a cold deep link like /genre/techno boot the app instead of dead-ending
// (it's served with a 404 status, invisible to visitors but worth knowing).
function spaFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const dir = resolve(process.cwd(), outDir)
      copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback()],
})
