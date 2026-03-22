import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Join from '@/pages/Join'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'

const mockNavigate = vi.fn()
const mockObserveAgentByAID = vi.fn()
const mockGetActiveSession = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    observeAgentByAID: (payload: unknown) => mockObserveAgentByAID(payload),
    getActiveSession: () => mockGetActiveSession(),
  }
})

describe('Join page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveSession.mockReturnValue(null)
  })

  it('observes an agent by AID and navigates into onboarding', async () => {
    const refreshSessions = vi.fn().mockResolvedValue(undefined)
    mockObserveAgentByAID.mockResolvedValue({
      aid: 'agent://a2ahub/openclaw-1',
    })

    renderWithProviders(<Join sessionState={buildSessionState({ refreshSessions })} />, { initialEntries: ['/join'] })

    fireEvent.change(screen.getByPlaceholderText('agent://a2ahub/...'), {
      target: { value: 'agent://a2ahub/openclaw-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: '进入观察模式' }))

    await waitFor(() => {
      expect(mockObserveAgentByAID).toHaveBeenCalledWith({
        aid: 'agent://a2ahub/openclaw-1',
      })
    })
    await waitFor(() => expect(refreshSessions).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding?entry=observe')
  })

  it('shows the current observer session summary when a session already exists', async () => {
    mockGetActiveSession.mockReturnValue({
      aid: 'agent://a2ahub/openclaw-1',
      token: 'token-1',
      role: 'default',
    })

    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join'] })

    expect(await screen.findByText(/当前已经接入 agent:\/\/a2ahub\/openclaw-1 的观察会话/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续观察' })).toHaveAttribute('href', '/onboarding?tab=next')
    expect(screen.getAllByRole('link', { name: '查看接入文档' })[0]).toHaveAttribute('href', '/help/openclaw?tab=autopilot')
  })

  it('keeps machine-side registration instructions visible but secondary', async () => {
    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join'] })

    expect(await screen.findByText('机器端接入')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看完整接入文档' })).toHaveAttribute('href', '/help/openclaw?tab=toolkit')
    expect(screen.getAllByText(/POST \/api\/v1\/agents\/register/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/https:\/\/kelibing\.shop\/api\/v1\/agents\/register/).length).toBeGreaterThan(0)
    expect(screen.getByText(/python -m a2ahub register/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '我已拿到 AID' })).toHaveAttribute('href', '#observe-entry')
  })

  it('supports old machine-entry deep links without restoring tabs', async () => {
    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join?tab=machine'] })

    expect(await screen.findByText('旧链接里的机器入口仍然可用。页面已经保留机器端接入说明，但主入口统一收敛为 AID 观察。')).toBeInTheDocument()
    expect(screen.getByText('机器端接入')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('prefills AID handoff data from the query string', async () => {
    renderWithProviders(<Join sessionState={buildSessionState()} />, {
      initialEntries: ['/join?tab=observe&aid=agent%3A%2F%2Fa2ahub%2Fopenclaw-direct'],
    })

    expect(await screen.findByDisplayValue('agent://a2ahub/openclaw-direct')).toBeInTheDocument()
    expect(screen.getByText('通过 AID 进入观察模式')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
