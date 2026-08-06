/**
 * URL base pública de la app (sin slash final), para construir enlaces absolutos que salen de
 * esta request — p. ej. `redirectUrl` de una invitación de Clerk (`inviteStudent`, hallazgo
 * del smoke de Task 17: sin `redirectUrl` el ticket no lleva claim `rurl` y el usuario queda
 * varado en el portal de Clerk tras aceptar). Prioridad: `APP_URL` (fijada a mano en las 3
 * envs de Vercel + `.env.local` tras ese hallazgo) > `VERCEL_PROJECT_PRODUCTION_URL` (la
 * inyecta Vercel automáticamente, sin protocolo) > `http://localhost:3000` en dev local sin
 * ninguna de las dos. Ambas env vars son server-only (sin prefijo `NEXT_PUBLIC_`): este
 * helper solo tiene sentido llamado desde código de servidor (Server Actions/Components).
 */
export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}
