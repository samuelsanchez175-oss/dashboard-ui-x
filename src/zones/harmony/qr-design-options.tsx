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
  { id: 'none', label: 'No frame' },
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

export const RESTAURANT_IDS = new Set<FrameId>(
  RESTAURANT_OPTIONS.map(o => o.id).filter((id): id is FrameId => id !== 'none'),
)

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

/** QR window inside the 160×200 restaurant silhouette. */
export const REST_SLOTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  laptop:   { x: 40, y: 28, w: 80, h: 72 },
  beer:     { x: 46, y: 58, w: 52, h: 52 },
  coffee:   { x: 45, y: 70, w: 54, h: 54 },
  chef:     { x: 50, y: 70, w: 60, h: 60 },
  scooter:  { x: 22, y: 30, w: 62, h: 54 },
  cloche:   { x: 50, y: 82, w: 60, h: 50 },
  cocktail: { x: 58, y: 32, w: 44, h: 44 },
  takeout:  { x: 50, y: 70, w: 60, h: 60 },
  menu:     { x: 50, y: 60, w: 60, h: 60 },
  badge:    { x: 50, y: 68, w: 60, h: 60 },
}

export function RestaurantChrome({ id, color }: { id: FrameId; color: string }) {
  const c = color
  const slot = REST_SLOTS[id]
  return (
    <svg className="cdl-rest-svg" viewBox="0 0 160 200" fill="none" aria-hidden="true">
      {slot ? (
        <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill="white" />
      ) : null}
      {id === 'laptop' && (
        <>
          <rect x="36" y="24" width="88" height="80" stroke={c} strokeWidth="6" />
          <path d="M16 112 H144 L134 140 H26 Z" fill={c} />
        </>
      )}
      {id === 'beer' && (
        <>
          <rect x="40" y="36" width="64" height="120" rx="8" stroke={c} strokeWidth="6" />
          <path d="M104 54 H132 V118 H104" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'coffee' && (
        <>
          <path d="M36 54 H110 V138 C110 156 36 156 36 138 Z" stroke={c} strokeWidth="6" />
          <path d="M110 70 H138 V118 H110" stroke={c} strokeWidth="6" />
          <path d="M54 24 C54 42 70 42 70 24 M86 24 C86 42 102 42 102 24" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'chef' && (
        <>
          <circle cx="80" cy="32" r="22" stroke={c} strokeWidth="6" />
          <rect x="44" y="54" width="72" height="112" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'scooter' && (
        <>
          <rect x="18" y="26" width="70" height="62" stroke={c} strokeWidth="5" />
          <circle cx="40" cy="168" r="16" stroke={c} strokeWidth="5" />
          <circle cx="124" cy="168" r="16" stroke={c} strokeWidth="5" />
          <path d="M50 92 L118 92 L130 154" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'cloche' && (
        <>
          <path d="M24 120 A56 56 0 0 1 136 120" stroke={c} strokeWidth="6" />
          <rect x="18" y="120" width="124" height="14" fill={c} />
          <circle cx="80" cy="56" r="8" fill={c} />
        </>
      )}
      {id === 'cocktail' && (
        <>
          <path d="M28 22 H132 L80 92 Z" stroke={c} strokeWidth="6" />
          <path d="M80 92 V176 M50 176 H110" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'takeout' && (
        <>
          <path d="M34 54 H126 L116 176 H44 Z" stroke={c} strokeWidth="6" />
          <path d="M34 54 L80 18 L126 54" stroke={c} strokeWidth="6" />
        </>
      )}
      {id === 'menu' && (
        <>
          <rect x="42" y="20" width="76" height="160" stroke={c} strokeWidth="6" />
          <path d="M42 40 Q80 22 118 40" stroke={c} strokeWidth="5" />
        </>
      )}
      {id === 'badge' && (
        <>
          <rect x="42" y="42" width="76" height="128" rx="8" stroke={c} strokeWidth="6" />
          <circle cx="80" cy="42" r="11" stroke={c} strokeWidth="5" />
        </>
      )}
    </svg>
  )
}

/** QR window inside the 200×270 frame chrome. Square-ish so the code stays scannable. */
export const FRAME_SLOTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  pill:     { x: 34, y: 22, w: 132, h: 132 },
  bar:      { x: 32, y: 18, w: 136, h: 136 },
  caption:  { x: 38, y: 28, w: 124, h: 124 },
  tag:      { x: 38, y: 16, w: 124, h: 124 },
  pointer:  { x: 40, y: 26, w: 120, h: 120 },
  balloon:  { x: 40, y: 56, w: 120, h: 120 },
  gift:     { x: 42, y: 74, w: 116, h: 108 },
  polaroid: { x: 36, y: 24, w: 128, h: 128 },
  chevron:  { x: 36, y: 16, w: 128, h: 128 },
  ribbon:   { x: 40, y: 16, w: 120, h: 120 },
  brush:    { x: 42, y: 28, w: 116, h: 116 },
  script:   { x: 38, y: 22, w: 124, h: 124 },
  bag:      { x: 46, y: 62, w: 108, h: 108 },
  box:      { x: 36, y: 18, w: 128, h: 128 },
  phone:    { x: 44, y: 70, w: 112, h: 112 },
  arrow:    { x: 50, y: 18, w: 116, h: 116 },
}

function FrameLabel({
  x,
  y,
  text,
  fill,
  size = 13,
  italic = false,
  weight = 800,
}: {
  x: number
  y: number
  text: string
  fill: string
  size?: number
  italic?: boolean
  weight?: number
}) {
  const t = (text || 'SCAN ME').slice(0, 18)
  const fontSize = t.length > 12 ? Math.max(9, size - 3) : t.length > 8 ? size - 1 : size
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={fill}
      fontSize={fontSize}
      fontWeight={weight}
      fontStyle={italic ? 'italic' : undefined}
      fontFamily={italic ? 'Georgia, "Times New Roman", serif' : 'Outfit, system-ui, sans-serif'}
      letterSpacing={italic ? '0' : '0.08em'}
    >
      {t}
    </text>
  )
}

/** Live wrapping chrome for PDF-style frames. Each id is a different silhouette. */
export function FrameChrome({ id, color, text }: { id: FrameId; color: string; text: string }) {
  const c = color
  const slot = FRAME_SLOTS[id]
  const label = text || 'SCAN ME'
  return (
    <svg className="cdl-frame-svg" viewBox="0 0 200 270" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {slot ? <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill="#fff" /> : null}

      {id === 'pill' && (
        <>
          <rect x="24" y="12" width="152" height="152" rx="28" stroke={c} strokeWidth="10" />
          <rect x="48" y="150" width="104" height="38" rx="19" fill={c} />
          <FrameLabel x={100} y={175} text={label} fill="#fff" size={12} />
        </>
      )}

      {id === 'bar' && (
        <>
          <rect x="22" y="12" width="156" height="156" stroke={c} strokeWidth="10" />
          <rect x="22" y="158" width="156" height="44" fill={c} />
          <FrameLabel x={100} y={186} text={label} fill="#fff" size={13} />
        </>
      )}

      {id === 'caption' && (
        <>
          <path d="M32 58 V22 H68" stroke={c} strokeWidth="8" strokeLinecap="square" />
          <path d="M168 58 V22 H132" stroke={c} strokeWidth="8" strokeLinecap="square" />
          <path d="M32 122 V158 H68" stroke={c} strokeWidth="8" strokeLinecap="square" />
          <path d="M168 122 V158 H132" stroke={c} strokeWidth="8" strokeLinecap="square" />
          <rect x="36" y="176" width="128" height="40" rx="2" stroke={c} strokeWidth="2.5" />
          <FrameLabel x={100} y={201} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'tag' && (
        <>
          <rect x="28" y="8" width="144" height="144" stroke={c} strokeWidth="8" />
          <path d="M64 152 H136 L136 214 L100 246 L64 214 Z" fill={c} />
          <circle cx="100" cy="172" r="7" fill="#fff" />
          <FrameLabel x={100} y={210} text={label} fill="#fff" size={11} />
        </>
      )}

      {id === 'pointer' && (
        <>
          <path
            d="M36 16 H164 Q180 16 180 32 V148 Q180 164 164 164 H118 L100 230 L82 164 H36 Q20 164 20 148 V32 Q20 16 36 16 Z"
            stroke={c}
            strokeWidth="8"
            fill="none"
          />
          <path d="M86 164 L100 214 L114 164 Z" fill={c} />
          <FrameLabel x={100} y={252} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'balloon' && (
        <>
          <path d="M100 8 C100 8 118 28 100 42 C82 28 100 8 100 8 Z" fill={c} />
          <rect x="28" y="42" width="144" height="148" rx="36" stroke={c} strokeWidth="8" />
          <path d="M92 42 L100 28 L108 42" fill={c} />
          <FrameLabel x={100} y={220} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'gift' && (
        <>
          <path d="M62 42 C54 8 90 6 100 34 C110 6 146 8 138 42" stroke={c} strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="100" cy="44" rx="14" ry="11" fill={c} />
          <rect x="28" y="52" width="144" height="148" stroke={c} strokeWidth="8" />
          <rect x="28" y="52" width="144" height="16" fill={c} />
          <rect x="28" y="114" width="12" height="16" fill={c} />
          <rect x="160" y="114" width="12" height="16" fill={c} />
          <rect x="92" y="184" width="16" height="16" fill={c} />
          <FrameLabel x={100} y={230} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'polaroid' && (
        <>
          <rect x="22" y="12" width="156" height="200" stroke={c} strokeWidth="8" />
          <rect x="34" y="22" width="132" height="132" stroke={c} strokeWidth="3" />
          <path d="M8 36 L8 8 L36 8" stroke={c} strokeWidth="6" />
          <path d="M164 8 L192 8 L192 36" stroke={c} strokeWidth="6" />
          <path d="M8 188 L8 220 L36 220" stroke={c} strokeWidth="6" />
          <path d="M164 220 L192 220 L192 188" stroke={c} strokeWidth="6" />
          <FrameLabel x={100} y={196} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'chevron' && (
        <>
          <rect x="26" y="8" width="148" height="148" stroke={c} strokeWidth="8" />
          <path d="M26 156 L100 262 L174 156 Z" fill={c} />
          <FrameLabel x={100} y={196} text={label} fill="#fff" size={12} />
        </>
      )}

      {id === 'ribbon' && (
        <>
          <rect x="32" y="8" width="136" height="140" stroke={c} strokeWidth="8" />
          <path d="M6 148 H194 L176 188 L194 228 H6 L24 188 Z" fill={c} />
          <path d="M6 148 L24 188 L6 228" fill="#000" fillOpacity="0.18" />
          <path d="M194 148 L176 188 L194 228" fill="#000" fillOpacity="0.18" />
          <FrameLabel x={100} y={194} text={label} fill="#fff" size={12} />
        </>
      )}

      {id === 'brush' && (
        <>
          <path
            d="M48 14 C22 18 14 48 20 84 C12 122 26 156 54 168 C78 182 126 180 152 166 C180 152 190 114 182 78 C192 44 168 12 140 10 C108 6 74 8 48 14 Z"
            stroke={c}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path d="M28 188 C48 176 70 202 96 186 C118 174 138 200 172 182" stroke={c} strokeWidth="10" strokeLinecap="round" />
          <FrameLabel x={100} y={232} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'script' && (
        <>
          <rect x="30" y="14" width="140" height="140" rx="10" stroke={c} strokeWidth="3" />
          <rect x="36" y="20" width="128" height="128" rx="6" stroke={c} strokeWidth="2" />
          <FrameLabel x={100} y={196} text={label} fill={c} size={16} italic />
        </>
      )}

      {id === 'bag' && (
        <>
          <path d="M70 48 C70 22 130 22 130 48" stroke={c} strokeWidth="8" strokeLinecap="round" />
          <path d="M42 48 H158 L172 230 H28 Z" stroke={c} strokeWidth="8" strokeLinejoin="round" />
          <FrameLabel x={100} y={258} text={label} fill={c} size={12} />
        </>
      )}

      {id === 'box' && (
        <>
          <rect x="22" y="8" width="156" height="176" stroke={c} strokeWidth="14" />
          <rect x="34" y="20" width="132" height="132" stroke={c} strokeWidth="3" />
          <rect x="22" y="160" width="156" height="48" fill={c} />
          <FrameLabel x={100} y={190} text={label} fill="#fff" size={13} />
        </>
      )}

      {id === 'phone' && (
        <>
          <rect x="32" y="8" width="136" height="246" rx="22" stroke={c} strokeWidth="10" />
          <rect x="86" y="20" width="28" height="8" rx="4" fill={c} />
          <circle cx="100" cy="232" r="8" stroke={c} strokeWidth="4" />
          <FrameLabel x={100} y={266} text={label} fill={c} size={11} />
        </>
      )}

      {id === 'arrow' && (
        <>
          <rect x="44" y="12" width="128" height="128" stroke={c} strokeWidth="5" />
          <path
            d="M28 230 C28 190 28 160 52 148 C70 140 78 126 78 108"
            stroke={c}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M64 118 L80 92 L96 118 Z" fill={c} />
          <FrameLabel x={130} y={196} text={label} fill={c} size={14} italic />
        </>
      )}
    </svg>
  )
}
