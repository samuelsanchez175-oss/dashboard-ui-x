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
    // Match common bookmarks; fail fast if 5175 is busy (strictPort).
    port: 5175,
    strictPort: true,
    host: true,
  },
  build: {
    /**
     * Use esbuild for minification instead of the default rolldown minifier.
     * Conservative name mangling avoids identifier collisions with
     * React-internal helpers.
     */
    minify: 'esbuild',
    rolldownOptions: {
      output: {
        /**
         * Force `lucide-react` into its own chunk.
         *
         * Default auto-chunking placed the lucide `createLucideIcon` factory
         * inside the main bundle, but the main bundle ALSO synchronously
         * imports `files-store` (where many icons are defined). files-store
         * then imports the factory back from main → circular dependency.
         * In Vercel's build the factory binding is still uninitialized when
         * files-store evaluates → `TypeError: i is not a function`.
         *
         * Pulling lucide into a dedicated chunk gives both sides a third
         * dependency they share without any back-edge to main.
         */
        manualChunks(id) {
          if (id.includes('node_modules/lucide-react')) return 'lucide-react'
        },
      },
    },
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
