import { updateCategory } from '@/server/services/org'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body, params }) => updateCategory(ctx, params.id, body), {
  onSuccess: '/admin/categories',
  successMessage: (c) => `Kategori ${c.categoryName} disimpan.`,
})
