export type TripWaypoint = { lat: number; lng: number }

function tripBounds(route: readonly TripWaypoint[]) {
  const lats = route.map(p => p.lat)
  const lngs = route.map(p => p.lng)
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }
}

/**
 * Build a Google Maps Embed API (Directions) URL for trip visualization.
 * Enable "Maps Embed API" in Google Cloud and restrict the key by HTTP referrer.
 *
 * @see https://developers.google.com/maps/documentation/embed/get-started
 */
export function getGoogleMapsEmbedApiKey(): string | undefined {
  const k = import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY
  return typeof k === 'string' && k.trim().length > 0 ? k.trim() : undefined
}

export function buildTripDirectionsEmbedUrl(opts: {
  apiKey: string
  route: readonly TripWaypoint[]
}): string | null {
  const { apiKey, route } = opts
  if (!apiKey || route.length < 2) return null

  const origin = `${route[0].lat},${route[0].lng}`
  const destination = `${route[route.length - 1].lat},${route[route.length - 1].lng}`
  const inner = route.slice(1, -1)
  const u = new URL('https://www.google.com/maps/embed/v1/directions')
  u.searchParams.set('key', apiKey)
  u.searchParams.set('origin', origin)
  u.searchParams.set('destination', destination)
  u.searchParams.set('mode', 'driving')
  if (inner.length > 0) {
    u.searchParams.set('waypoints', inner.map(p => `${p.lat},${p.lng}`).join('|'))
  }
  return u.toString()
}

export function routeToSvgPoints(
  route: readonly TripWaypoint[],
  width: number,
  height: number,
): { x: number; y: number }[] {
  if (route.length === 0) return []
  const { minLat, maxLat, minLng, maxLng } = tripBounds(route)
  const latSpan = Math.max(maxLat - minLat, 1e-6)
  const lngSpan = Math.max(maxLng - minLng, 1e-6)
  const pad = 14
  const w = width - pad * 2
  const h = height - pad * 2
  return route.map(p => ({
    x: pad + ((p.lng - minLng) / lngSpan) * w,
    y: pad + (1 - (p.lat - minLat) / latSpan) * h,
  }))
}

/** Normalize lat/lng to SVG path for short-range routes (not Web Mercator — adequate for mock UI). */
export function routeToSvgPathD(route: readonly TripWaypoint[], width: number, height: number): string {
  const pts = routeToSvgPoints(route, width, height)
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}
