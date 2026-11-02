'use client'
import { useState } from 'react'
import { Icon } from './Icon'
import { MovementForm, type MovementItem } from './MovementForm'

interface Found { poNumber: string; branchName: string; requesterName: string; items: MovementItem[] }

/** Langkah 1: nomor SP + PIN → cari pesanan. Langkah 2: catat barang masuk/keluar. Tanpa login. */
export function PublicReceive({ token, branchName }: { token: string; branchName: string }) {
  const [poNumber, setPoNumber] = useState('')
  const [pin, setPin] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/public/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, pin, poNumber }),
      })
      const json = await res.json()
      if (json.status === 'success') setFound(json.data)
      else setError(json.message ?? 'Pesanan tidak ditemukan.')
    } catch {
      setError('Tidak bisa terhubung. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (found) {
    return (
      <>
        <div className="card">
          <strong>{found.poNumber}</strong> · {branchName}
          <div className="small muted">Pemesan: {found.requesterName}</div>
        </div>
        <MovementForm
          mode="public" items={found.items} token={token} pin={pin} poNumber={found.poNumber}
          onDone={() => { setFound(null); setPoNumber('') }}
        />
      </>
    )
  }

  return (
    <form className="card" onSubmit={lookup}>
      {error && <div className="flash flash-err" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="poNumber">Nomor Surat Pesanan</label>
        <input id="poNumber" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required placeholder="mis. SP/BHY/2026/0001" autoCapitalize="characters" />
      </div>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="pin">PIN cabang</label>
        <input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="off" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}><Icon name="search" /> {busy ? 'Mencari…' : 'Cari pesanan'}</button>
    </form>
  )
}
