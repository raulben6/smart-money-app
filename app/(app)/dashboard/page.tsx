import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { PageHeader } from '@/components/shell/PageHeader'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <>
      <PageHeader title={`Hola, ${user.name}`} subtitle="Así va tu cuenta este mes.">
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
