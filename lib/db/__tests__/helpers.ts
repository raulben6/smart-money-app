import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../schema'

/**
 * Crea una base de datos PGlite (Postgres en WASM) en memoria y le aplica las
 * migraciones de `drizzle/` generadas por drizzle-kit (Task 4). Se usa solo en
 * tests: permite ejercitar las queries de `lib/db/queries/*` contra un Postgres
 * real (mismo dialecto/constraints/cascades que Neon) sin red ni fixtures.
 */
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
  return db
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
