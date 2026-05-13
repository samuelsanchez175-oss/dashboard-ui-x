import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
      style={{ color: 'var(--text-1)' }}
    >
      {Icon ? (
        <Icon className="size-8 shrink-0" style={{ color: 'var(--text-4)' }} aria-hidden />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <div className="max-w-md text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
