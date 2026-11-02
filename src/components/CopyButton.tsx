'use client'
import { useState } from 'react'
import { Icon } from './Icon'

export function CopyButton({ text, label = 'Salin link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        } catch {
          window.prompt('Salin link ini:', text)
        }
      }}
    >
      <Icon name={done ? 'check' : 'content_copy'} size={15} /> {done ? 'Tersalin' : label}
    </button>
  )
}
