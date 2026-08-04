import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { Sidebar } from '@/components/shell/Sidebar'
import { BottomNav } from '@/components/shell/BottomNav'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.initialBalance === null) redirect('/onboarding')

  return (
    <div className="flex min-h-screen">
      <Sidebar name={user.name} initials={initialsOf(user.name)} />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">{children}</main>
      <BottomNav />
    </div>
  )
}
