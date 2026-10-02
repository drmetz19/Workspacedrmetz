import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDivisions } from '@/server/services/org'
import { listUserOptions } from '@/server/services/documents'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'

export default async function NewMeetingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [divisions, users] = await Promise.all([listDivisions(user), listUserOptions(user)])
  const visibleDivisions = user.roleId === 'DIVISION_USER' ? divisions.filter((d) => d.divisionId === user.divisionId) : divisions
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Buat Notulensi Rapat Baru</h1>
          <p>Catat hasil rapat divisi beserta tindak lanjutnya. Nomor PIC dan tenggat dapat ditambah di halaman detail.</p>
        </div>
      </div>
      <form action="/api/meetings" method="post" className="card">
        <div className="field">
          <label htmlFor="title">Judul rapat</label>
          <input id="title" name="title" required minLength={3} placeholder="mis. Rapat Koordinasi Evaluasi Operasional & Izin Klinik Q1" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="divisionId">Divisi</label>
            <select id="divisionId" name="divisionId" required defaultValue={visibleDivisions.length === 1 ? visibleDivisions[0].divisionId : ''}>
              <option value="">— Pilih —</option>
              {visibleDivisions.map((d) => <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="meetingDate">Tanggal rapat</label>
            <input id="meetingDate" name="meetingDate" type="date" required defaultValue={today} />
          </div>
          <div className="field">
            <label htmlFor="meetingType">Jenis rapat</label>
            <select id="meetingType" name="meetingType" defaultValue="INTERNAL">
              <option value="INTERNAL">Internal</option>
              <option value="EKSTERNAL">Eksternal</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status notula</label>
            <select id="status" name="status" defaultValue="DISAHKAN">
              <option value="DISAHKAN">Disahkan</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="picUserId">Penanggung jawab notula</label>
            <select id="picUserId" name="picUserId" defaultValue="">
              <option value="">— Belum ditentukan —</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="attendees">Peserta rapat</label>
          <input id="attendees" name="attendees" placeholder="Pisahkan dengan koma, mis. dr. Wijaya, Dokter & Staff Manajemen" />
          <div className="field-hint">Nama bebas (tidak harus user CSSE), dipisah koma.</div>
        </div>
        <div className="field">
          <label htmlFor="summary">Ringkasan pembahasan</label>
          <textarea id="summary" name="summary" required minLength={3} rows={5} placeholder="Poin utama pembahasan, keputusan, dan konteks penting." />
        </div>
        <div className="field">
          <label htmlFor="driveUrl">Tautan Drive PDF notulensi (opsional)</label>
          <input id="driveUrl" name="driveUrl" placeholder="https://drive.google.com/file/d/…" />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit"><Icon name="save" /> Simpan Notulensi</button>
        </div>
      </form>
    </>
  )
}
