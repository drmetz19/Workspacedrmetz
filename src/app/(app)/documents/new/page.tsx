import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listCategories, listDivisions } from '@/server/services/org'
import { listDocuments, listUserOptions } from '@/server/services/documents'
import { Flash } from '@/components/Flash'
import { DocumentForm } from '@/components/DocumentForm'

export default async function NewDocumentPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [categories, divisions, users, active] = await Promise.all([
    listCategories(user),
    listDivisions(user),
    listUserOptions(user),
    listDocuments(user, { status: 'ACTIVE' }),
  ])
  const renewOf = active.find((d) => d.documentId === get('supersedes')) ?? null
  const allowedDivisions = user.roleId === 'DIVISION_USER' ? divisions.filter((d) => d.divisionId === user.divisionId) : divisions
  return (
    <>
      <Flash err={get('err')} />
      <div className="page-head">
        <div>
          <h1>{renewOf ? 'Perpanjang / versi baru' : 'Daftarkan dokumen'}</h1>
          <p>{renewOf
            ? `Daftarkan versi baru untuk "${renewOf.documentName}" (v${renewOf.version}). Versi lama otomatis ditandai tidak berlaku.`
            : 'Catat dokumen yang sudah ada di Google Drive ke registry CSSE.'}</p>
        </div>
      </div>
      <DocumentForm
        action="/api/documents"
        categories={categories}
        divisions={allowedDivisions}
        users={users}
        replaceable={active}
        submitLabel="Simpan dokumen"
        defaultDivisionId={renewOf?.divisionId ?? user.divisionId}
        defaultSupersedesId={renewOf?.documentId ?? null}
      />
    </>
  )
}
