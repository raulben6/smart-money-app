/**
 * Decide si un guardado exitoso de la Bitácora debe limpiar el stash de recuperación local
 * (`JournalSection.stashAndDiscard`, componente `components/trade-modal/JournalSection.tsx`)
 * — y, con él, ocultar la barra "Restaurar/Descartar" si estuviera visible.
 *
 * Extraída como función pura (sin tocar `attemptSeqRef`/`dirtyRef` ni el resto de la máquina
 * de secuencia de `flushSave`) para poder fijar en un test la tabla de decisión del hallazgo
 * Crítico 1 del review de Task 5: un guardado exitoso de una foto VIEJA del contenido — el
 * usuario ya escribió más (p. ej. pasó de "A" a "AB") después de que ese guardado saliera, y
 * mientras tanto usó "Descartar cambios y cerrar" (que stashea "AB") — NO debe borrar el
 * stash. El servidor solo tiene "A"; borrar el stash en ese momento perdería el delta "AB"
 * sin ninguna copia en ningún lado. Solo es seguro limpiar cuando el guardado que tuvo éxito
 * corresponde exactamente al contenido más reciente (`isStillCurrentContent`).
 *
 * @param ok - si ESTE guardado en particular tuvo éxito (`saveJournal` respondió `{ok:true}`).
 * @param isStillCurrentContent - si el contenido guardado sigue siendo el más reciente (nadie
 * escribió nada nuevo desde que se tomó la foto que se envió al servidor) — comparación por
 * referencia ya calculada en `flushSave` (`next === latestRef.current`).
 */
export function shouldClearStash({
  ok,
  isStillCurrentContent,
}: {
  ok: boolean
  isStillCurrentContent: boolean
}): boolean {
  return ok && isStillCurrentContent
}

/**
 * Determina si esta sesión — montada con `sessionBaseUpdatedAt` (su `journalUpdatedAt` al
 * montar, ver `JournalSectionProps`) — es la dueña legítima de un stash cuyo
 * `baseUpdatedAt` es `stashBaseUpdatedAt`, es decir, si puede confirmarlo como resuelto y
 * borrarlo con seguridad.
 *
 * Ronda 2 del review de Task 5: `clearStash()` (`JournalSection.tsx`) era ciega a la
 * IDENTIDAD del stash — borraba lo que hubiera en la clave sin importar si esta sesión lo
 * escribió. Eso permitía que un guardado exitoso ORDINARIO de una sesión reabierta borrara,
 * de rebote, un stash HUÉRFANO de una sesión anterior (el que dejó la carrera del hallazgo
 * Crítico 1 — `baseUpdatedAt` distinto del `journalUpdatedAt` actual, por eso nunca se
 * ofreció para restaurar) aunque esta sesión nunca lo escribió ni lo confirmó. Un stash solo
 * puede borrarse por la vía de limpieza rutinaria si `stashBaseUpdatedAt` coincide con la
 * base de ESTA sesión — igualdad simple, normalizando `null`/`undefined` al mismo valor en
 * ambos lados para que "sin base conocida" compare igual a sí mismo en los dos lados.
 *
 * Excepción documentada (fuera de esta función, ver `JournalSection.tsx`): un stash corrupto
 * o con forma inválida no pasa por esta comprobación — es basura irrecuperable sin importar
 * quién la escribió, así que se borra sin condiciones.
 */
export function ownsStash({
  stashBaseUpdatedAt,
  sessionBaseUpdatedAt,
}: {
  stashBaseUpdatedAt: string | null | undefined
  sessionBaseUpdatedAt: string | null | undefined
}): boolean {
  return (stashBaseUpdatedAt ?? null) === (sessionBaseUpdatedAt ?? null)
}
