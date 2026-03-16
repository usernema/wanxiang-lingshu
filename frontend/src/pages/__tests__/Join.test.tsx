import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Join from '@/pages/Join'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'

const mockNavigate = vi.fn()
const mockRequestEmailRegistrationCode = vi.fn()
const mockCompleteEmailRegistration = vi.fn()
const mockRequestEmailLoginCode = vi.fn()
const mockCompleteEmailLogin = vi.fn()
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
    requestEmailRegistrationCode: (payload: unknown) => mockRequestEmailRegistrationCode(payload),
    completeEmailRegistration: (payload: unknown) => mockCompleteEmailRegistration(payload),
    requestEmailLoginCode: (payload: unknown) => mockRequestEmailLoginCode(payload),
    completeEmailLogin: (payload: unknown) => mockCompleteEmailLogin(payload),
    getActiveSession: () => mockGetActiveSession(),
  }
})

describe('Join page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveSession.mockReturnValue(null)
  })

  it('requests a binding code and shows the inline dev code', async () => {
    mockRequestEmailRegistrationCode.mockResolvedValue({
      email: 'owner@example.com',
      aid: 'agent://a2ahub/openclaw-1',
      delivery: 'inline',
      verification_code: '123456',
      expires_at: '2026-03-12T12:00:00.000Z',
    })

    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join'] })

    const emailInputs = screen.getAllByPlaceholderText('邮箱地址')

    fireEvent.change(emailInputs[0], { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('绑定码（bind_...）'), { target: { value: 'bind_123456' } })
    fireEvent.click(screen.getByText('发送绑定验证码'))

    await waitFor(() => {
      expect(mockRequestEmailRegistrationCode).toHaveBeenCalledWith({
        email: 'owner@example.com',
        binding_key: 'bind_123456',
      })
    })

    expect(await screen.findByText('开发环境验证码：123456')).toBeInTheDocument()
    expect(await screen.findByText('验证码已发送到 owner@example.com，验证后你将获得 agent://a2ahub/openclaw-1 的观察权限。')).toBeInTheDocument()
  })

  it('completes email login and navigates to onboarding', async () => {
    const refreshSessions = vi.fn().mockResolvedValue(undefined)
    mockCompleteEmailLogin.mockResolvedValue({
      aid: 'agent://a2ahub/openclaw-1',
    })

    renderWithProviders(
      <Join sessionState={buildSessionState({ refreshSessions })} />,
      { initialEntries: ['/join'] },
    )

    fireEvent.click(screen.getByRole('tab', { name: '邮箱登录' }))

    const emailInputs = screen.getAllByPlaceholderText('邮箱地址')
    const codeInputs = screen.getAllByPlaceholderText('6 位验证码')

    fireEvent.change(emailInputs[0], { target: { value: 'owner@example.com' } })
    fireEvent.change(codeInputs[0], { target: { value: '654321' } })
    fireEvent.click(screen.getByText('邮箱登录并进入看板'))

    await waitFor(() => {
      expect(mockCompleteEmailLogin).toHaveBeenCalledWith({
        email: 'owner@example.com',
        code: '654321',
      })
    })
    await waitFor(() => expect(refreshSessions).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
  })

  it('shows direct continue actions when a session already exists', async () => {
    mockGetActiveSession.mockReturnValue({
      aid: 'agent://a2ahub/openclaw-1',
      token: 'token-1',
      role: 'default',
    })

    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join'] })

    expect(await screen.findByText('当前已绑定观察权限：agent://a2ahub/openclaw-1')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '查看代理看板' }).every((link) => link.getAttribute('href') === '/onboarding')).toBe(true)
    expect(screen.getByRole('link', { name: '查看洞府状态' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('link', { name: '查看账房状态' })).toHaveAttribute('href', '/wallet?focus=notifications&source=join')
  })

  it('renders the public self-registration instructions for OpenClaw', async () => {
    renderWithProviders(<Join sessionState={buildSessionState()} />, { initialEntries: ['/join'] })

    fireEvent.click(screen.getByRole('tab', { name: 'OpenClaw 接入' }))

    expect(screen.getByText('OpenClaw 自助注册入口')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看接入文档' })).toHaveAttribute('href', '/help/openclaw')
    expect(screen.getByRole('link', { name: '查看完整接入文档' })).toHaveAttribute('href', '/help/openclaw')
    expect(screen.getByText(/平台不会在网页里直接生成绑定码/)).toBeInTheDocument()
    expect(screen.getByText(/POST \/api\/v1\/agents\/register/)).toBeInTheDocument()
    expect(screen.getAllByText(/https:\/\/kelibing\.shop\/api\/v1\/agents\/register/).length).toBeGreaterThan(0)
    expect(screen.getByText(/python -m a2ahub register/)).toBeInTheDocument()
  })
})
