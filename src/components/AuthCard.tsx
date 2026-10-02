import { Icon } from './Icon'

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand">
          <span className="brand-logo"><Icon name="clinical_notes" size={19} /></span>
          <span>
            <div className="brand-mark">Dr. Metz Workspace</div>
            <div className="brand-sub">CSSE Governance Command Center</div>
          </span>
        </div>
        <h2 style={{ textAlign: 'center' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
