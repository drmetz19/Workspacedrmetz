'use client'
import { useState } from 'react'
import { Icon } from './Icon'
import { fmtQty } from '@/lib/order-labels'

export interface MovementItem { itemId: string; itemName: string; unit: string; qty: number; received: number; sent: number }

/**
 * Catat barang masuk (diterima) / keluar (dikirim) per barang pada satu pesanan.
 * mode=public → fetch ke API publik (butuh token+PIN+nomor SP); mode=app → form biasa ke /api/orders/{id}/movements.
 */
export function MovementForm({ mode, items, poId, poNumber, token, pin, defaultName, onDone }: {
  mode: 'public' | 'app'
  items: MovementItem[]
  poId?: string
  poNumber?: string
  token?: string
  pin?: string
  defaultName?: string
  onDone?: () => void
}) {
  const [direction, setDirection] = useState<'MASUK' | 'KELUAR'>('MASUK')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  const linesJson = JSON.stringify(Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([itemId, v]) => ({ itemId, qty: v })))
  const hasLines = linesJson !== '[]'

  async function submitPublic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/public/orders/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(fd.entries()), token, pin, poNumber, direction, linesJson }),
      })
      const json = await res.json()
      if (json.status === 'success') setOk(true)
      else setError(json.message ?? 'Pencatatan gagal.')
    } catch {
      setError('Tidak bisa terhubung. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (ok) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="doc-icon" style={{ margin: '0 auto 10px' }}><Icon name="check_circle" size={28} /></div>
        <h2>Tercatat</h2>
        <p className="muted">{direction === 'MASUK' ? 'Penerimaan' : 'Pengeluaran'} barang untuk {poNumber} sudah disimpan.</p>
        <button type="button" className="btn btn-primary" onClick={onDone}>Selesai</button>
      </div>
    )
  }

  return (
    <form className="card" {...(mode === 'public' ? { onSubmit: submitPublic } : { action: `/api/orders/${poId}/movements`, method: 'post' })}>
      {error && <div className="flash flash-err" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="direction">Jenis pencatatan</label>
          <select id="direction" name="direction" value={direction} onChange={(e) => setDirection(e.target.value as 'MASUK' | 'KELUAR')}>
            <option value="MASUK">Barang masuk (diterima)</option>
            <option value="KELUAR">Barang keluar (dikirim)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="recordedByName">Nama pencatat</label>
          <input id="recordedByName" name="recordedByName" required minLength={2} defaultValue={defaultName} />
        </div>
        <div className="field">
          <label htmlFor="movedOn">Tanggal</label>
          <input id="movedOn" name="movedOn" type="date" />
          <div className="field-hint">Kosongkan untuk hari ini.</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Barang</th><th>Dipesan</th><th>Sudah diterima</th><th>Sudah dikirim</th><th style={{ width: 130 }}>Jumlah sekarang</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.itemId}>
                <td><strong>{it.itemName}</strong></td>
                <td>{fmtQty(it.qty)} {it.unit}</td>
                <td>{fmtQty(it.received)}</td>
                <td>{fmtQty(it.sent)}</td>
                <td>
                  <input
                    aria-label={`Jumlah ${it.itemName}`} inputMode="decimal" placeholder="0" value={qty[it.itemId] ?? ''}
                    onChange={(e) => setQty((q) => ({ ...q, [it.itemId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="note">Catatan (opsional)</label>
        <textarea id="note" name="note" placeholder="mis. 1 box penyok, dikirim via ekspedisi X" />
      </div>
      <input type="hidden" name="linesJson" value={linesJson} readOnly />
      <button className="btn btn-primary" type="submit" disabled={busy || !hasLines}>
        <Icon name="inventory_2" /> {busy ? 'Menyimpan…' : 'Simpan pencatatan'}
      </button>
    </form>
  )
}
