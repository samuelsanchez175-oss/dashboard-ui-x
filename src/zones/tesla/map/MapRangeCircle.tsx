import { useEffect, useRef, useState } from 'react'

export type MapRangeCircleProps = {
  /** Range in miles available right now (from `vehicle_data.charge_state.est_battery_range`). */
  rangeMiles: number
  /** Battery state of charge 0-100. */
  batteryPercent: number
  /** Target charge limit % (charge_state.charge_limit_soc). Used for the outer dashed ring. */
  chargeLimitPct?: number | null
  /** Vehicle is actively charging — drives the color choice. */
  isCharging?: boolean
  /** Optional toggle so users can hide the circle. Default true. */
  visible?: boolean
}

function pickColor(batteryPercent: number, isCharging: boolean): string {
  if (isCharging) return '#ff9900'
  if (batteryPercent > 50) return '#00aa00'
  if (batteryPercent > 20) return '#ff9900'
  return '#ef4444'
}

export default function MapRangeCircle({
  rangeMiles,
  batteryPercent,
  chargeLimitPct = null,
  isCharging = false,
  visible = true,
}: MapRangeCircleProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 600, h: 400 })

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const parent = el.parentElement
    if (!parent) return

    const measure = () => {
      const rect = parent.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDims({ w: rect.width, h: rect.height })
      }
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  if (!visible) return null
  if (rangeMiles <= 0) return null

  const color = pickColor(batteryPercent, isCharging)
  const cx = dims.w / 2
  const cy = dims.h / 2
  const baseRadius = 0.4 * Math.min(dims.w, dims.h)
  const innerScale = Math.max(0, Math.min(1, batteryPercent / 100))
  const outerScale = Math.max(
    0,
    Math.min(1, (chargeLimitPct ?? 80) / 100),
  )
  const innerR = baseRadius * innerScale
  const outerR = baseRadius * outerScale
  const gradId = 'range-grad'

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none z-10"
      width="100%"
      height="100%"
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={0} />
          <stop offset="100%" stopColor={color} stopOpacity={0.08} />
        </radialGradient>
      </defs>

      {outerR > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 6"
          opacity={0.4}
        />
      )}

      {innerR > 0 && (
        <>
          <circle cx={cx} cy={cy} r={innerR} fill={`url(#${gradId})`} />
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={1}
          />
          <text
            x={cx}
            y={cy + innerR - 8}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#ffffff"
            style={{
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
            }}
          >
            {`Range • ${rangeMiles} mi`}
          </text>
        </>
      )}
    </svg>
  )
}
