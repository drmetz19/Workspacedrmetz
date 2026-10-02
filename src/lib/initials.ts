export function initials(name: string) {
  const words = name.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}
