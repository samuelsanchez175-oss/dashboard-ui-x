import { AlertCircle } from 'lucide-react'

export type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
      style={{ color: 'var(--text-1)' }}
    >
      <AlertCircle className="size-8 shrink-0" style={{ color: 'var(--bad)' }} aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:opacity-95"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-1)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
