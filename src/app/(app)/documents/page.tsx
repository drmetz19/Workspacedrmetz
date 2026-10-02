import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDocuments } from '@/server/services/documents'
import { Flash } from '@/components/Flash'
import { DocumentTable } from '@/components/DocumentTable'

const TABS = [
  { key: 'all', label: 'Semua aktif' },
  { key: 'mine', label: 'Saya PIC' },
  { key: 'division', label: 'Divisi saya' },
  { key: 'inactive', label: 'Arsip & versi lama' },
] as const

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const tab = (TABS.find((t) => t.key === get('tab'))?.key ?? 'all') as (typeof TABS)[number]['key']
  const docs = await listDocuments(user, {
    status: tab === 'inactive' ? 'INACTIVE' : 'ACTIVE',
    scope: tab === 'mine' ? 'mine' : tab === 'division' ? 'division' : 'all',
  })
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Dokumen</h1>
          <p>Registry dokumen yang boleh Anda ketahui.</p>
        </div>
        <Link className="btn btn-primary" href="/documents/new">+ Daftarkan dokumen</Link>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/documents?tab=${t.key}`} className={`btn btn-sm${t.key === tab ? ' btn-primary' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <div className="card">
        <DocumentTable docs={docs} empty={tab === 'inactive' ? 'Tidak ada arsip atau versi lama.' : 'Belum ada dokumen di sini.'} />
      </div>
    </>
  )
}
