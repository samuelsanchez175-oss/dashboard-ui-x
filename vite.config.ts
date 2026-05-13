import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'

import { attachAgentFarmBff } from './server/agent-farm-bff'
import { attachDashboardBff } from './server/dashboard-bff'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
/** Load server-only secrets for Vite's Node middleware (never exposed to bundled client). */
dotenv.config({ path: path.resolve(repoRoot, '.env'), quiet: false })
dotenv.config({ path: path.resolve(repoRoot, '.env.local'), override: true, quiet: false })

export default defineConfig({
  server: {
    /** Match common bookmarks; falls back to next port if 5175 is busy. */
    port: 5175,
    strictPort: false,
    host: true,
  },
  build: {
    /**
     * Use esbuild for minification instead of the default rolldown minifier.
     * Rolldown's name-mangler (Vite 8 default) was picking short identifiers
     * that collided with React-internal symbols (`kt`) in some builds, which
     * caused `TypeError: i is not a function` at module load on Vercel while
     * working fine locally (different mangler heuristics per host).
     * esbuild's mangler is more conservative and ships proven-stable output.
     */
    minify: 'esbuild',
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'dashboard-bff-dev',
      configureServer(server) {
        attachDashboardBff(server.middlewares, repoRoot)
      },
      configurePreviewServer(server) {
        attachDashboardBff(server.middlewares, repoRoot)
      },
    },
    {
      name: 'agent-farm-bff-dev',
      configureServer(server) {
        attachAgentFarmBff(server.middlewares)
      },
      configurePreviewServer(server) {
        attachAgentFarmBff(server.middlewares)
      },
    },
  ],
})
