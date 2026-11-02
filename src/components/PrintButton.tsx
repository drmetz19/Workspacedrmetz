'use client'
import { Icon } from './Icon'

export function PrintButton({ label = 'Cetak / simpan PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <Icon name="print" /> {label}
    </button>
  )
}
