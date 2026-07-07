import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  zoneName: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ZoneErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}
        >
          <AlertTriangle size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            {this.props.zoneName} encountered an error
          </p>
          <p className="max-w-sm text-xs" style={{ color: 'var(--text-2)' }}>
            {error.message}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
          }}
        >
          <RotateCcw size={12} />
          Retry
        </button>
      </div>
    )
  }
}
