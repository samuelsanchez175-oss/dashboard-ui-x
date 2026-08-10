import { useCallback, useEffect, useState } from 'react'
import { vaultApi, type VaultStatus } from '../../lib/vault-api'

export function useVaultStatus() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await vaultApi().status()
      setStatus(s)
      if (!s.exists) setError(s.message || 'Vault not found on disk.')
    } catch (e: any) {
      setError(e?.message || 'Could not reach vault API (is the dev server running?)')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, error, loading, refresh }
}
