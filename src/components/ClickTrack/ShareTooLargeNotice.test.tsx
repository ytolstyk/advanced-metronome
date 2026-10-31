import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const auth = vi.hoisted(() => ({ status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'configuring' }))

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: auth.status }),
  Authenticator: () => <div data-testid="authenticator" />,
}))

import { ShareTooLargeNotice } from './ShareTooLargeNotice'

describe('ShareTooLargeNotice', () => {
  beforeEach(() => {
    auth.status = 'unauthenticated'
    sessionStorage.clear()
  })

  it('tells a signed-out user to sign in to save to the cloud instead', () => {
    render(<ShareTooLargeNotice />)
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('This track is too large for a share link.')
    expect(notice).toHaveTextContent('Sign in to save it to the cloud instead.')
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('tells a signed-in user to use Save to Cloud and offers no sign-in button', () => {
    auth.status = 'authenticated'
    render(<ShareTooLargeNotice />)
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Use Save to Cloud instead.')
    expect(notice).not.toHaveTextContent('Sign in to save')
    expect(screen.queryByRole('button', { name: 'Sign In' })).not.toBeInTheDocument()
  })

  it('treats a still-configuring auth state as signed out', () => {
    auth.status = 'configuring'
    render(<ShareTooLargeNotice />)
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('opens the sign-in dialog from the Sign In button, and not before', async () => {
    render(<ShareTooLargeNotice />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('authenticator')).toBeInTheDocument()
  })
})
