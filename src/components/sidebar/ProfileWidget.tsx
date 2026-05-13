import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { MoreHorizontal } from 'lucide-react'
import { ProfileSettingsModal } from './SettingsLeadsTable'

export default function ProfileWidget() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors duration-150 cursor-pointer text-left"
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-soft)' }}
        >
          <span
            className="text-[11px] font-semibold tracking-tight"
            style={{ fontFamily: "'DM Mono', monospace", color: 'var(--accent-fg)' }}
          >
            SS
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-semibold leading-tight truncate"
            style={{ color: 'var(--text-1)' }}
          >
            Samuel
          </p>
          <p
            className="text-[11px] leading-tight mt-0.5"
            style={{ color: 'var(--text-4)' }}
          >
            Settings
          </p>
        </div>

        <MoreHorizontal size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </button>

      <AnimatePresence>
        {settingsOpen && (
          <ProfileSettingsModal key="settings" onClose={() => setSettingsOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
