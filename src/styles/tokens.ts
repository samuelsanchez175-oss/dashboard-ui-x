// Token constants for TS consumers. Mirrors src/index.css CSS variables.
// Use these when passing tokens through props or inline styles in TS.

export const fontSize = {
  '2xs': 'var(--font-size-2xs)',
  xs:    'var(--font-size-xs)',
  sm:    'var(--font-size-sm)',
  base:  'var(--font-size-base)',
  md:    'var(--font-size-md)',
  lg:    'var(--font-size-lg)',
  xl:    'var(--font-size-xl)',
  '2xl': 'var(--font-size-2xl)',
  display:'var(--font-size-display)',
} as const;

export const fontWeight = {
  regular:  'var(--font-weight-regular)',
  medium:   'var(--font-weight-medium)',
  semibold: 'var(--font-weight-semibold)',
} as const;

export const tracking = {
  tight:   'var(--tracking-tight)',
  normal:  'var(--tracking-normal)',
  wide:    'var(--tracking-wide)',
  section: 'var(--tracking-section)',
} as const;

export const leading = {
  tight:  'var(--leading-tight)',
  snug:   'var(--leading-snug)',
  normal: 'var(--leading-normal)',
} as const;

export const radius = {
  sm:   'var(--radius-sm)',
  md:   'var(--radius-md)',
  lg:   'var(--radius-lg)',
  xl:   'var(--radius-xl)',
  full: 'var(--radius-full)',
} as const;

export const space = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  8: 'var(--space-8)',
  10:'var(--space-10)',
  12:'var(--space-12)',
} as const;

export const iconSize = {
  sm: 16, // size-4 equivalent
  md: 20, // size-5
  lg: 24, // size-6
} as const;
export type IconSize = keyof typeof iconSize;

export const zoneAccent = {
  hazmat:        'var(--zone-hazmat)',
  airBrakes:     'var(--zone-air-brakes)',
  tanker:        'var(--zone-tanker)',
  doubles:       'var(--zone-doubles)',
  tankerHazmat:  'var(--zone-tanker-hazmat)',
  passenger:     'var(--zone-passenger)',
  schoolBus:     'var(--zone-school-bus)',
  combination:   'var(--zone-combination)',
} as const;
export type ZoneAccent = keyof typeof zoneAccent;
