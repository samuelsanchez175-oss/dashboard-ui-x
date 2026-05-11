/**
 * Derived from the same heuristic as `rhyming-part`:
 * rhyme key = tonic-stressed nucleus through end of pronunciation (ARPAbet tokens).
 */

export function arpabetRhymeKey(pronunciation: string): string {
  const stresses = pronunciation.trim().split(/\s+/).filter(Boolean)
  for (let i = stresses.length - 1; i >= 0; i--) {
    if (/\d/.test(stresses[i])) {
      return stresses.slice(i).join(' ')
    }
  }
  return ''
}
