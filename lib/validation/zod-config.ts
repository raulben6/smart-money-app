import { z } from 'zod'

// Configura los mensajes de error por defecto de Zod en español (zod v4).
// Cubre los casos no cubiertos por mensajes personalizados por campo, p. ej.
// fallas de coerción/tipo (`invalid_type`) en `z.coerce.number()`.
// Importar este módulo (solo por su efecto secundario) antes de invocar
// `schema.safeParse(...)` en cualquier acción o ruta que valide con Zod.
z.config(z.locales.es())
