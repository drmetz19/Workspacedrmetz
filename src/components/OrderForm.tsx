'use client'
import { useState } from 'react'
import { Icon } from './Icon'

interface Row { itemName: string; qty: string; unit: string; note: string }
const blank = (): Row => ({ itemName: '', qty: '', unit: 'pcs', note: '' })

/**
 * Form Surat Pesanan. Dua mode:
 * - public: tanpa login (link rahasia cabang + PIN); dikirim lewat fetch dan menampilkan nomor pesanan.
 * - app: di dalam aplikasi (login); dikirim sebagai form biasa dan diarahkan ke halaman pesanan.
 */
export function OrderForm({ mode, token, branchName, branches, defaultName }: {
  mode: 'public' | 'app'
  token?: string
  branchName?: string
  branches?: { branchId: string; branchName: string }[]
  defaultName?: string
}) {
  const [rows, setRows] = useState<Row[]>([blank()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ poNumber: string } | null>(null)

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const filled = rows.filter((r) => r.itemName.trim() || r.qty)
  const itemsJson = JSON.stringify(filled.map((r) => ({ itemName: r.itemName, qty: r.qty, unit: r.unit, note: r.note })))

  async function submitPublic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(fd.entries()), token, itemsJson }),
      })
      const json = await res.json()
      if (json.status === 'success') {
        setDone({ poNumber: json.data.poNumber })
        window.scrollTo({ top: 0 })
      } else setError(json.message ?? 'Pesanan gagal dikirim.')
    } catch {
      setError('Tidak bisa terhubung. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="doc-icon" style={{ margin: '0 auto 10px' }}><Icon name="check_circle" size={28} /></div>
        <h2>Pesanan terkirim ke PSCM</h2>
        <p className="muted">Simpan atau foto nomor ini. Nomor dipakai saat mencatat barang masuk.</p>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.02em', margin: '14px 0' }}>{done.poNumber}</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => { setDone(null); setRows([blank()]) }}>Buat pesanan lagi</button>
          <a className="btn" href={`/pesan/${token}/terima`}>Catat barang masuk / keluar</a>
        </div>
      </div>
    )
  }

  return (
    <form
      className="card"
      {...(mode === 'public' ? { onSubmit: submitPublic } : { action: '/api/orders', method: 'post' })}
    >
      {error && <div className="flash flash-err" role="alert">{error}</div>}
      <div className="form-grid">
        {mode === 'app' ? (
          <div className="field">
            <label htmlFor="branchId">Untuk cabang</label>
            <select id="branchId" name="branchId" required defaultValue="">
              <option value="" disabled>— Pilih cabang —</option>
              {branches?.map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}
            </select>
          </div>
        ) : (
          <div className="field">
            <label>Cabang</label>
            <input value={branchName ?? ''} readOnly aria-readonly />
          </div>
        )}
        <div className="field">
          <label htmlFor="requesterName">Nama pemesan</label>
          <input id="requesterName" name="requesterName" required minLength={2} defaultValue={defaultName} placeholder="mis. Sari (Apoteker)" />
        </div>
        <div className="field">
          <label htmlFor="requesterContact">No. HP / kontak (opsional)</label>
          <input id="requesterContact" name="requesterContact" inputMode="tel" />
        </div>
        <div className="field">
          <label htmlFor="neededDate">Dibutuhkan paling lambat (opsional)</label>
          <input id="neededDate" name="neededDate" type="date" />
        </div>
      </div>

      <h3 style={{ margin: '8px 0' }}>Barang yang dipesan</h3>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} className="po-row">
            <input aria-label={`Nama barang ${i + 1}`} placeholder="Nama barang" value={r.itemName} onChange={(e) => set(i, { itemName: e.target.value })} />
            <input aria-label={`Jumlah ${i + 1}`} placeholder="Jumlah" inputMode="decimal" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            <input aria-label={`Satuan ${i + 1}`} placeholder="Satuan" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} />
            <input aria-label={`Catatan ${i + 1}`} placeholder="Catatan (opsional)" value={r.note} onChange={(e) => set(i, { note: e.target.value })} />
            <button type="button" className="btn btn-sm btn-icon" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ margin: '10px 0 14px' }}>
        <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, blank()])}><Icon name="add" size={16} /> Tambah barang</button>
      </div>

      <div className="field">
        <label htmlFor="notes">Catatan untuk PSCM (opsional)</label>
        <textarea id="notes" name="notes" placeholder="mis. urgent, stok sisa 2 hari" />
      </div>
      {mode === 'public' && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="pin">PIN cabang</label>
          <input id="pin" name="pin" type="password" required autoComplete="off" inputMode="text" />
          <div className="field-hint">PIN diberikan PSCM kepada cabang.</div>
        </div>
      )}
      <input type="hidden" name="itemsJson" value={itemsJson} readOnly />
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || filled.length === 0}>
          <Icon name="send" /> {busy ? 'Mengirim…' : 'Kirim pesanan'}
        </button>
      </div>
    </form>
  )
}
