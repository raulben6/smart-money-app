import { requireMentor } from '@/lib/auth'
import { initials } from '@/lib/format'
import { MentorSidebar } from '@/components/shell/MentorSidebar'
import { MentorBottomNav } from '@/components/shell/MentorBottomNav'
import { AutoRefresh } from '@/components/shell/AutoRefresh'

/**
 * A diferencia de `(app)/layout.tsx`, no hay guard de onboarding: el mentor no
 * registra balance ni trades propios, así que `initialBalance === null` es su
 * estado normal y nunca debe redirigirlo a `/onboarding`.
 */
export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMentor()

  return (
    <div className="flex min-h-screen">
      <AutoRefresh />
      <MentorSidebar name={user.name} initials={initials(user.name)} />
      <main className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>
      <MentorBottomNav />
    </div>
  )
}
