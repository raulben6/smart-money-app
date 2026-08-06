import Link from 'next/link'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listSentNotifications } from '@/lib/db/queries/notifications'
import { listStudents } from '@/lib/db/queries/mentor'
import { isValidUuid } from '@/lib/validation/uuid'
import { PageHeader } from '@/components/shell/PageHeader'
import { NotificationCard } from '@/components/notifications/NotificationCard'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const PAGE_SIZE = 50
const MAX_LIMIT = 500

function parseFecha(value: string | undefined): string | undefined {
  return value && FECHA_RE.test(value) ? value : undefined
}

/** `?limite=` de la URL: entero positivo, topado a `MAX_LIMIT` — mismo tope que la capa de
 * datos (`lib/db/queries/notifications.ts`), pero validado también aquí: un `?limite=` con
 * forma inválida (no-entero, negativo, texto) nunca debe llegar tal cual a la query, cae
 * a `PAGE_SIZE` en vez de heredar en silencio el comportamiento por defecto de esa capa. */
function parseLimite(value: string | undefined): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return PAGE_SIZE
  return Math.min(n, MAX_LIMIT)
}

/**
 * Mensajes enviados por el mentor (Task 16, + smoke-test de escala): misma
 * `NotificationCard` que el centro de notificaciones del alumno, más la línea 'Para
 * {nombre}' (prop `studentName`). Sin `MarkAsRead` — el estado leído/no leído es del
 * DESTINATARIO, no del remitente; esta vista tampoco separa 'Nuevas'/'Anteriores' (ese
 * concepto tampoco aplica al remitente).
 *
 * Filtro por estudiante/fecha vía un `<form method="GET">` NATIVO (sin JS de cliente): el
 * navegador arma el querystring solo, esta misma página server component lo lee de
 * `searchParams` y vuelve a renderizar filtrada — ni un componente cliente ni un Server
 * Action hacen falta para esto. `e`/`desde`/`hasta` se validan aquí (forma de UUID / regex
 * de fecha) ANTES de pasarlos a `listSentNotifications`: un valor con forma inválida se
 * ignora (equivale a "sin ese filtro"), nunca se deja pasar tal cual a la capa de datos.
 *
 * 'Cargar más' es un `Link` (no un botón con JS) que preserva los filtros vigentes y sube
 * `limite` en `PAGE_SIZE` — mismo patrón sin-JS que el resto de este filtro. Deja de
 * renderizarse en cuanto `limit` alcanza `MAX_LIMIT` (hallazgo de revisión): sin este
 * corte, con `hasMore` todavía en `true` en ese punto, su `href` calcularía
 * `Math.min(limit + PAGE_SIZE, MAX_LIMIT)` = el mismo `limit` actual — un enlace que
 * apunta a la URL ya vigente, un callejón sin salida que parece un botón funcional pero
 * no avanza. En su lugar, un aviso neutral explica por qué no hay más para cargar.
 */
export default async function MensajesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; desde?: string; hasta?: string; limite?: string }>
}) {
  const mentor = await requireMentor()
  const db = getDb()

  const students = await listStudents(db, mentor.id)

  const { e, desde: desdeRaw, hasta: hastaRaw, limite: limiteRaw } = await searchParams
  const studentId = e && isValidUuid(e) ? e : undefined
  const desde = parseFecha(desdeRaw)
  const hasta = parseFecha(hastaRaw)
  const limit = parseLimite(limiteRaw)

  const { items: enviados, hasMore } = await listSentNotifications(db, mentor.id, { studentId, desde, hasta, limit })
  const now = new Date()

  // Filtros YA VALIDADOS (no los `searchParams` crudos) para el querystring de 'Cargar
  // más' — un valor inválido en la URL original no debe "colarse" de vuelta ahí.
  const filterParams = new URLSearchParams()
  if (studentId) filterParams.set('e', studentId)
  if (desde) filterParams.set('desde', desde)
  if (hasta) filterParams.set('hasta', hasta)

  const cargarMasParams = new URLSearchParams(filterParams)
  cargarMasParams.set('limite', String(Math.min(limit + PAGE_SIZE, MAX_LIMIT)))
  const cargarMasHref = `/mensajes?${cargarMasParams.toString()}`

  const hayFiltros = Boolean(studentId || desde || hasta)
  const totalTexto = `Mostrando ${enviados.length} mensaje${enviados.length === 1 ? '' : 's'}${hasMore ? ' · hay más' : ''}`

  return (
    <>
      <PageHeader title="Mensajes enviados" subtitle="Retroalimentación que le has dejado a tus estudiantes" />

      <div className="flex flex-col gap-[16px] px-[30px] pt-[26px] pb-[60px]" style={{ maxWidth: '840px' }}>
        <form method="GET" className="flex flex-wrap items-center gap-[10px]">
          <div className="flex items-center gap-[8px] rounded-[8px] border border-neutral-800 px-[10px] py-[6px]">
            <label htmlFor="mensajes-estudiante" className="text-[11px] text-neutral-500">
              Estudiante
            </label>
            <select
              id="mensajes-estudiante"
              name="e"
              className="border-0 bg-transparent text-text text-[12px] outline-none"
              defaultValue={studentId ?? ''}
            >
              <option value="">Todos los estudiantes</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-[8px] rounded-[8px] border border-neutral-800 px-[10px] py-[6px]">
            <label htmlFor="mensajes-desde" className="text-[11px] text-neutral-500">
              Desde
            </label>
            <input
              id="mensajes-desde"
              type="date"
              name="desde"
              className="border-0 bg-transparent text-text text-[12px] outline-none"
              style={{ width: '130px' }}
              defaultValue={desde ?? ''}
            />
          </div>
          <div className="flex items-center gap-[8px] rounded-[8px] border border-neutral-800 px-[10px] py-[6px]">
            <label htmlFor="mensajes-hasta" className="text-[11px] text-neutral-500">
              Hasta
            </label>
            <input
              id="mensajes-hasta"
              type="date"
              name="hasta"
              className="border-0 bg-transparent text-text text-[12px] outline-none"
              style={{ width: '130px' }}
              defaultValue={hasta ?? ''}
            />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
            Filtrar
          </button>
          <Link href="/mensajes" className="btn btn-ghost" style={{ fontSize: '12px', padding: '7px 12px' }}>
            Limpiar
          </Link>
        </form>

        <span className="text-[12px] text-neutral-500">{totalTexto}</span>

        {enviados.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>
              {hayFiltros ? 'Nadie coincide con esos filtros' : 'Aún no le has enviado retroalimentación a nadie'}
            </h2>
            <p className="m-0 text-[13px] text-neutral-400">
              {hayFiltros
                ? 'Prueba con otro estudiante o rango de fechas, o usa "Limpiar".'
                : 'Abre una operación de un estudiante y usa "Retroalimentación del mentor" para dejarle la primera nota.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {enviados.map((n) => (
              <NotificationCard key={n.id} notification={n} now={now} unread={false} studentName={n.studentName} />
            ))}
          </div>
        )}

        {hasMore && limit < MAX_LIMIT && (
          <Link href={cargarMasHref} className="btn btn-ghost self-start text-[12px]">
            Cargar más
          </Link>
        )}
        {hasMore && limit >= MAX_LIMIT && (
          <span className="text-[12px] text-neutral-500">
            Mostrando los primeros {MAX_LIMIT} resultados — usa los filtros para acotar la búsqueda.
          </span>
        )}
      </div>
    </>
  )
}
