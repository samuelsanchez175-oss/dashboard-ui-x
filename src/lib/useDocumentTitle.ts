import { useEffect } from 'react'

export function useDocumentTitle(title: string, suffix = 'UI Dashboard x') {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · ${suffix}` : suffix
    return () => {
      document.title = prev
    }
  }, [title, suffix])
}
