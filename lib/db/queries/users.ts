import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { users, type DbUser } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'

/**
 * Reconexión de historial (ronda 17): cuando un correo que ya fue estudiante
 * vuelve a entrar con un clerkId NUEVO, su fila vieja se re-vincula en vez de
 * crear un duplicado. El flujo vive en requireUser y va en DOS pasos:
 *
 * 1. `findRelinkCandidateByEmail` — localiza la fila candidata (solo
 *    estudiantes: una fila de mentor JAMÁS es transferible por correo).
 * 2. El caller verifica contra la API de Clerk que el `clerkId` viejo del
 *    candidato está MUERTO (404). Este paso es el corazón de la seguridad
 *    (hallazgo HIGH del revisor): la unicidad de correo de Clerk prueba que
 *    el correo pertenece HOY a la cuenta nueva, pero NO que la fila
 *    emparejada esté huérfana — `users.email` puede quedar obsoleto si su
 *    dueño cambió de correo primario sin volver a entrar. Sin esta
 *    verificación, un correo reciclado podría robar la fila (trades,
 *    bitácoras, balance) de un estudiante VIVO.
 * 3. `relinkUserById` — transfiere la fila (clerkId nuevo, des-archiva,
 *    refresca nombre), re-anclando `role='student'` en el WHERE como candado.
 *
 * Si hubiera más de una fila con el mismo correo (reclamaciones obsoletas
 * previas a `releaseEmailClaims`), se ofrece la más reciente.
 */
export async function findRelinkCandidateByEmail(
  db: Db,
  email: string,
): Promise<{ id: string; clerkId: string } | null> {
  const normalized = email.trim().toLowerCase()

  const [candidate] = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, eq(users.role, 'student')))
    .orderBy(desc(users.createdAt))
    .limit(1)

  return candidate ?? null
}

/** Paso 3 de la reconexión — ver `findRelinkCandidateByEmail`. `null` si la fila no es de un estudiante. */
export async function relinkUserById(db: Db, userId: string, newClerkId: string, name: string): Promise<DbUser | null> {
  const [relinked] = await db
    .update(users)
    .set({ clerkId: newClerkId, archivedAt: null, name })
    .where(and(eq(users.id, userId), eq(users.role, 'student')))
    .returning()

  return relinked ?? null
}

/**
 * Libera reclamaciones OBSOLETAS de un correo (hallazgo MEDIUM del revisor):
 * cuando Clerk acaba de probar que `email` pertenece al usuario de
 * `keepUserId` (o a una fila nueva por crear, con `keepUserId = null`),
 * cualquier OTRA fila que aún lo reclame tiene un dato viejo — se anula para
 * que un relink futuro nunca entregue el historial equivocado.
 */
export async function releaseEmailClaims(db: Db, email: string, keepUserId: string | null): Promise<void> {
  const normalized = email.trim().toLowerCase()
  const stale = sql`lower(${users.email}) = ${normalized}`

  await db
    .update(users)
    .set({ email: null })
    .where(keepUserId === null ? stale : and(stale, ne(users.id, keepUserId)))
}
