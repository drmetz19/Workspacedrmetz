'use client'
import { useState } from 'react'

const NEW = '__new__'

/** Pilih kategori, atau ketik kategori baru langsung saat mendaftar (dibuat otomatis bila belum ada). */
export function CategoryField({ categories, defaultValue, hint }: {
  categories: { categoryId: string; categoryName: string }[]
  defaultValue?: string
  hint?: React.ReactNode
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const isNew = value === NEW
  return (
    <div className="field">
      <label htmlFor="categoryId">Kategori</label>
      {/* Saat "kategori baru", select tidak dikirim; yang dikirim newCategoryName. */}
      <select id="categoryId" name={isNew ? undefined : 'categoryId'} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">— Pilih —</option>
        {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
        <option value={NEW}>+ Kategori baru…</option>
      </select>
      {isNew && (
        <input name="newCategoryName" required minLength={2} maxLength={80} placeholder="Nama kategori baru, mis. Dokumen Bea Cukai" aria-label="Nama kategori baru" style={{ marginTop: 6 }} autoFocus />
      )}
      {hint}
    </div>
  )
}
