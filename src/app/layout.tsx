import type { Metadata } from 'next'
import '@fontsource-variable/inter'
import 'material-symbols/outlined.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dr. Metz Workspace · CSSE',
  description: 'CSSE Governance Command Center — Dr. Metz Ecosystem',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
