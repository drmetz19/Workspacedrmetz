'use client'
import { useEffect, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, EXTENSION_TYPES, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, formatBytes } from '@/lib/upload-types'
import { Icon } from './Icon'

type Source = 'upload' | 'link'
type Phase = 'idle' | 'signing' | 'uploading' | 'done' | 'error'

const typeOf = (f: File) => (f.type && ALLOWED_UPLOAD_TYPES[f.type] ? f.type : EXTENSION_TYPES[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? f.type)

/**
 * Sumber berkas dokumen: unggah file (langsung ke penyimpanan CSSE lewat URL sekali pakai) atau tautan Google Drive.
 * Mengisi field form: fileSource, uploadPath, uploadName, externalUrl. Form tidak bisa dikirim saat unggahan berjalan.
 */
export function FileSourceField({ defaultSource, defaultUrl, existingFile }: {
  defaultSource: Source
  defaultUrl?: string | null
  existingFile?: { name: string | null; size: number | null } | null
}) {
  const [source, setSource] = useState<Source>(defaultSource)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null)
  const [path, setPath] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const xhr = useRef<XMLHttpRequest | null>(null)
  const state = useRef({ source, phase, path })
  state.current = { source, phase, path }

  // Cegah form terkirim saat unggahan belum selesai / gagal.
  useEffect(() => {
    const form = root.current?.closest('form')
    if (!form) return
    const onSubmit = (e: SubmitEvent) => {
      const s = state.current
      if (s.source !== 'upload') return
      if (s.phase === 'signing' || s.phase === 'uploading') {
        e.preventDefault()
        setMessage('Tunggu sampai unggahan selesai (100%), lalu simpan lagi.')
      } else if (s.phase === 'error') {
        e.preventDefault()
        setMessage('Unggahan gagal. Pilih berkas lagi, atau ganti ke "Tautan Google Drive".')
      }
    }
    form.addEventListener('submit', onSubmit)
    return () => form.removeEventListener('submit', onSubmit)
  }, [])

  useEffect(() => () => xhr.current?.abort(), [])

  function fail(msg: string) {
    setPhase('error')
    setMessage(msg)
    setPath('')
  }

  async function onPick(file: File | undefined) {
    xhr.current?.abort()
    setPath('')
    setProgress(0)
    setMessage(null)
    if (!file) {
      setPicked(null)
      setPhase('idle')
      return
    }
    setPicked({ name: file.name, size: file.size })
    const mimeType = typeOf(file)
    if (!ALLOWED_UPLOAD_TYPES[mimeType]) return fail(`Jenis berkas tidak didukung. Gunakan: ${[...new Set(Object.values(ALLOWED_UPLOAD_TYPES))].join(', ')}.`)
    if (file.size === 0) return fail('Berkas kosong.')
    if (file.size > MAX_UPLOAD_BYTES) return fail(`Berkas ${formatBytes(file.size)} — maksimal ${formatBytes(MAX_UPLOAD_BYTES)}.`)

    setPhase('signing')
    let signed: { path: string; uploadUrl: string }
    try {
      const res = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType, size: file.size }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || body?.status !== 'success') return fail(body?.message ?? 'Gagal menyiapkan unggahan. Coba lagi.')
      signed = body.data
    } catch {
      return fail('Koneksi terputus saat menyiapkan unggahan. Coba lagi.')
    }

    setPhase('uploading')
    const req = new XMLHttpRequest()
    xhr.current = req
    req.open('PUT', signed.uploadUrl)
    req.setRequestHeader('Content-Type', mimeType)
    req.setRequestHeader('x-upsert', 'false')
    req.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100))
    req.onload = () => {
      if (req.status >= 200 && req.status < 300) {
        setProgress(100)
        setPath(signed.path)
        setPhase('done')
      } else fail(`Unggahan ditolak penyimpanan (kode ${req.status}). Coba lagi.`)
    }
    req.onerror = () => fail('Koneksi terputus saat mengunggah. Coba lagi.')
    req.onabort = () => undefined
    req.send(file)
  }

  const busy = phase === 'signing' || phase === 'uploading'

  return (
    <div className="field" ref={root}>
      <label>Berkas dokumen</label>
      <div className="src-toggle" role="radiogroup" aria-label="Sumber berkas">
        <label className={`src-opt${source === 'upload' ? ' active' : ''}`}>
          <input type="radio" name="fileSource" value="upload" checked={source === 'upload'} onChange={() => setSource('upload')} />
          <Icon name="upload_file" size={17} /> Unggah file
        </label>
        <label className={`src-opt${source === 'link' ? ' active' : ''}`}>
          <input type="radio" name="fileSource" value="link" checked={source === 'link'} onChange={() => setSource('link')} />
          <Icon name="add_link" size={17} /> Tautan Google Drive
        </label>
      </div>

      <div hidden={source !== 'upload'}>
        <input type="hidden" name="uploadPath" value={source === 'upload' ? path : ''} />
        <input type="hidden" name="uploadName" value={source === 'upload' && path ? picked?.name ?? '' : ''} />
        <label className={`upload-drop${busy ? ' busy' : ''}${phase === 'done' ? ' ok' : ''}${phase === 'error' ? ' bad' : ''}`}>
          <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} onChange={(e) => onPick(e.target.files?.[0])} disabled={busy} />
          <Icon name={phase === 'done' ? 'task' : phase === 'error' ? 'error' : 'cloud_upload'} size={22} />
          <span className="upload-text">
            {picked ? <strong>{picked.name}</strong> : <strong>Pilih berkas…</strong>}
            <span className="small muted">
              {picked
                ? `${formatBytes(picked.size)}${phase === 'uploading' ? ` · mengunggah ${progress}%` : phase === 'signing' ? ' · menyiapkan…' : phase === 'done' ? ' · terunggah ✓' : ''}`
                : `PDF, gambar, Word, atau Excel · maks ${formatBytes(MAX_UPLOAD_BYTES)}`}
            </span>
          </span>
        </label>
        {(busy || phase === 'done') && (
          <div className="upload-bar" aria-hidden="true"><span style={{ width: `${phase === 'signing' ? 4 : progress}%` }} /></div>
        )}
        {existingFile?.name && !picked && (
          <div className="field-hint">Berkas saat ini: <strong>{existingFile.name}</strong>{existingFile.size ? ` (${formatBytes(existingFile.size)})` : ''}. Pilih berkas baru untuk mengganti.</div>
        )}
        <div className="field-hint">Berkas disimpan privat di CSSE dan hanya bisa dibuka lewat CSSE oleh yang berwenang — setiap pembukaan dicatat di audit.</div>
        {message && <div className="field-error" role="alert">{message}</div>}
      </div>

      <div hidden={source !== 'link'}>
        <input id="externalUrl" name="externalUrl" defaultValue={defaultUrl ?? ''} placeholder="https://drive.google.com/file/d/… atau …/drive/folders/…" aria-label="Tautan Google Drive" />
        <div className="field-hint">File tetap berada di Google Drive. Siapa yang bisa membuka file diatur dari tombol &ldquo;Bagikan&rdquo; di Drive — untuk L3–5 bagikan hanya ke orang yang berwenang.</div>
      </div>
    </div>
  )
}
