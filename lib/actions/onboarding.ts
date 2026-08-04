'use server'
import '@/lib/validation/zod-config'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { ActionResult } from './types'

const schema = z.object({
  initialBalance: z.coerce
    .number()
    .positive('Debe ser un monto positivo')
    .max(100_000_000, 'El monto no puede superar $100,000,000'),
})

export async function completeOnboarding(formData: FormData): Promise<ActionResult<null>> {
  const user = await requireUser()
  const parsed = schema.safeParse({ initialBalance: formData.get('initialBalance') })
  if (!parsed.success) {
    return { ok: false, error: 'Revisa el monto', fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }
  const db = getDb()
  await db.update(users).set({ initialBalance: parsed.data.initialBalance }).where(eq(users.id, user.id))
  redirect('/dashboard')
}
