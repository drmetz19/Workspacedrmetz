export function initials(name: string) {
  const words = name.replace(/^(dr|drg|ir|h)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}
