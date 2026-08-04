import { describe, it, expect } from 'vitest'
import { shouldClearStash } from '../journal-stash'

describe('shouldClearStash', () => {
  it('(a) guardado exitoso del contenido más reciente -> limpia el stash', () => {
    expect(shouldClearStash({ ok: true, isStillCurrentContent: true })).toBe(true)
  })

  it('(b) Crítico 1: guardado exitoso de una foto VIEJA (el usuario ya escribió más) -> NO limpia', () => {
    // Escenario exacto del hallazgo: el intento en vuelo guardaba "A"; mientras esperaba
    // respuesta el usuario escribió "AB" y usó "Descartar cambios y cerrar" (stash = "AB").
    // La respuesta de "A" llega y tiene éxito, pero el servidor solo tiene "A" — borrar el
    // stash aquí perdería "AB" sin ninguna copia en ningún lado.
    expect(shouldClearStash({ ok: true, isStillCurrentContent: false })).toBe(false)
  })

  it('(c) guardado fallido del contenido más reciente -> NO limpia (nada que confirmar)', () => {
    expect(shouldClearStash({ ok: false, isStillCurrentContent: true })).toBe(false)
  })

  it('(d) guardado fallido de una foto vieja -> NO limpia', () => {
    expect(shouldClearStash({ ok: false, isStillCurrentContent: false })).toBe(false)
  })
})
