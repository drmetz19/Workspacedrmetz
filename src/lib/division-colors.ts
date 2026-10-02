/** Warna per divisi (deterministik dari nama) agar tampilan tidak monoton satu warna navy saja. */
export const DIVISION_TONES = ['navy', 'teal', 'violet', 'rose', 'sky', 'amber'] as const
export type DivisionTone = (typeof DIVISION_TONES)[number]

export function toneForDivision(name: string | null | undefined): DivisionTone {
  if (!name) return 'navy'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return DIVISION_TONES[h % DIVISION_TONES.length]
}
