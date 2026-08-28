/* eslint-disable react-refresh/only-export-components */
import type { CornerDotType, CornerSquareType, DotType } from 'qr-code-styling'

export type FrameId =
  | 'none'
  | 'pill'
  | 'bar'
  | 'caption'
  | 'tag'
  | 'pointer'
  | 'balloon'
  | 'gift'
  | 'polaroid'
  | 'chevron'
  | 'ribbon'
  | 'brush'
  | 'script'
  | 'bag'
  | 'box'
  | 'phone'
  | 'arrow'
  | 'laptop'
  | 'beer'
  | 'coffee'
  | 'chef'
  | 'scooter'
  | 'cloche'
  | 'cocktail'
  | 'takeout'
  | 'menu'
  | 'badge'

export type LogoId = 'none' | 'truck' | 'globe' | 'scan' | 'scanText'
export type ShapeId = DotType
export type CornerId =
  | 'eye-round'
  | 'sq-sq'
  | 'eye-dot'
  | 'sq-extra'
  | 'eye-sq'
  | 'eye-small'
  | 'sq-dot'
  | 'leaf'
  | 'classy-d'
  | 'eye-soft'
  | 'classy-left'
  | 'classy-right'
  | 'classy-angle'
  | 'leaf-sq'
  | 'thick-sq'

export type CornerSpec = {
  id: CornerId
  label: string
  square: CornerSquareType
  dot: CornerDotType
}

export const FRAME_OPTIONS: { id: FrameId; label: string }[] = [
  { id: 'none', label: 'No frame' },
  { id: 'pill', label: 'Pill' },
  { id: 'bar', label: 'Bar' },
  { id: 'caption', label: 'Caption' },
  { id: 'tag', label: 'Tag' },
  { id: 'pointer', label: 'Pointer' },
  { id: 'balloon', label: 'Balloon' },
  { id: 'gift', label: 'Gift' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'brush', label: 'Brush' },
  { id: 'script', label: 'Script' },
  { id: 'bag', label: 'Bag' },
  { id: 'box', label: 'Box' },
  { id: 'phone', label: 'Phone' },
  { id: 'arrow', label: 'Arrow' },
]

export const RESTAURANT_OPTIONS: { id: FrameId; label: string }[] = [
  { id: 'laptop', label: 'Laptop' },
  { id: 'beer', label: 'Beer mug' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'chef', label: 'Chef' },
  { id: 'scooter', label: 'Scooter' },
  { id: 'cloche', label: 'Cloche' },
  { id: 'cocktail', label: 'Cocktail' },
  { id: 'takeout', label: 'Takeout' },
  { id: 'menu', label: 'Menu' },
  { id: 'badge', label: 'Badge' },
]

export const RESTAURANT_IDS = new Set<FrameId>(RESTAURANT_OPTIONS.map(o => o.id))

export const SHAPE_OPTIONS: { id: ShapeId; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'dots', label: 'Dots' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'extra-rounded', label: 'Soft' },
  { id: 'classy', label: 'Classy' },
  { id: 'classy-rounded', label: 'Classy round' },
]

export const CORNER_OPTIONS: CornerSpec[] = [
  { id: 'eye-round', label: 'Round eye', square: 'extra-rounded', dot: 'extra-rounded' },
  { id: 'sq-sq', label: 'Square', square: 'square', dot: 'square' },
  { id: 'eye-dot', label: 'Round dotted', square: 'extra-rounded', dot: 'dot' },
  { id: 'sq-extra', label: 'Square dotted', square: 'square', dot: 'extra-rounded' },
  { id: 'eye-sq', label: 'Round square', square: 'extra-rounded', dot: 'square' },
  { id: 'eye-small', label: 'Round small', square: 'extra-rounded', dot: 'dot' },
  { id: 'sq-dot', label: 'Square dot', square: 'square', dot: 'dot' },
  { id: 'leaf', label: 'Leaf', square: 'classy-rounded', dot: 'classy-rounded' },
  { id: 'classy-d', label: 'Classy D', square: 'classy', dot: 'classy' },
  { id: 'eye-soft', label: 'Soft eye', square: 'rounded', dot: 'rounded' },
  { id: 'classy-left', label: 'Classy left', square: 'classy', dot: 'extra-rounded' },
  { id: 'classy-right', label: 'Classy right', square: 'classy-rounded', dot: 'extra-rounded' },
  { id: 'classy-angle', label: 'Classy angle', square: 'classy', dot: 'square' },
  { id: 'leaf-sq', label: 'Leaf square', square: 'classy-rounded', dot: 'square' },
  { id: 'thick-sq', label: 'Thick square', square: 'rounded', dot: 'square' },
]

