import { fireEvent, screen, waitFor } from '@testing-library/react'
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

const mockFetchCurrentAgentGrowth = vi.fn()
const mockFetchMySkillDrafts = vi.fn()
const mockFetchMyEmployerTemplates = vi.fn()
const mockFetchMyEmployerSkillGrants = vi.fn()
const mockCreateTaskFromEmployerTemplate = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveRole: () => mockGetActiveRole(),
    getActiveSession: () => mockGetActiveSession(),
    fetchCurrentAgentGrowth: () => mockFetchCurrentAgentGrowth(),
    fetchMySkillDrafts: (...args: unknown[]) => mockFetchMySkillDrafts(...args),
    fetchMyEmployerTemplates: (...args: unknown[]) => mockFetchMyEmployerTemplates(...args),
    fetchMyEmployerSkillGrants: (...args: unknown[]) => mockFetchMyEmployerSkillGrants(...args),
    createTaskFromEmployerTemplate: (...args: unknown[]) => mockCreateTaskFromEmployerTemplate(...args),
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
  employerTemplatesResponse?: {
    items: Array<Record<string, unknown>>
    total: number
    limit: number
    offset: number
  }
}) {
  applyProfileApiMocks('worker' as SessionRole, options && 'session' in options ? options.session ?? null : activeSession)
  mockFetchCurrentAgentGrowth.mockResolvedValue({
    profile: {
      aid: 'worker-agent',
      model: 'Claude Worker',
      provider: 'anthropic',
      capabilities: ['reasoning', 'coding'],
      reputation: 88,
      status: 'active',
      created_at: '2026-03-09T00:00:00.000Z',
      primary_domain: 'development',
      domain_scores: { development: 8 },
      current_maturity_pool: 'standard',
      recommended_task_scope: 'standard_access',
      auto_growth_eligible: false,
      completed_task_count: 2,
      active_skill_count: 1,
      total_task_count: 2,
      incubating_draft_count: 1,
      validated_draft_count: 1,
      published_draft_count: 0,
      employer_template_count: 1,
      template_reuse_count: 0,
      promotion_readiness_score: 68,
      recommended_next_pool: 'preferred',
      promotion_candidate: true,
      suggested_actions: ['发布至少 1 个从真实任务总结出来的 Skill，形成可展示的作品沉淀。'],
      risk_flags: [],
      evaluation_summary: '标准池成长档案',
      last_evaluated_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-10T00:00:00.000Z',
    },
    pools: [
      { id: 1, aid: 'worker-agent', pool_type: 'maturity', pool_key: 'standard', pool_score: 100, status: 'active', effective_at: '2026-03-10T00:00:00.000Z', created_at: '2026-03-10T00:00:00.000Z' },
    ],
  })
  mockFetchMySkillDrafts.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
  mockFetchMyEmployerTemplates.mockResolvedValue(options?.employerTemplatesResponse ?? { items: [], total: 0, limit: 10, offset: 0 })
  mockFetchMyEmployerSkillGrants.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
  mockCreateTaskFromEmployerTemplate.mockResolvedValue({
    id: 100,
    task_id: 'task_from_template',
    employer_aid: 'worker-agent',
    worker_aid: null,
    title: '复用模板任务',
    description: '从模板生成',
    reward: 25,
    status: 'open',
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: null,
    completed_at: null,
    cancelled_at: null,
  })
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
        if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
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

    expect(await screen.findByText('正在恢复登录会话...')).toBeInTheDocument()
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
        if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
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
    expect(await screen.findByText('晋级候选')).toBeInTheDocument()
    expect(screen.getByText('晋级准备度')).toBeInTheDocument()
    expect(screen.getByText('下一目标池')).toBeInTheDocument()
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
        if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
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

  it('shows submitted tasks as awaiting acceptance in profile snapshots', async () => {
    renderProfile({
      apiGetImpl: async (endpoint: string) => {
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
          return { data: { data: [{ id: 1 }] } }
        }
        if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
          return { data: [] }
        }
        if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
          return {
            data: [
              {
                id: 1,
                task_id: 'task-submitted-1',
                employer_aid: 'employer-agent',
                worker_aid: 'worker-agent',
                title: '待验收任务',
                description: '任务已提交，等待雇主验收',
                reward: 40,
                status: 'submitted',
                created_at: '2026-03-09T00:00:00.000Z',
                updated_at: '2026-03-10T00:00:00.000Z',
              },
            ],
          }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect((await screen.findAllByText('待验收任务')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Awaiting Acceptance')).toBeInTheDocument()
  })

  it('creates a task directly from an employer template', async () => {
    renderProfile({
      employerTemplatesResponse: {
        items: [
          {
            id: 1,
            template_id: 'tmpl-1',
            owner_aid: 'worker-agent',
            worker_aid: null,
            source_task_id: 'task-source-1',
            title: '复用模板',
            summary: '可以直接生成新任务',
            template_json: {},
            status: 'active',
            reuse_count: 2,
            created_at: '2026-03-10T00:00:00.000Z',
            updated_at: null,
          },
        ],
        total: 11,
        limit: 10,
        offset: 0,
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: '用模板 tmpl-1 创建任务' }))

    await waitFor(() => {
      expect(mockCreateTaskFromEmployerTemplate).toHaveBeenCalledWith('tmpl-1')
    })
    expect(await screen.findByText('已根据模板“复用模板”创建任务 复用模板任务，可前往 Marketplace 继续分配执行者。')).toBeInTheDocument()
    expect(screen.getByText('草稿 0 · 赠送 0 · 模板 11')).toBeInTheDocument()
  })
})
