import { SignUp } from '@clerk/nextjs'
import { authAppearance } from '../../appearance'

export default function Page() {
  return <SignUp appearance={authAppearance} />
}
