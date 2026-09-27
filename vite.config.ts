import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The site's fixed public paths — the ones that are pages rather than folders
// of the catalogue. Each gets a real file so GitHub Pages answers 200 instead
// of falling through to 404.html.
//
// This matters beyond tidiness. Google fetches the privacy policy URL while
// verifying the site's brand, and a crawler handed a 404 has every reason to
// call the page missing however well it renders. The same goes for anything
// else that reads status codes rather than pixels: link previews, archivers,
// uptime checks.
//
// Keep this list in step with parseRoute() in src/lib/router.ts. Catalogue
// paths (/genre/techno…) are open-ended and cannot be pre-listed — they keep
// falling through to 404.html, which works and always has.
// Deliberately NOT here: /connexion. It is where Google returns after a
// login, and giving it a file would make the host redirect that return through
// /connexion/ — one more hop on the single path in this project that cannot be
// exercised locally, for a status code no crawler will ever read. It keeps
// falling through 404.html, which is exactly what it has always done.
const PUBLIC_PATHS = ['glossaire', 'confidentialite', 'favoris', 'compte', 'trouver']

// GitHub Pages serves 404.html for any path with no file behind it, and has no
// SPA rewrite setting. Shipping a copy of index.html under that name is what
// lets a cold deep link like /genre/techno boot the app instead of dead-ending
// (it's served with a 404 status, invisible to visitors but worth knowing).
//
// The named pages above get their own copy as <path>/index.html, which Pages
// serves at /<path>/ with a 200 — and /<path> without the slash is redirected
// there rather than 404ing. parseRoute ignores the trailing slash, so the same
// route resolves either way; router.test.ts pins that for each of them.
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
      const index = resolve(dir, 'index.html')
      copyFileSync(index, resolve(dir, '404.html'))
      for (const path of PUBLIC_PATHS) {
        mkdirSync(resolve(dir, path), { recursive: true })
        copyFileSync(index, resolve(dir, path, 'index.html'))
      }
    },
  }
}

// The oldest browsers the stylesheet is compiled for.
//
// This is not cosmetic. Vite 8 minifies CSS with Lightning CSS, and Lightning
// CSS rewrites whatever the target browsers can read — with the default target
// (Safari 16.4) it turns every `@media (max-width: 700px)` into the Media
// Queries 4 range form `@media (width <= 700px)`. Safari only learned that
// form in 16.4, and a browser that cannot parse a media query drops the block
// whole: an iPhone still on iOS 15 was getting the four-across desktop grid on
// a 390px screen, folder names and counts sliced off by the tile's
// `overflow: hidden`. Nothing was wrong with the CSS in src/ — only with what
// was being shipped.
//
// iOS 14.5 is the floor because that is where grid/flex `gap` arrives, which
// the layout leans on everywhere. Raise it only against a real reason, and
// re-check dist/assets/*.css for range-syntax media queries afterwards.
const CSS_TARGET = ['chrome87', 'edge88', 'firefox78', 'safari14.1', 'ios14.5']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback()],
  build: {
    cssTarget: CSS_TARGET,
  },
})
