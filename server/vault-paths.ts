import { existsSync } from 'node:fs'

const CANDIDATE_VAULTS = [
  process.env.VAULT_DIR,
  '/Users/samuel/Pictures/OB CLAUDE vault',
  '/Users/samuel/Documents/OB CLAUDE V1',
  '/Users/samuel/dev/OB CLAUDE vault',
].filter(Boolean) as string[]

export function resolveVaultDir(): string {
  for (const p of CANDIDATE_VAULTS) {
    if (p && existsSync(p)) return p
  }
  return CANDIDATE_VAULTS[1] ?? '/Users/samuel/Pictures/OB CLAUDE vault'
}

export function vaultCandidates(): string[] {
  return [...CANDIDATE_VAULTS]
}
