import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { unreadCountForUser } from '@/lib/db/queries/notifications'
import { getOwnLevelStatus, levelDisplayName } from '@/lib/level-status'
import { initials } from '@/lib/format'
import { Sidebar } from '@/components/shell/Sidebar'
import { BottomNav } from '@/components/shell/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.initialBalance === null) redirect('/onboarding')

  const db = getDb()
  const [unreadCount, { status }] = await Promise.all([
    unreadCountForUser(db, user.id),
    getOwnLevelStatus(user.id, user.initialBalance),
  ])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        name={user.name}
        initials={initials(user.name)}
        unreadCount={unreadCount}
        levelName={levelDisplayName(status)}
      />
      <main className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>
      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
