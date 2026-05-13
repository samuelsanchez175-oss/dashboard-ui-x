export type LoadingStateProps = {
  label?: string
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 px-4 py-8"
      style={{ color: 'var(--text-3)' }}
    >
      <span
        className="inline-block size-7 shrink-0 animate-spin rounded-full border-2 border-solid"
        style={{
          borderColor: 'var(--border-soft)',
          borderTopColor: 'var(--accent)',
        }}
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}
