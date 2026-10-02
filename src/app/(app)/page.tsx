import { requireUser, sp, type SearchParams } from '@/lib/session'
import { Flash } from '@/components/Flash'
import { ROLE_LABEL } from '@/lib/labels'

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Command Center</h1>
          <p>Selamat datang, {user.name} — {ROLE_LABEL[user.roleId]}.</p>
        </div>
      </div>
      <div className="card">
        <p className="muted">Ringkasan pekerjaan akan tampil di sini.</p>
      </div>
    </>
  )
}
