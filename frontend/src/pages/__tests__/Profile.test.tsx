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

vi.mock('@/lib/api', () => ({
  getActiveRole: () => mockGetActiveRole(),
  getActiveSession: () => mockGetActiveSession(),
  api: {
    get: (endpoint: string) => mockApiGet(endpoint),
  },
}))

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
          return { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
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

    expect(await screen.findByText('正在恢复 seeded 身份与会话...')).toBeInTheDocument()
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
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('当前没有能力标签。')).toBeInTheDocument()
  })

  it('renders profile stats and capability tags from seeded session data', async () => {
    renderProfile()

    expect(await screen.findByText('Claude Worker')).toBeInTheDocument()
    expect(await screen.findByText('积分余额')).toBeInTheDocument()
    expect(screen.getByText('worker-agent')).toBeInTheDocument()
    expect(screen.getByText('角色: worker')).toBeInTheDocument()
    expect(screen.getByText('信誉分: 88')).toBeInTheDocument()
    expect(screen.getByText('冻结积分')).toBeInTheDocument()
    expect(screen.getByText('发布帖子')).toBeInTheDocument()
    expect(screen.getByText('发布技能')).toBeInTheDocument()
    expect(screen.getByText('reasoning')).toBeInTheDocument()
    expect(screen.getByText('coding')).toBeInTheDocument()
    expect(screen.getByText('总收入：320')).toBeInTheDocument()
    expect(screen.getByText('总支出：200')).toBeInTheDocument()
    expect(screen.getByText('服务提供商：anthropic')).toBeInTheDocument()
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
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(
      await screen.findByText('加载个人资料失败，请检查网关、identity、credit 与 marketplace 服务。'),
    ).toBeInTheDocument()
  })

  it('shows missing-session fallback when there is no active session', async () => {
    renderProfile({ session: null })

    expect(await screen.findByText('当前没有可用 session，请重新执行本地 bootstrap。')).toBeInTheDocument()
  })

  it('shows marketplace verification focus banner when navigated from marketplace flow', async () => {
    renderProfile({ initialEntries: ['/profile?focus=credit-verification&source=marketplace'] })

    expect(await screen.findByText('Credit 变化解释')).toBeInTheDocument()
    expect(
      screen.getByText('已按 Marketplace 推荐跳转到这里。请重点核对 Balance、Frozen、Earned、Spent，以及下方“当前解释链路”是否与刚才的任务状态一致。'),
    ).toBeInTheDocument()
    expect(screen.getByText('验资检查清单')).toBeInTheDocument()
    expect(screen.getByText('1. 先看顶部“积分余额 / 冻结积分”卡片是否符合刚才的任务状态。')).toBeInTheDocument()
  })
})
