import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listCategories, listDivisions } from '@/server/services/org'
import { getDocumentMetadata, listUserOptions } from '@/server/services/documents'
import { guard } from '@/lib/page-guard'
import { Flash } from '@/components/Flash'
import { AccessDenied } from '@/components/AccessDenied'
import { DocumentForm } from '@/components/DocumentForm'

export default async function EditDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser()
  const { id } = await params
  const { get } = await sp(searchParams)
  const doc = await guard(() => getDocumentMetadata(user, id))
  if (!doc.ok) return <AccessDenied message={doc.message} />
  if (!doc.data.permissions.canEdit) return <AccessDenied message="Anda tidak dapat mengubah metadata dokumen ini." />
  const [categories, divisions, users] = await Promise.all([listCategories(user, { includeInactive: true }), listDivisions(user), listUserOptions(user)])
  return (
    <>
      <Flash err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Ubah metadata</h1>
          <p>{doc.data.documentName}</p>
        </div>
      </div>
      <DocumentForm action={`/api/documents/${id}`} doc={doc.data} categories={categories} divisions={divisions} users={users} submitLabel="Simpan perubahan" />
    </>
  )
}
