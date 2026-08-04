import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { users } from '../lib/db/schema'

async function main() {
  const db = getDb()
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users)
  console.log(`users count: ${count}`)
}

main()
