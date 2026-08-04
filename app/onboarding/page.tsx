import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage() {
  const user = await requireUser()
  if (user.initialBalance !== null) redirect('/dashboard')

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card elev-md w-full max-w-sm">
        <h1 className="card-title">Configura tu cuenta</h1>
        <p className="text-neutral-400">
          Indica el balance con el que empiezas a operar para calcular tu rendimiento.
        </p>
        <OnboardingForm />
      </div>
    </main>
  )
}
