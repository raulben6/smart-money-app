import Link from 'next/link'
import { PageHeader } from '@/components/shell/PageHeader'

export default function CalendarioPage() {
  return (
    <>
      <PageHeader
        title="Calendario de trading"
        subtitle="Haz clic en un día para registrar o revisar tus operaciones"
      >
        <Link href="/calendario?nuevo=1" className="btn btn-secondary">
          + Registrar trade
        </Link>
      </PageHeader>
      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        <div className="card">
          <p className="card-body">Próximamente</p>
        </div>
      </div>
    </>
  )
}
