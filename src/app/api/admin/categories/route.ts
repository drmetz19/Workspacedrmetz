import { createCategory } from '@/server/services/org'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body }) => createCategory(ctx, body), {
  onSuccess: '/admin/categories',
  successMessage: (c) => `Kategori ${c.categoryName} dibuat.`,
})
