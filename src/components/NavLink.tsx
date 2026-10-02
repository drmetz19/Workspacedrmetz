'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Icon } from './Icon'

export function NavLink({ href, children, exact, icon, count, matchQuery }: {
  href: string
  children: React.ReactNode
  exact?: boolean
  icon?: string
  count?: number
  matchQuery?: boolean
}) {
  const path = usePathname()
  const search = useSearchParams()
  const [base, query] = href.split('?')
  let active = exact ? path === base : path === base || path.startsWith(base + '/')
  if (matchQuery) active = path === base && !!query && search.toString() === query
  else if (!exact && base === '/search' && search.get('divisionId')) active = false
  return (
    <Link href={href} className={`nav-link${active ? ' active' : ''}`}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {!!count && <span className="nav-count">{count}</span>}
    </Link>
  )
}
