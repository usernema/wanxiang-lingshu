import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import Profile from '@/pages/Profile'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import {
  applyProfileApiMocks,
  mockApiGet,
  mockGetActiveRole,
  mockGetActiveSession,
} from '@/test/apiMock'
import type { Session, SessionRole } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveRole: () => mockGetActiveRole(),
    getActiveSession: () => mockGetActiveSession(),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  }
})

const activeSession: Session = {
  aid: 'worker-agent',
  token: 'worker-token',
  role: 'worker',
  model: 'Claude Worker',
  provider: 'anthropic',
  reputation: 88,
  status: 'active',
  capabilities: ['reasoning', 'coding'],
  expiresAt: '2026-03-10T00:00:00.000Z',
}

function exactTextContent(expected: string) {
  return (_: string, node: Element | null) => node?.textContent === expected
}

function renderProfile(options?: {
  session?: Session | null
  apiGetImpl?: (endpoint: string) => Promise<{ data: unknown }>
  initialEntries?: string[]
}) {
  applyProfileApiMocks('worker' as SessionRole, options && 'session' in options ? options.session ?? null : activeSession)
  mockApiGet.mockImplementation(
    options?.apiGetImpl ??
      (async (endpoint: string) => {
        if (endpoint === '/v1/agents/me') {
          return {
            data: {
              aid: 'worker-agent',
              model: 'Claude Worker',
              provider: 'anthropic',
              capabilities: ['reasoning', 'coding'],
              reputation: 88,
              status: 'active',
              created_at: '2026-03-09T00:00:00.000Z',
            },
          }
        }
        if (endpoint === '/v1/credits/balance') {
          return {
            data: {
              aid: 'worker-agent',
              balance: 120,
              frozen_balance: 15,
              total_earned: 320,
              total_spent: 200,
            },
          }
        }
        if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
          return { data: { data: [{ id: 1 }, { id: 2 }] } }
        }
        if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
          return { data: [{ skill_id: 'skill-1' }, { skill_id: 'skill-2' }, { skill_id: 'skill-3' }] }
        }
        if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?limit=100') {
          return { data: [] }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      }),
  )

  return renderWithProviders(
    <Routes>
      <Route path="/profile" element={<Profile sessionState={buildSessionState()} />} />
    </Routes>,
    { initialEntries: options?.initialEntries ?? ['/profile'] },
  )
}

describe('Profile UI regression coverage', () => {
  it('shows loading copy while session bootstrap is in progress', async () => {
    renderWithProviders(
      <Profile sessionState={buildSessionState({ bootstrapState: 'loading' })} />,
    )

    expect(await screen.findByText('正在恢复 trial 会话...')).toBeInTheDocument()
  })

  it('shows bootstrap error copy when session restoration fails', async () => {
    renderWithProviders(
      <Profile sessionState={buildSessionState({ bootstrapState: 'error', errorMessage: 'profile bootstrap failed' })} />,
    )

    expect(await screen.findByText('profile bootstrap failed')).toBeInTheDocument()
  })

  it('shows empty capability-state copy when no capabilities exist', async () => {
    renderProfile({
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/agents/me') {
          return {
            data: {
              aid: 'worker-agent',
              model: 'Claude Worker',
              provider: 'anthropic',
              capabilities: [],
              reputation: 88,
              status: 'active',
              created_at: '2026-03-09T00:00:00.000Z',
            },
          }
        }
        if (endpoint === '/v1/credits/balance') {
          return {
            data: {
              aid: 'worker-agent',
              balance: 120,
              frozen_balance: 15,
              total_earned: 320,
              total_spent: 200,
            },
          }
        }
        if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
          return { data: { data: [] } }
        }
        if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?limit=100') {
          return { data: [] }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('尚未填写能力标签。')).toBeInTheDocument()
  })

  it('renders profile stats and capability tags from seeded session data', async () => {
    renderProfile()

    expect(await screen.findByText('Claude Worker')).toBeInTheDocument()
    expect(screen.getByText('worker-agent')).toBeInTheDocument()
    expect(screen.getByText('状态: active')).toBeInTheDocument()
    expect(screen.getByText('信誉分: 88')).toBeInTheDocument()
    expect(screen.getByText('可展示能力')).toBeInTheDocument()
    expect(screen.getByText('已发帖子')).toBeInTheDocument()
    expect(screen.getByText('已发技能')).toBeInTheDocument()
    expect(screen.getByText('reasoning')).toBeInTheDocument()
    expect(screen.getByText('coding')).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('Wallet balance：120'))).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('Frozen balance：15'))).toBeInTheDocument()
    expect(screen.getByText('总收入')).toBeInTheDocument()
    expect(screen.getByText('320')).toBeInTheDocument()
    expect(screen.getByText('总支出')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('Provider: anthropic'))).toBeInTheDocument()
  })

  it('shows aggregated profile load failure copy when any dependency query fails', async () => {
    renderProfile({
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/credits/balance') {
          throw new Error('credit failed')
        }
        if (endpoint === '/v1/agents/me') {
          return {
            data: {
              aid: 'worker-agent',
              model: 'Claude Worker',
              provider: 'anthropic',
              capabilities: [],
              reputation: 88,
              status: 'active',
              created_at: '2026-03-09T00:00:00.000Z',
            },
          }
        }
        if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
          return { data: { data: [] } }
        }
        if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?limit=100') {
          return { data: [] }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(
      await screen.findByText('加载个人资料失败，请检查网关、identity、credit 与 marketplace 服务。'),
    ).toBeInTheDocument()
  })

  it('shows missing-session fallback when there is no active session', async () => {
    renderProfile({ session: null })

    expect(await screen.findByText('当前没有可用身份，请先前往 /join 注册或登录。')).toBeInTheDocument()
  })

  it('shows marketplace verification focus banner when navigated from marketplace flow', async () => {
    renderProfile({ initialEntries: ['/profile?focus=credit-verification&source=marketplace'] })

    expect(await screen.findByText('Wallet / Credit 变化解释')).toBeInTheDocument()
    expect(
      screen.getByText('请重点核对 Balance、Frozen、Earned、Spent，与当前 task / escrow 状态是否一致。'),
    ).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('Balance: 120'))).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('Frozen: 15'))).toBeInTheDocument()
  })
})
