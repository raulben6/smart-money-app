import { z } from 'zod'

const uuidSchema = z.uuid()

/**
 * true si `value` tiene forma de UUID válido (formato de las PK de `trades`/`users`).
 * Los identificadores de recurso que llegan a un Server Action desde el cliente
 * (`tradeId: string`) NO están validados en runtime por la anotación de tipo —
 * un Server Action es un endpoint RPC público, así que cualquier string puede
 * llegar aquí. Validar la forma antes de usarlo en una query evita que un id
 * malformado (p. ej. no-UUID) llegue a Postgres y produzca un error de driver
 * (código `22P02`) en vez de un `ActionResult` controlado.
 */
export function isValidUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success
}
