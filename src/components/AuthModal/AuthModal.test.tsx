import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

interface MockUser {
  userId?: string
  username?: string
  signInDetails?: { loginId?: string }
}

interface MockAuthState {
  authStatus: 'authenticated' | 'unauthenticated' | 'configuring'
  user?: MockUser
  signOut: () => void
}

const { mockFetchUserAttributes, mockSignOut, authState } = vi.hoisted(() => ({
  mockFetchUserAttributes: vi.fn<() => Promise<Record<string, string | undefined>>>(),
  mockSignOut: vi.fn(),
  authState: { current: null as unknown as MockAuthState },
}))

vi.mock('aws-amplify/auth', () => ({
  fetchUserAttributes: mockFetchUserAttributes,
}))

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => authState.current,
  Authenticator: () => <div data-testid="authenticator" />,
}))

import { AuthModal } from './AuthModal'

function setAuth(state: Partial<MockAuthState>) {
  authState.current = {
    authStatus: 'unauthenticated',
    signOut: mockSignOut,
    ...state,
  }
}

const GOOGLE_USER: MockUser = { userId: 'sub-1', username: 'google_105123456789' }

/** Render and flush the pending microtasks / zero-delay timers. */
async function renderModal() {
  const utils = render(<AuthModal />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return utils
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function trigger() {
  return document.querySelector('.auth-trigger') as HTMLElement
}

// findBy and waitFor hang under vitest fake timers, so open and flush effects explicitly.
async function openDialog() {
  fireEvent.click(trigger())
  await advance(0)
}

describe('AuthModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchUserAttributes.mockReset()
    mockSignOut.mockReset()
    setAuth({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('unauthenticated', () => {
    it('shows "Sign In" on the trigger without fetching attributes', async () => {
      await renderModal()
      expect(trigger()).toHaveTextContent('Sign In')
      expect(trigger()).not.toHaveClass('auth-trigger-signed-in')
      expect(mockFetchUserAttributes).not.toHaveBeenCalled()
    })

    it('mounts the Authenticator only once the dialog is opened', async () => {
      await renderModal()
      expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument()
      await openDialog()
      expect(screen.getByTestId('authenticator')).toBeInTheDocument()
    })
  })

  describe('password user (loginId present)', () => {
    beforeEach(() => {
      setAuth({
        authStatus: 'authenticated',
        user: { userId: 'u1', username: 'abc', signInDetails: { loginId: 'alice@example.com' } },
      })
    })

    it('uses loginId and never calls fetchUserAttributes', async () => {
      await renderModal()
      expect(trigger()).toHaveTextContent('alice')
      expect(trigger()).toHaveClass('auth-trigger-signed-in')
      expect(mockFetchUserAttributes).not.toHaveBeenCalled()
    })

    it('shortens long local parts to 10 chars plus an ellipsis in the trigger only', async () => {
      setAuth({
        authStatus: 'authenticated',
        user: { userId: 'u1', signInDetails: { loginId: 'averyverylongname@example.com' } },
      })
      await renderModal()
      expect(trigger()).toHaveTextContent('averyveryl…')
      await openDialog()
      expect(screen.getByText('averyverylongname@example.com')).toHaveClass('auth-email')
    })

    it('does not shorten a local part of exactly 10 characters', async () => {
      setAuth({
        authStatus: 'authenticated',
        user: { userId: 'u1', signInDetails: { loginId: '0123456789@example.com' } },
      })
      await renderModal()
      expect(trigger()).toHaveTextContent(/^0123456789$/)
    })

    it('shows the full loginId in the account dialog', async () => {
      await renderModal()
      await openDialog()
      expect(screen.getByText('alice@example.com')).toHaveClass('auth-email')
    })
  })

  describe('federated user', () => {
    it('does not show the previous user\'s label after switching users', async () => {
      setAuth({ authStatus: 'authenticated', user: GOOGLE_USER })
      mockFetchUserAttributes.mockResolvedValueOnce({ email: 'alice@example.com' })
      const { rerender } = await renderModal()
      expect(trigger().textContent).toContain('alice')

      mockFetchUserAttributes.mockRejectedValue(new Error('boom'))
      setAuth({ authStatus: 'authenticated', user: { userId: 'sub-2', username: 'google_999' } })
      rerender(<AuthModal />)
      await advance(0)

      expect(trigger().textContent).not.toContain('alice')
      expect(trigger().textContent).toContain('Account')
    })

    beforeEach(() => {
      setAuth({ authStatus: 'authenticated', user: GOOGLE_USER })
    })

    it('uses the email attribute as the label', async () => {
      mockFetchUserAttributes.mockResolvedValue({ email: 'bob@gmail.com', name: 'Bob', preferred_username: 'bobby' })
      await renderModal()
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)
      expect(trigger()).toHaveTextContent('bob')
      await openDialog()
      expect(screen.getByText('bob@gmail.com')).toHaveClass('auth-email')
    })

    it('falls back to name when email is missing', async () => {
      mockFetchUserAttributes.mockResolvedValue({ name: 'Carol', preferred_username: 'carol99' })
      await renderModal()
      expect(trigger()).toHaveTextContent('Carol')
    })

    it('falls back to preferred_username when email and name are missing', async () => {
      mockFetchUserAttributes.mockResolvedValue({ preferred_username: 'dave99' })
      await renderModal()
      expect(trigger()).toHaveTextContent('dave99')
    })

    it('never displays the raw Cognito username', async () => {
      mockFetchUserAttributes.mockResolvedValue({ email: 'bob@gmail.com' })
      await renderModal()
      await openDialog()
      screen.getByText('bob@gmail.com')
      expect(document.body).not.toHaveTextContent('google_105123456789')
    })

    it('shows "Account" and hides .auth-email while no label is known', async () => {
      mockFetchUserAttributes.mockReturnValue(new Promise(() => {}))
      await renderModal()
      expect(trigger()).toHaveTextContent('Account')
      await openDialog()
      screen.getByRole('button', { name: 'Sign Out' })
      expect(document.querySelector('.auth-email')).toBeNull()
      expect(document.body).not.toHaveTextContent('google_105123456789')
    })

    it('retries after a rejected fetch 1s apart and recovers', async () => {
      mockFetchUserAttributes
        .mockRejectedValueOnce(new Error('no tokens yet'))
        .mockResolvedValueOnce({ email: 'eve@gmail.com' })
      await renderModal()
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)
      expect(trigger()).toHaveTextContent('Account')

      await advance(999)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)

      await advance(1)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(2)
      expect(trigger()).toHaveTextContent('eve')
    })

    it('retries when attributes resolve without any usable label', async () => {
      mockFetchUserAttributes
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ name: 'Frank' })
      await renderModal()
      expect(trigger()).toHaveTextContent('Account')
      await advance(1000)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(2)
      expect(trigger()).toHaveTextContent('Frank')
    })

    it('stops after 4 total attempts (initial + 3 retries) and keeps "Account"', async () => {
      mockFetchUserAttributes.mockRejectedValue(new Error('nope'))
      await renderModal()
      await advance(1000)
      await advance(1000)
      await advance(1000)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(4)
      await advance(10_000)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(4)
      expect(trigger()).toHaveTextContent('Account')
    })

    it('stops retrying once a label is found', async () => {
      mockFetchUserAttributes
        .mockRejectedValueOnce(new Error('x'))
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValueOnce({ email: 'gina@gmail.com' })
      await renderModal()
      await advance(1000)
      await advance(1000)
      expect(trigger()).toHaveTextContent('gina')
      await advance(10_000)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(3)
    })

    it('cancels pending retries when unmounted', async () => {
      mockFetchUserAttributes.mockRejectedValue(new Error('nope'))
      const { unmount } = await renderModal()
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)
      unmount()
      await advance(10_000)
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)
    })

    it('ignores a late response after unmount', async () => {
      let resolveFetch: (v: Record<string, string>) => void = () => {}
      mockFetchUserAttributes.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { unmount } = await renderModal()
      unmount()
      await act(async () => {
        resolveFetch({ email: 'late@gmail.com' })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('does not schedule a retry when a late empty response arrives after unmount', async () => {
      let resolveFetch: (v: Record<string, string>) => void = () => {}
      mockFetchUserAttributes.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )
      const { unmount } = await renderModal()
      unmount()
      await act(async () => {
        resolveFetch({})
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(1)
    })

    it('does not call fetchUserAttributes while still configuring', async () => {
      setAuth({ authStatus: 'configuring', user: undefined })
      await renderModal()
      expect(mockFetchUserAttributes).not.toHaveBeenCalled()
      expect(trigger()).toHaveTextContent('Sign In')
    })
  })

  describe('signed-in dialog', () => {
    it('calls signOut and closes the dialog when Sign Out is clicked', async () => {
      setAuth({
        authStatus: 'authenticated',
        user: { userId: 'u1', signInDetails: { loginId: 'alice@example.com' } },
      })
      await renderModal()
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      await advance(0)
      expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
    })

    it('shows the Account title and description', async () => {
      setAuth({
        authStatus: 'authenticated',
        user: { userId: 'u1', signInDetails: { loginId: 'alice@example.com' } },
      })
      await renderModal()
      await openDialog()
      expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
      expect(screen.getByText('Signed in to your account.')).toBeInTheDocument()
    })
  })
})
