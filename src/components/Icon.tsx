/** Ikon Material Symbols (sesuai mockup Stitch). Dekoratif — teks label tetap ada di sebelahnya. */
export function Icon({ name, size, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span className={`icon ${className}`} aria-hidden="true" style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  )
}
