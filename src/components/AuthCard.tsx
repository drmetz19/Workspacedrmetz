export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand">
          <div className="brand-mark">Dr. Metz Workspace</div>
          <div className="brand-sub">CSSE · Dokumen</div>
        </div>
        <h2 style={{ textAlign: 'center' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
