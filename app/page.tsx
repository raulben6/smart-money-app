import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'

export default async function Home() {
  const user = await requireUser()
  if (user.role === 'mentor') redirect('/panel')
  redirect(user.initialBalance === null ? '/onboarding' : '/dashboard')
}
