import type { DbUser } from '@/lib/db/schema'

// vi.mock es hoisted: los mocks de '@/lib/auth', '@/lib/db' y 'next/cache' se
// declaran EN CADA archivo de test (ver `trades.actions.test.ts` como
// ejemplo), porque el factory de `vi.mock` no puede cerrar sobre variables
// del archivo de test (también hoisted por encima). Este helper solo expone
// el estado mutable que esos factories leen en cada llamada, y las funciones
// `mockAuthAs`/`useTestDb` que los tests usan para fijarlo.
export const authState: { user: DbUser | null } = { user: null }
export const dbState: { db: unknown } = { db: null }

/** Fija el usuario que devolverá `requireUser`/`requireMentor` mockeados; `null` simula "no autenticado". */
export function mockAuthAs(user: DbUser | null) {
  authState.user = user
}

/** Fija la instancia de DB (normalmente de `createTestDb()`) que devolverá `getDb()` mockeado. */
export function useTestDb(db: unknown) {
  dbState.db = db
}
