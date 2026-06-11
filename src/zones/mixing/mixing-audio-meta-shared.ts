import type { MixClipMeta } from './mixing-audio-idb'

/** Infer major/minor from common tag strings like "F# Minor", "Db Major", "Em". */
export function deriveScaleFromKey(keyText: string | null): string | null {
  if (!keyText?.trim()) return null
  const k = keyText.trim()
  if (/\bmin(or)?\b/i.test(k) || /\bm$/i.test(k.replace(/\s/g, ''))) return 'minor'
  if (/\bmaj(or)?\b/i.test(k) || /\bM$/i.test(k.replace(/\s/g, ''))) return 'major'
  const sharpMinor = /^[A-G](#|b)?m$/i.test(k.replace(/\s/g, ''))
  if (sharpMinor) return 'minor'
  return null
}

export function suggestRapKeyTip(key: string | null, scale: string | null, bpm: number | null): string {
  const tempo =
    bpm == null
      ? ''
      : bpm < 92
        ? 'Tempo feels slow—stretch vowels and lean on pauses.'
        : bpm > 138
          ? 'Fast pocket—tight phrases and consonants stay readable.'
          : 'Mid tempo—balanced pocket for swung hats and turnarounds.'

  if (!key && !scale) {
    return [tempo, 'Run a local scan on the clip or paste external analyzer output when tags are empty.'].filter(Boolean).join(' ')
  }

  const s = scale ?? deriveScaleFromKey(key)
  const keyLine =
    s === 'minor'
      ? 'Suggested rap color: stay grounded on i and ♭III hooks; lift bridges toward ♭VII for tension.'
      : s === 'major'
        ? 'Suggested rap color: bounce on I–IV–vi motions; borrow parallel minor on verses for grit.'
        : key
          ? `Center melodies around ${key}; outline chord tones on downbeats.`
          : 'Outline chord tones on downbeats and keep fills short.'

  return [tempo, keyLine].filter(Boolean).join(' ')
}

/** Pull BPM / key / Camelot-ish hints from pasted Tunebat or analyzer page text. */
export function parseTunebatPaste(raw: string): { bpm: number | null; key: string | null; scale: string | null } {
  const text = raw.replace(/\u00a0/g, ' ')
  let bpm: number | null = null
  let key: string | null = null

  const bpmM =
    text.match(/\bBPM\b\s*[:\u2013-]\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/\bBeats\s+per\s+minute\b\s*[:\u2013-]\s*(\d+)/i)
  if (bpmM?.[1]) {
    const n = Math.round(Number(bpmM[1]))
    if (n >= 40 && n <= 240) bpm = n
  }

  const keyM =
    text.match(/\bInitial\s+Key\b\s*[:\u2013-]\s*([^\n\r]+)/i) ??
    text.match(/\bKey\b\s*[:\u2013-]\s*([^\n\r]+)/i)
  if (keyM?.[1]) {
    key = keyM[1].split('|')[0]?.trim()?.slice(0, 48) ?? null
    if (key?.length === 0) key = null
  }

  const camelotM = text.match(/\bCamelot\b\s*[:\u2013-]\s*(\d{1,2}[AB])\b/i)
  const camelot = camelotM?.[1] ?? null

  if (camelot) {
    key = key ? `${key} · Camelot ${camelot}` : `Camelot ${camelot}`
  }

  const scale = deriveScaleFromKey(key)

  return { bpm, key, scale }
}

export function mergeTunebatPaste(existing: MixClipMeta | undefined, paste: string): MixClipMeta {
  const parsed = parseTunebatPaste(paste)
  const key = parsed.key ?? existing?.key ?? null
  const bpm = parsed.bpm ?? existing?.bpm ?? null
  const scale = parsed.scale ?? existing?.scale ?? deriveScaleFromKey(key)
  const analyzedAt = Date.now()
  return {
    bpm,
    key,
    scale,
    rapKeyTip: suggestRapKeyTip(key, scale, bpm),
    source: 'tunebat',
    analyzedAt,
  }
}
