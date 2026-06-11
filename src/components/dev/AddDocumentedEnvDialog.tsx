import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  createCustomDocRow,
  createOAuthClientPairRows,
  existingEnvKeyNames,
  normalizeApiPrefixForOAuth,
  normalizeEnvKeyName,
  MAX_CUSTOM_DOC_ROWS,
  type CustomDocRow,
  type DocRowScope,
} from '../../lib/dev-documented-env-keys'

export type AddDocumentedEnvDialogProps = {
  open:               boolean
  onClose:            () => void
  /** Current custom rows (for collision checks and max length) */
  customRowsSnapshot: CustomDocRow[]
  /** Appends new row(s) and should persist via parent */
  onCommitRows:       (rows: CustomDocRow[]) => void
}

type AddMode = 'single' | 'oauth'

export default function AddDocumentedEnvDialog({
  open,
  onClose,
  customRowsSnapshot,
  onCommitRows,
}: AddDocumentedEnvDialogProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`

  const [mode, setMode] = useState<AddMode>('single')
  const [addError, setAddError] = useState<string | null>(null)

  const [newKeyRaw, setNewKeyRaw] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newScope, setNewScope] = useState<DocRowScope>('server')
  const [newInputKind, setNewInputKind] = useState<'secret' | 'text'>('secret')

  const [oauthPrefixRaw, setOauthPrefixRaw] = useState('')
  const [oauthPairLabel, setOauthPairLabel] = useState('')
  const [oauthNotes, setOauthNotes] = useState('')
  const [oauthScope, setOauthScope] = useState<DocRowScope>('server')

  const taken = useMemo(() => existingEnvKeyNames(customRowsSnapshot), [customRowsSnapshot])

  const oauthPreview = useMemo(() => {
    const p = normalizeApiPrefixForOAuth(oauthPrefixRaw)
    if (!p) return null
    return { prefix: p, idKey: `${p}_CLIENT_ID`, secKey: `${p}_CLIENT_SECRET` }
  }, [oauthPrefixRaw])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const resetFields = useCallback(() => {
    setAddError(null)
    setNewKeyRaw('')
    setNewDesc('')
    setNewScope('server')
    setNewInputKind('secret')
    setOauthPrefixRaw('')
    setOauthPairLabel('')
    setOauthNotes('')
    setOauthScope('server')
    setMode('single')
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form fields when the dialog opens (`open` is a prop; reset-on-open is intended)
    if (open) resetFields()
  }, [open, resetFields])

  const submit = useCallback(() => {
    setAddError(null)
    const room = MAX_CUSTOM_DOC_ROWS - customRowsSnapshot.length
    if (mode === 'single') {
      if (room < 1) {
        setAddError(`Maximum ${MAX_CUSTOM_DOC_ROWS} custom rows reached. Remove one to add more.`)
        return
      }
      const normalized = normalizeEnvKeyName(newKeyRaw)
      if (!normalized) {
        setAddError('Use upper snake case (e.g. MY_API_KEY). Letters, digits, underscores only.')
        return
      }
      if (taken.has(normalized)) {
        setAddError('That variable name already exists in the table.')
        return
      }
      const row = createCustomDocRow({
        envKey: normalized,
        scope: newScope,
        description: newDesc,
        inputKind: newInputKind,
      })
      if (!row) {
        setAddError('Could not create row — check the variable name.')
        return
      }
      onCommitRows([row])
      onClose()
      return
    }

    if (room < 2) {
      setAddError(`OAuth pairs need 2 rows. Free at least 2 slots (max ${MAX_CUSTOM_DOC_ROWS} custom rows).`)
      return
    }
    const label = oauthPairLabel.trim() || oauthPrefixRaw.trim()
    if (!label) {
      setAddError('Enter an API name (e.g. Tesla Fleet) so keys and labels map correctly.')
      return
    }
    const pair = createOAuthClientPairRows({
      prefix: oauthPrefixRaw,
      scope: oauthScope,
      pairLabel: label,
      notes: oauthNotes,
      takenKeys: taken,
    })
    if (!pair) {
      setAddError(
        'Could not build Client ID / Secret pair. Use letters and numbers in the API name (e.g. Tesla → TESLA), and ensure those env names are not already listed.',
      )
      return
    }
    onCommitRows(pair)
    onClose()
  }, [
    customRowsSnapshot.length,
    mode,
    newDesc,
    newInputKind,
    newKeyRaw,
    newScope,
    oauthNotes,
    oauthPairLabel,
    oauthPrefixRaw,
    oauthScope,
    onClose,
    onCommitRows,
    taken,
  ])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,5,8,0.6)', backdropFilter: 'blur(4px)' }}
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
          Add API credentials
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Saved in this browser only. Names must match what the dev BFF and upstream APIs expect (exact env variable names).
        </p>

        <div className="mt-4 flex rounded-lg p-0.5" style={{ background: 'var(--bg-muted)' }}>
          {(['single', 'oauth'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setAddError(null) }}
              className="flex-1 rounded-md px-3 py-2 text-xs font-semibold transition"
              style={{
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color:      mode === m ? 'var(--text-1)' : 'var(--text-3)',
                boxShadow:  mode === m ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {m === 'single' ? 'Single variable' : 'Client ID + Secret'}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {mode === 'single' ? (
            <>
              <DialogField label="Variable name">
                <input
                  value={newKeyRaw}
                  onChange={e => setNewKeyRaw(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="MY_SERVICE_API_KEY"
                  className="w-full rounded-lg px-3 py-2 font-mono text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <DialogField label="Description">
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="What this key is for…"
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <div className="grid gap-3 sm:grid-cols-2">
                <DialogField label="Scope">
                  <select
                    value={newScope}
                    onChange={e => setNewScope(e.target.value as DocRowScope)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle()}
                  >
                    <option value="server">server</option>
                    <option value="client">client</option>
                  </select>
                </DialogField>
                <DialogField label="Input type">
                  <select
                    value={newInputKind}
                    onChange={e => setNewInputKind(e.target.value as 'secret' | 'text')}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle()}
                  >
                    <option value="secret">Secret (masked)</option>
                    <option value="text">Plain text</option>
                  </select>
                </DialogField>
              </div>
            </>
          ) : (
            <>
              <DialogField label="API name (drives env key names)">
                <input
                  value={oauthPrefixRaw}
                  onChange={e => setOauthPrefixRaw(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. Tesla Fleet, MY_VENDOR"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                />
                <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
                  We normalize this to a prefix like <code style={chipStyle()}>TESLA_FLEET</code> and create two variables with{' '}
                  <strong>exact</strong> suffixes <code style={chipStyle()}>_CLIENT_ID</code> and{' '}
                  <code style={chipStyle()}>_CLIENT_SECRET</code> so your code can read predictable names.
                </p>
              </DialogField>
              {oauthPreview && (
                <div
                  className="rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-2)' }}
                >
                  <div><span style={{ color: 'var(--text-4)' }}>→</span> {oauthPreview.idKey}</div>
                  <div><span style={{ color: 'var(--text-4)' }}>→</span> {oauthPreview.secKey}</div>
                </div>
              )}
              <DialogField label="Display label (shown in Settings)">
                <input
                  value={oauthPairLabel}
                  onChange={e => setOauthPairLabel(e.target.value)}
                  autoComplete="off"
                  placeholder="e.g. Tesla Fleet API"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <DialogField label="Notes (optional)">
                <textarea
                  value={oauthNotes}
                  onChange={e => setOauthNotes(e.target.value)}
                  rows={2}
                  placeholder="Where you registered the app, redirect URI, etc."
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <DialogField label="Scope">
                <select
                  value={oauthScope}
                  onChange={e => setOauthScope(e.target.value as DocRowScope)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                >
                  <option value="server">server</option>
                  <option value="client">client</option>
                </select>
              </DialogField>
            </>
          )}
          {addError && (
            <p className="text-xs" role="alert" style={{ color: 'var(--bad)' }}>{addError}</p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-lg px-4 py-2 text-xs font-medium transition"
            style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition"
            style={{ background: 'var(--accent)' }}
          >
            {mode === 'single' ? 'Add row' : 'Add Client ID + Secret'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</span>
      {children}
    </label>
  )
}

function chipStyle(): React.CSSProperties {
  return {
    fontFamily:  "'DM Mono', monospace",
    fontSize:    11,
    padding:     '1px 5px',
    borderRadius: 4,
    background:  'var(--bg-muted)',
    color:       'var(--text-2)',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-input)',
    border:     '1px solid var(--border)',
    color:      'var(--text-1)',
  }
}
