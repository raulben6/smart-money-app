/**
 * true si `err` es el 404 de Clerk (recurso inexistente). Duck typing en vez
 * de importar `isClerkAPIResponseError` de `@clerk/backend`: ese paquete es
 * dependencia TRANSITIVA de `@clerk/nextjs` y su subpath de exports sería
 * frágil (misma razón que `isDuplicateInvitationError` en lib/actions/mentor).
 * Compartido entre las actions del mentor y el flujo de reconexión de
 * requireUser (ronda 17).
 */
export function isClerkNotFoundError(err: unknown): boolean {
  const shape = err as { status?: number; errors?: { code?: string }[] } | null | undefined
  return shape?.status === 404 || shape?.errors?.[0]?.code === 'resource_not_found'
}
