import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { BUTTON_VARIANTS, type ButtonVariant } from '../../lib/design-tokens'

type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: Size
  /** Optional leading icon (any node). */
  leading?: ReactNode
  /** Optional trailing icon (any node). */
  trailing?: ReactNode
  children: ReactNode
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px]',
  md: 'px-3.5 py-2 text-[13px]',
  lg: 'px-4 py-2.5 text-[14px]',
}

/**
 * Single primary Button primitive — replaces the 5 ad-hoc CTA flavors documented in the audit.
 *
 *   <Button variant="primary">Save</Button>
 *   <Button variant="secondary" leading={<Plus className="size-3.5" />}>Add</Button>
 *   <Button variant="destructive">Delete</Button>
 *   <Button variant="ghost">Cancel</Button>
 *
 * Theme-aware via CSS vars set in `lib/design-tokens.ts`.
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  leading,
  trailing,
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  const recipe = BUTTON_VARIANTS[variant]
  const base = recipe.className.replace(/px-3\.5 py-2 text-\[13px\]/, SIZE_CLASSES[size])
  return (
    <button
      {...rest}
      className={`${base} ${className}`}
      style={{ ...recipe.style, ...style }}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
}
