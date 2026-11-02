import type { Metadata } from 'next'
import { Icon } from '@/components/Icon'

export const metadata: Metadata = {
  title: 'Surat Pesanan · Dr. Metz',
  robots: { index: false, follow: false },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-wrap">
      <div className="public-col">
        <div className="brand" style={{ marginBottom: 16 }}>
          <span className="brand-logo"><Icon name="clinical_notes" size={19} /></span>
          <span>
            <div className="brand-mark">Dr. Metz Workspace</div>
            <div className="brand-sub">Pemesanan Barang · PSCM</div>
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
