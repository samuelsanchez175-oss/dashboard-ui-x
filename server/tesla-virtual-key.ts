/**
 * Tesla Virtual Key helper — generates and persists a P-256 (secp256r1) keypair
 * used by the Tesla Vehicle Command protocol for newer vehicles.
 *
 * Storage:
 *   - Private key + metadata: `.tesla-virtual-key.json` at the project root
 *     (gitignored — see `.gitignore`).
 *   - Public key PEM: `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
 *     which Vite serves at the URL root in dev and copies to `dist/` in prod.
 *
 * Tesla will GET the public key from your hosted domain — that's how they
 * verify your app's identity during pairing. The pairing link is
 * `https://www.tesla.com/_ak/<domain>` (open on the phone with the Tesla app
 * installed; you'll be prompted to allow the third-party app to access the car).
 *
 * No new npm deps — uses Node's built-in `node:crypto`, `node:fs`, `node:path`.
 */

import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Vercel serverless functions run with read-only `/var/task`. */
function isReadOnlyEnv(): boolean {
  return Boolean(process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

const PRIVATE_KEY_FILE = resolve(process.cwd(), '.tesla-virtual-key.json')
const PUBLIC_PEM_FILE = resolve(
  process.cwd(),
  'public/.well-known/appspecific/com.tesla.3p.public-key.pem',
)

export type VirtualKeyInfo = {
  hasKey: boolean
  publicKeyPem: string | null
  /** SHA-256 fingerprint of the DER-encoded SPKI public key, hex with colon separators. */
  fingerprint: string | null
  /** ISO timestamp of when the key was generated; null when missing. */
  createdAt: string | null
  /** Absolute path of the public PEM on disk (informational). */
  publicPemPath: string
}

type PersistedKey = {
  privateKeyPem: string
  publicKeyPem: string
  createdAt: string
}

function ensureDir(filepath: string): void {
  const dir = dirname(filepath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function fingerprintFromPem(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ format: 'der', type: 'spki' }) as Buffer
  const hash = createHash('sha256').update(der).digest('hex')
  // Format as aa:bb:cc:… for human display.
  return hash.match(/.{2}/g)?.join(':') ?? hash
}

function loadExisting(): PersistedKey | null {
  if (!existsSync(PRIVATE_KEY_FILE)) return null
  try {
    const raw = readFileSync(PRIVATE_KEY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedKey>
    if (!parsed.privateKeyPem || !parsed.publicKeyPem) return null
    return {
      privateKeyPem: parsed.privateKeyPem,
      publicKeyPem: parsed.publicKeyPem,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function writePublicPemToWellKnown(publicKeyPem: string): void {
  ensureDir(PUBLIC_PEM_FILE)
  writeFileSync(PUBLIC_PEM_FILE, publicKeyPem, { encoding: 'utf8' })
}

export function getVirtualKeyInfo(): VirtualKeyInfo {
  // Preferred path: private-key JSON on local disk (dev machine). Has both
  // public + private — supports signed commands.
  const existing = loadExisting()
  if (existing) {
    if (!existsSync(PUBLIC_PEM_FILE)) {
      try {
        writePublicPemToWellKnown(existing.publicKeyPem)
      } catch {
        // Non-fatal — read can succeed even if write fails.
      }
    }
    return {
      hasKey: true,
      publicKeyPem: existing.publicKeyPem,
      fingerprint: fingerprintFromPem(existing.publicKeyPem),
      createdAt: existing.createdAt,
      publicPemPath: PUBLIC_PEM_FILE,
    }
  }

  // Fallback: read-only environments (Vercel serverless functions) can't host
  // the private-key JSON file. But the PUBLIC PEM is shipped in the build
  // bundle (`public/.well-known/...`) and is what Tesla actually fetches for
  // ownership verification + partner registration. If we can read that file,
  // the deployment is functionally registered with Tesla — just not capable
  // of signing commands (signed commands require the private key, which only
  // your dev machine has). Reading commands and OAuth work fine.
  if (existsSync(PUBLIC_PEM_FILE)) {
    try {
      const pem = readFileSync(PUBLIC_PEM_FILE, 'utf8')
      if (pem.includes('BEGIN PUBLIC KEY')) {
        return {
          hasKey: true,
          publicKeyPem: pem,
          fingerprint: fingerprintFromPem(pem),
          createdAt: null,
          publicPemPath: PUBLIC_PEM_FILE,
        }
      }
    } catch {
      // Non-fatal — fall through to no-key state.
    }
  }

  return {
    hasKey: false,
    publicKeyPem: null,
    fingerprint: null,
    createdAt: null,
    publicPemPath: PUBLIC_PEM_FILE,
  }
}

/**
 * Generate a fresh P-256 keypair, persist private to gitignored JSON,
 * write public PEM to `public/.well-known/…`.
 *
 * Idempotent: if a private key already exists on disk, returns the existing
 * info unchanged. On read-only environments (Vercel) we can't write — but if
 * the public PEM is already deployed there's nothing to do, so we return the
 * info from the deployed PEM with `created: false` and a helpful note.
 */
export function generateVirtualKey(): VirtualKeyInfo & { created: boolean; note?: string } {
  const existing = loadExisting()
  if (existing) {
    return { ...getVirtualKeyInfo(), created: false }
  }

  if (isReadOnlyEnv()) {
    // Can't write the private key here. If the public PEM is already in the
    // deploy bundle, surface that — partner registration + OAuth + data
    // reading all work without a writable private key.
    const info = getVirtualKeyInfo()
    if (info.hasKey) {
      return {
        ...info,
        created: false,
        note:
          'Running on a read-only filesystem (Vercel). The deployed public PEM is the source of truth. Generate locally (on your dev machine) to get the private-key JSON for signed commands.',
      }
    }
    return {
      ...info,
      created: false,
      note:
        'Cannot write the private key on a read-only filesystem. Run `npm run dev` locally, click Generate there, commit the resulting public PEM (in `public/.well-known/`), and redeploy.',
    }
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  })
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
  const createdAt = new Date().toISOString()

  ensureDir(PRIVATE_KEY_FILE)
  writeFileSync(
    PRIVATE_KEY_FILE,
    JSON.stringify({ privateKeyPem, publicKeyPem, createdAt }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  )
  writePublicPemToWellKnown(publicKeyPem)

  return {
    hasKey: true,
    publicKeyPem,
    fingerprint: fingerprintFromPem(publicKeyPem),
    createdAt,
    publicPemPath: PUBLIC_PEM_FILE,
    created: true,
  }
}

/** Loads private key PEM if present — used by command-signing helpers later. */
export function loadPrivateKeyPem(): string | null {
  const existing = loadExisting()
  return existing?.privateKeyPem ?? null
}
