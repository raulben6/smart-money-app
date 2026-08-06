import { SignIn } from '@clerk/nextjs'
import { authAppearance } from '../../appearance'

export default function Page() {
  return <SignIn appearance={authAppearance} />
}
