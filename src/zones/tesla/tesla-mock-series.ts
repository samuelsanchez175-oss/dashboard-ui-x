/**
 * Mock time-series + coordinates for Tesla dashboard visuals (Fleet API stand-in).
 */

export type LatLng = { lat: number; lng: number }

/** Hour-of-day labels (local) + state of charge %. */
export const MOCK_SOC_BY_HOUR = Array.from({ length: 24 }, (_, h) => {
  const wave = Math.sin((h - 6) / 4) * 9
  const eveningDrain = h >= 17 && h <= 22 ? -(h - 16) * 0.9 : 0
  const overnightCharge = h <= 5 ? (5 - h) * 1.1 : 0
  const soc = Math.min(100, Math.max(52, 78 + wave + eveningDrain + overnightCharge))
  return { hour: h, soc: Math.round(soc * 10) / 10 }
})

/** Mon → Sun home charging energy (kWh). */
export const MOCK_HOME_CHARGE_KWH_WEEK = [14.2, 9.8, 18.4, 11.0, 16.3, 13.5, 21.2]

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Last-trip energy split (mock kWh). */
export const MOCK_TRIP_ENERGY = {
  motiveKwh: 2.85,
  regenKwh: 0.62,
  preconditionKwh: 0.18,
}

/** Drive score trend last 7 days. */
export const MOCK_DRIVE_SCORE_SERIES = [91, 93, 92, 94, 93, 95, 94]

/**
 * Mock commute polyline near SF peninsula — used for SVG fallback + Maps Embed directions.
 */
export const MOCK_TRIP_POLYLINE: LatLng[] = [
  { lat: 37.4419, lng: -122.143 },
  { lat: 37.4482, lng: -122.158 },
  { lat: 37.4591, lng: -122.169 },
  { lat: 37.4725, lng: -122.182 },
  { lat: 37.4848, lng: -122.148 },
  { lat: 37.4972, lng: -122.135 },
  { lat: 37.5089, lng: -122.121 },
]
