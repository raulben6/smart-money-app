import { describe, it, expect } from 'vitest'
import { shouldClearStash, ownsStash } from '../journal-stash'

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

describe('ownsStash', () => {
  it('(a) misma base (string) en ambos lados -> dueña', () => {
    expect(ownsStash({ stashBaseUpdatedAt: '2026-08-01T00:00:00.000Z', sessionBaseUpdatedAt: '2026-08-01T00:00:00.000Z' })).toBe(
      true,
    )
  })

  it('(b) Importante (ronda 2): bases distintas -> NO dueña (stash huérfano de otra sesión)', () => {
    // Escenario exacto del hallazgo: la carrera del Crítico 1 deja un stash con
    // `baseUpdatedAt` T0 mientras el servidor ya avanzó a T1 — un guardado ordinario de la
    // sesión reabierta (que montó con `journalUpdatedAt` = T1) NO debe poder borrar ese
    // huérfano de rebote.
    expect(ownsStash({ stashBaseUpdatedAt: 'T0', sessionBaseUpdatedAt: 'T1' })).toBe(false)
  })

  it('(c) ambas bases null -> dueña (journal sin updatedAt conocido en los dos lados)', () => {
    expect(ownsStash({ stashBaseUpdatedAt: null, sessionBaseUpdatedAt: null })).toBe(true)
  })

  it('(d) ambas bases undefined -> dueña (normalizado a null en los dos lados)', () => {
    expect(ownsStash({ stashBaseUpdatedAt: undefined, sessionBaseUpdatedAt: undefined })).toBe(true)
  })

  it('(e) null vs undefined -> dueña (ambos se normalizan al mismo valor)', () => {
    expect(ownsStash({ stashBaseUpdatedAt: null, sessionBaseUpdatedAt: undefined })).toBe(true)
  })

  it('(f) una base string, la otra null -> NO dueña', () => {
    expect(ownsStash({ stashBaseUpdatedAt: 'T0', sessionBaseUpdatedAt: null })).toBe(false)
  })
})
