export function AccessDenied({ message, children }: { message?: string; children?: React.ReactNode }) {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>Akses ditolak</h2>
      <p className="muted">{message ?? 'Anda tidak memiliki izin untuk halaman ini.'}</p>
      {children}
    </div>
  )
}
