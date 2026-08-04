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
