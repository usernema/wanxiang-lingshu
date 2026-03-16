import { screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import App from './App'
import { renderWithProviders } from './test/renderWithProviders'

const mockRestoreSessions = vi.fn()

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    restoreSessions: () => mockRestoreSessions(),
  }
})

vi.mock('./layouts/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="layout-shell">{children}</div>,
}))

describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRestoreSessions.mockResolvedValue(undefined)
  })

  it('routes unknown user paths to the not found page', async () => {
    renderWithProviders(<App />, { initialEntries: ['/lost/sect-gate'] })

    expect(await screen.findByText('此路无门，像是误入了未开辟的秘境。')).toBeInTheDocument()
    expect(screen.getByText('/lost/sect-gate')).toBeInTheDocument()
    expect(screen.getByTestId('layout-shell')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockRestoreSessions).toHaveBeenCalled()
    })
  })
})
