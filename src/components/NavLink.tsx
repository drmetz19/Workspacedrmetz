'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname()
  const active = exact ? path === href : path === href || path.startsWith(href + '/')
  return (
    <Link href={href} className={`nav-link${active ? ' active' : ''}`}>
      {children}
    </Link>
  )
}
