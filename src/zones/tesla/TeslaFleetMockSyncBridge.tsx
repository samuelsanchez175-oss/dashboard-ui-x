import { useEffect, useMemo, useState } from 'react'

import { useMockData } from '../../context/MockDataContext'
import { getAllStoredApiKeys, setApiKey, subscribeApiKeys } from '../../lib/api-keys'
import {
  isTeslaFleetLiveCredentialPair,
  stripTeslaFleetDemoSeedsIfPresent,
  TESLA_CLIENT_ID_KEY,
  TESLA_CLIENT_SECRET_KEY,
  TESLA_LIVE_CREDENTIAL_SYNC_STORAGE_KEY,
} from './tesla-fleet-credentials'

/**
 * Keeps global Mock data in sync with Tesla Fleet scratch credentials app-wide
 * (keys may be edited from Settings as well as the Tesla zone).
 */
export function TeslaFleetMockSyncBridge() {
  const { setMockDataEnabled } = useMockData()
  const [stored, setStored] = useState<Record<string, string>>(() => getAllStoredApiKeys())

  useEffect(() => subscribeApiKeys(setStored), [])

  const clientId = stored[TESLA_CLIENT_ID_KEY] ?? ''
  const clientSecret = stored[TESLA_CLIENT_SECRET_KEY] ?? ''

  const liveFleetCredentials = useMemo(
    () => isTeslaFleetLiveCredentialPair(clientId, clientSecret),
    [clientId, clientSecret],
  )

  useEffect(() => {
    if (liveFleetCredentials) {
      stripTeslaFleetDemoSeedsIfPresent(clientId, clientSecret, setApiKey)
      setMockDataEnabled(false)
      try {
        localStorage.setItem(TESLA_LIVE_CREDENTIAL_SYNC_STORAGE_KEY, '1')
      } catch {
        /* private mode */
      }
      return
    }
    try {
      if (localStorage.getItem(TESLA_LIVE_CREDENTIAL_SYNC_STORAGE_KEY) === '1') {
        localStorage.removeItem(TESLA_LIVE_CREDENTIAL_SYNC_STORAGE_KEY)
        setMockDataEnabled(true)
      }
    } catch {
      /* private mode */
    }
  }, [liveFleetCredentials, clientId, clientSecret, setMockDataEnabled])

  return null
}
