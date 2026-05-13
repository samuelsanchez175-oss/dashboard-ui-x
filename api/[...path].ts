/**
 * Vercel catch-all API function — bridges every `/api/*` request to the same
 * Connect-style middleware chain we use under Vite in dev (`attachDashboardBff`
 * + `attachAgentFarmBff`). This keeps the BFF logic in one place and lets the
 * deployed Vercel build serve the same routes the dev server does.
 *
 * Routing: Vercel maps `api/[...path].ts` to `/api/*` automatically. Inside,
 * we walk the middleware chain ourselves (each handler calls `next()` to pass
 * the request along).
 *
 * Filesystem caveats on Vercel serverless functions:
 *   - Read-only outside `/tmp`. The Tesla virtual-key generator that writes
 *     `.tesla-virtual-key.json` + `public/.well-known/...` ONLY works locally.
 *     The static `public/...` PEM file is shipped with the build, so Tesla
 *     can still GET it from the deployed domain.
 *   - For data fetching + OAuth + REST commands (the primary path), no disk
 *     writes are needed — those work on Vercel as-is.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

// Import from the pre-bundled BFF (built by `scripts/bundle-bff.mjs` during
// `npm run prebuild`). The bundle is a single self-contained ESM file with
// every dependency inlined — works without Vercel having to follow imports
// across the `server/` tree at runtime.
// @ts-expect-error generated at build time, no .d.ts
import { attachAgentFarmBff, attachDashboardBff } from './_bff-bundle.mjs'

type Next = () => void
type Handler = (req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>

const handlers: Handler[] = []

const fakeMiddlewares = {
  use: (fn: Handler) => {
    handlers.push(fn)
  },
}

// Module-scoped registration — Vercel keeps warm function instances, so this
// runs once per cold start. `process.cwd()` on Vercel is `/var/task`, which is
// the read-only deployment root. The BFF helpers tolerate missing optional
// files (Tesla virtual key, content/, etc.) gracefully.
let registered = false
function ensureRegistered(): void {
  if (registered) return
  registered = true
  attachDashboardBff(fakeMiddlewares, process.cwd())
  attachAgentFarmBff(fakeMiddlewares)
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  ensureRegistered()
  let i = 0
  const next: Next = () => {
    const fn = handlers[i++]
    if (!fn) {
      if (!res.writableEnded) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'error', message: 'Unknown API route', detail: req.url ?? '' }))
      }
      return
    }
    try {
      Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
        if (!res.writableEnded) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              status: 'error',
              message: 'BFF handler threw',
              detail: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      })
    } catch (err) {
      if (!res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            status: 'error',
            message: 'BFF handler threw synchronously',
            detail: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
  }
  next()
}