export const DESIGN_COUNTS = {
  frames: FRAME_OPTIONS.length,
  restaurants: RESTAURANT_OPTIONS.length,
  logos: 5,
  shapes: SHAPE_OPTIONS.length,
  corners: CORNER_OPTIONS.length,
} as const

/** Compact tile art for a frame option. */
export function FrameSketch({ id, color }: { id: FrameId; color: string }) {
  const c = color
  if (id === 'none') {
    return <span className="text-[18px] leading-none" style={{ color: '#8a9488' }}>⊘</span>
  }
  return (
    <svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
      {id === 'pill' && (
        <>
          <rect x="8" y="4" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="10" y="36" width="20" height="7" rx="3.5" fill={c} />
        </>
      )}
      {id === 'bar' && (
        <>
          <rect x="8" y="4" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="8" y="34" width="24" height="8" fill={c} />
        </>
      )}
      {id === 'caption' && (
        <>
          <rect x="8" y="4" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <text x="20" y="44" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>SCAN ME</text>
        </>
      )}
      {id === 'tag' && (
        <>
          <rect x="8" y="4" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="12" y="34" width="16" height="8" fill={c} />
        </>
      )}
      {id === 'pointer' && (
        <>
          <rect x="8" y="4" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="10" y="34" width="20" height="7" fill={c} />
          <path d="M20 41 L17 45 L23 45 Z" fill={c} />
        </>
      )}
      {id === 'balloon' && (
        <>
          <rect x="11" y="2" width="18" height="7" rx="1" fill={c} />
          <path d="M20 9 L18 12 L22 12 Z" fill={c} />
          <rect x="8" y="12" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'gift' && (
        <>
          <rect x="7" y="10" width="26" height="30" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M20 10 V40 M7 22 H33" stroke={c} strokeWidth="1.6" />
          <path d="M14 10 C14 4 20 4 20 10 C20 4 26 4 26 10" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
      {id === 'polaroid' && (
        <>
          <rect x="8" y="6" width="24" height="28" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M6 12 L6 6 L12 6 M28 6 L34 6 L34 12 M6 36 L6 42 L12 42 M28 42 L34 42 L34 36" fill="none" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'chevron' && (
        <>
          <rect x="8" y="4" width="24" height="26" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M8 30 L20 42 L32 30 Z" fill={c} />
        </>
      )}
      {id === 'ribbon' && (
        <>
          <rect x="8" y="4" width="24" height="26" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M6 30 H34 L30 38 H10 Z" fill={c} />
        </>
      )}
      {id === 'brush' && (
        <>
          <path d="M10 6 L30 8 L28 34 L12 32 Z" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M8 36 L14 34 L18 40 L24 33 L32 38" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {id === 'script' && (
        <>
          <rect x="9" y="4" width="22" height="26" fill="none" stroke={c} strokeWidth="1.4" />
          <text x="20" y="44" textAnchor="middle" fontSize="7" fontStyle="italic" fontFamily="Georgia, serif" fill={c}>Scan me</text>
        </>
      )}
      {id === 'bag' && (
        <>
          <path d="M12 16 H28 L30 42 H10 Z" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M16 16 C16 10 24 10 24 16" fill="none" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'box' && (
        <>
          <rect x="8" y="4" width="24" height="32" fill="none" stroke={c} strokeWidth="2.2" />
          <rect x="8" y="32" width="24" height="10" fill={c} />
        </>
      )}
      {id === 'phone' && (
        <>
          <rect x="10" y="4" width="20" height="40" rx="4" fill="none" stroke={c} strokeWidth="1.8" />
          <circle cx="20" cy="40" r="1.4" fill={c} />
        </>
      )}
      {id === 'arrow' && (
        <>
          <rect x="10" y="6" width="22" height="24" fill="none" stroke={c} strokeWidth="1.4" />
          <path d="M8 36 C8 28 18 28 18 22" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M14 24 L18 20 L20 26" fill={c} />
          <text x="26" y="44" textAnchor="middle" fontSize="6" fontStyle="italic" fill={c}>Scan</text>
        </>
      )}
      {id === 'laptop' && (
        <>
          <rect x="10" y="8" width="20" height="16" fill="none" stroke={c} strokeWidth="1.5" />
          <path d="M6 26 H34 L32 32 H8 Z" fill={c} />
        </>
      )}
      {id === 'beer' && (
        <>
          <rect x="10" y="10" width="16" height="28" rx="2" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M26 16 H32 V28 H26" fill="none" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'coffee' && (
        <>
          <path d="M10 18 H26 V36 C26 40 10 40 10 36 Z" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M26 22 H32 V30 H26" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M14 8 C14 12 18 12 18 8 M20 8 C20 12 24 12 24 8" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
      {id === 'chef' && (
        <>
          <circle cx="20" cy="10" r="7" fill="none" stroke={c} strokeWidth="1.5" />
          <rect x="12" y="18" width="16" height="22" fill="none" stroke={c} strokeWidth="1.5" />
        </>
      )}
      {id === 'scooter' && (
        <>
          <rect x="6" y="8" width="16" height="16" fill="none" stroke={c} strokeWidth="1.4" />
          <circle cx="12" cy="40" r="4" fill="none" stroke={c} strokeWidth="1.4" />
          <circle cx="30" cy="40" r="4" fill="none" stroke={c} strokeWidth="1.4" />
          <path d="M14 24 L28 24 L30 36" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
      {id === 'cloche' && (
        <>
          <path d="M8 28 A12 12 0 0 1 32 28" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="6" y="28" width="28" height="4" fill={c} />
          <circle cx="20" cy="14" r="2" fill={c} />
        </>
      )}
      {id === 'cocktail' && (
        <>
          <path d="M10 8 L30 8 L20 24 Z" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M20 24 V40 M14 40 H26" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'takeout' && (
        <>
          <path d="M10 16 H30 L28 42 H12 Z" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M10 16 L20 8 L30 16" fill="none" stroke={c} strokeWidth="1.6" />
        </>
      )}
      {id === 'menu' && (
        <>
          <rect x="10" y="6" width="20" height="36" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M10 12 Q20 8 30 12" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
      {id === 'badge' && (
        <>
          <rect x="10" y="10" width="20" height="28" rx="2" fill="none" stroke={c} strokeWidth="1.6" />
          <circle cx="20" cy="10" r="3" fill="none" stroke={c} strokeWidth="1.4" />
        </>
      )}
    </svg>
  )
}

export function ShapeSketch({ id }: { id: ShapeId }) {
  const cell = (r: number) => {
    if (id === 'dots') return 'rounded-full'
    if (id === 'rounded' || id === 'extra-rounded') return 'rounded-[3px]'
    if (id === 'classy' || id === 'classy-rounded') return r === 0 ? 'rounded-tl-md' : 'rounded-br-md'
    return ''
  }
  return (
    <div className="cdl-shape-sketch">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`cdl-sketch-cell ${cell(i % 3)}`} />
      ))}
    </div>
  )
}

export function CornerSketch({ spec }: { spec: CornerSpec }) {
  const outer =
    spec.square === 'dot' || spec.square === 'extra-rounded' ? '50%'
      : spec.square === 'rounded' ? '8px'
        : spec.square === 'classy' || spec.square === 'classy-rounded' ? '10px 2px 10px 2px'
          : '2px'
  const inner =
    spec.dot === 'dot' || spec.dot === 'extra-rounded' || spec.dot === 'rounded' ? '50%' : '1px'
  return (
    <div
      className="h-8 w-8 border-4"
      style={{ borderColor: 'var(--forest)', borderRadius: outer }}
    >
      <div
        className="m-[3px] h-[10px] w-[10px]"
        style={{ background: 'var(--forest)', borderRadius: inner }}
      />
    </div>
  )
}

export function RestaurantChrome({ id, color }: { id: FrameId; color: string }) {
  const c = color
  return (
    <svg className="cdl-rest-svg" viewBox="0 0 160 180" fill="none" aria-hidden="true">
      {id === 'laptop' && (
        <>
          <rect x="38" y="28" width="84" height="72" stroke={c} strokeWidth="6" />
          <path d="M18 108 H142 L132 132 H28 Z" fill={c} />
        </>
      )}
      {id === 'beer' && (
        <>
          <rect x="40" y="36" width="64" height="110" rx="8" stroke={c} strokeWidth="6" />
          <path d="M104 52 H128 V110 H104" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'coffee' && (
        <>
          <path d="M36 56 H112 V130 C112 148 36 148 36 130 Z" stroke={c} strokeWidth="6" />
          <path d="M112 72 H136 V112 H112" stroke={c} strokeWidth="6" />
          <path d="M56 28 C56 44 72 44 72 28 M88 28 C88 44 104 44 104 28" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'chef' && (
        <>
          <circle cx="80" cy="32" r="22" stroke={c} strokeWidth="6" />
          <rect x="44" y="56" width="72" height="100" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'scooter' && (
        <>
          <rect x="18" y="28" width="70" height="60" stroke={c} strokeWidth="5" />
          <circle cx="40" cy="154" r="14" stroke={c} strokeWidth="5" />
          <circle cx="124" cy="154" r="14" stroke={c} strokeWidth="5" />
          <path d="M50 92 L118 92 L128 140" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'cloche' && (
        <>
          <path d="M24 108 A56 56 0 0 1 136 108" stroke={c} strokeWidth="6" />
          <rect x="18" y="108" width="124" height="14" fill={c} />
          <circle cx="80" cy="44" r="8" fill={c} />
        </>
      )}
      {id === 'cocktail' && (
        <>
          <path d="M28 24 H132 L80 96 Z" stroke={c} strokeWidth="6" />
          <path d="M80 96 V160 M52 160 H108" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'takeout' && (
        <>
          <path d="M32 56 H128 L118 164 H42 Z" stroke={c} strokeWidth="6" />
          <path d="M32 56 L80 20 L128 56" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'menu' && (
        <>
          <rect x="40" y="16" width="80" height="148" stroke={c} strokeWidth="6" />
          <path d="M40 36 Q80 20 120 36" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'badge' && (
        <>
          <rect x="40" y="36" width="80" height="120" rx="8" stroke={c} strokeWidth="6" />
          <circle cx="80" cy="36" r="10" stroke={c} strokeWidth="5" />
        </>
      )}
    </svg>
  )
}

export function liveFrameClass(frame: FrameId): string {
  if (frame === 'phone') return 'rounded-[28px] border-[10px] p-2'
  if (frame === 'box' || frame === 'bag' || frame === 'gift') return 'rounded-md border-[6px] p-2'
  if (frame === 'brush') return 'rounded-t-md border-[4px] border-b-0 p-2'
  if (RESTAURANT_IDS.has(frame)) return 'cdl-rest-qr'
  return 'p-1'
}
