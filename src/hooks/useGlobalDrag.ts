import { useEffect, useState } from 'react'

export interface DragState {
  /** True while an OS file is being dragged anywhere over the window. */
  dragging: boolean
  /** Best-effort mime of the dragged file (may be '' until drop on some browsers). */
  mime: string
}

/**
 * Window-level file-drag detector. Lets tool tiles / sidebar tabs highlight
 * themselves as eligible drop targets while a matching file is in flight.
 */
export function useGlobalDrag(): DragState {
  const [state, setState] = useState<DragState>({ dragging: false, mime: '' })

  useEffect(() => {
    let depth = 0
    const isFile = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const mimeOf = (e: DragEvent) => {
      const it = e.dataTransfer?.items?.[0]
      return it && it.kind === 'file' ? it.type : ''
    }

    const onEnter = (e: DragEvent) => { if (!isFile(e)) return; depth++; setState({ dragging: true, mime: mimeOf(e) }) }
    const onOver  = (e: DragEvent) => { if (isFile(e)) e.preventDefault() }
    const onLeave = (e: DragEvent) => { if (!isFile(e)) return; depth = Math.max(0, depth - 1); if (!depth) setState({ dragging: false, mime: '' }) }
    const onDrop  = () => { depth = 0; setState({ dragging: false, mime: '' }) }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return state
}
