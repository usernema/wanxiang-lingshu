import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Home from '@/pages/Home'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import { mockApiGet, mockGetActiveRole, mockGetActiveSession, mockSetActiveRole } from '@/test/apiMock'
import type { Session, SessionRole } from '@/lib/api'
import type { MarketplaceTask } from '@/types'

const mockFetchNotifications = vi.fn()
const mockFetchObserverLifestream = vi.fn()
const mockFetchStarterTaskPack = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveRole: () => mockGetActiveRole(),
    getActiveSession: () => mockGetActiveSession(),
    setActiveRole: (role: SessionRole) => mockSetActiveRole(role),
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    fetchObserverLifestream: (...args: unknown[]) => mockFetchObserverLifestream(...args),
    fetchStarterTaskPack: (...args: unknown[]) => mockFetchStarterTaskPack(...args),
    fetchAgentPublicStats: async () => (await mockApiGet('/v1/agents/stats')).data,
    fetchCurrentAgentGrowth: async () => (await mockApiGet('/v1/agents/me/growth')).data,
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  }
})

const activeSession: Session = {
  aid: 'worker-agent',
  token: 'worker-token',
  role: 'worker',
  status: 'active',
  membershipLevel: 'member',
  trustLevel: 'verified',
}

function buildTask(overrides: Partial<MarketplaceTask> = {}): MarketplaceTask {
  return {
    id: 1,
    task_id: 'task_1',
    employer_aid: 'employer-agent',
    worker_aid: 'worker-agent',
    escrow_id: null,
    title: '默认任务',
    description: '默认任务描述',
    requirements: null,
    reward: 25,
    deadline: null,
    status: 'assigned',
    created_at: '2026-03-14T00:00:00.000Z',
    updated_at: '2026-03-14T01:00:00.000Z',
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  }
}

function mockGuestApi() {
  mockApiGet.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/v1/agents/stats') {
      return { data: { total_agents: 128, active_agents: 103 } }
    }

    throw new Error(`Unhandled GET endpoint: ${endpoint}`)
  })
}

function mockDashboardApi({
  employerTasks = [],
  growthProfileOverrides = {},
  workerTasks = [],
}: {
  employerTasks?: MarketplaceTask[]
  growthProfileOverrides?: Record<string, unknown>
  workerTasks?: MarketplaceTask[]
} = {}) {
  mockApiGet.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/v1/agents/stats') {
      return { data: { total_agents: 128, active_agents: 103 } }
    }
    if (endpoint === '/v1/credits/balance') {
      return {
        data: {
          aid: 'worker-agent',
          balance: 120,
          frozen_balance: 0,
          total_earned: 150,
          total_spent: 30,
        },
      }
    }
    if (endpoint === '/v1/agents/me/growth') {
      return {
        data: {
          profile: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['coding'],
            reputation: 88,
            status: 'active',
            primary_domain: 'development',
            domain_scores: { development: 80 },
            current_maturity_pool: 'execution',
            recommended_task_scope: 'small',
            auto_growth_eligible: false,
            completed_task_count: 0,
            active_skill_count: 0,
            total_task_count: 1,
            incubating_draft_count: 0,
            validated_draft_count: 0,
            published_draft_count: 0,
            employer_template_count: 0,
            template_reuse_count: 0,
            promotion_readiness_score: 20,
            recommended_next_pool: 'delivery',
            promotion_candidate: false,
            suggested_actions: [],
            risk_flags: [],
            evaluation_summary: 'ok',
            forum_post_count: 0,
            autopilot_state: 'in_market_loop',
            intervention_reason: null,
            next_action: null,
            last_evaluated_at: '2026-03-14T00:00:00.000Z',
            updated_at: '2026-03-14T00:00:00.000Z',
            created_at: '2026-03-14T00:00:00.000Z',
            ...growthProfileOverrides,
          },
          pools: [],
        },
      }
    }
    if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
      return { data: employerTasks }
    }
    if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
      return { data: workerTasks }
    }

    throw new Error(`Unhandled GET endpoint: ${endpoint}`)
  })
}

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveRole.mockReturnValue('worker')
    mockFetchNotifications.mockResolvedValue({
      items: [],
      total: 0,
      unread_count: 0,
      limit: 5,
      offset: 0,
    })
    mockFetchObserverLifestream.mockResolvedValue({
      items: [],
      highlighted_agents: [],
    })
    mockFetchStarterTaskPack.mockResolvedValue({
      agent_aid: 'worker-agent',
      stage: 'growth',
      summary: '暂无推荐',
      recommendations: [],
    })
  })

  it('renders a compact observer overview for guests', async () => {
    mockGetActiveSession.mockReturnValue(null)
    mockGetActiveRole.mockReturnValue('default')
    mockGuestApi()
    mockFetchObserverLifestream.mockResolvedValue({
      items: [
        {
          id: 'life_1',
          type: 'completion',
          happened_at: '2026-03-14T03:00:00.000Z',
          title: '首单完成',
          summary: '某位 agent 完成了第一笔真实成交。',
          metric: '+25 灵石',
          href: '/agents/agent-1',
          actor: {
            aid: 'agent-1',
            model: 'Qwen',
            provider: 'bailian',
            capabilities: ['code'],
            reputation: 80,
            status: 'active',
            created_at: '2026-03-14T00:00:00.000Z',
            growth_score: 60,
            promotion_readiness_score: 45,
            primary_domain: 'development',
            current_maturity_pool: 'execution',
            headline: '首单执行者',
          },
        },
      ],
      highlighted_agents: [
        {
          aid: 'agent-1',
          headline: '今日新秀',
          summary: '刚刚打通首单闭环。',
          href: '/agents/agent-1',
          primary_domain: 'development',
          promotion_readiness_score: 45,
        },
      ],
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByText('Agent 命运总览')).toBeInTheDocument()
    expect(screen.getByText('命运机器规则')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入观察入口' })).toHaveAttribute('href', '/join?tab=observe')
    expect(screen.getByRole('link', { name: 'OpenClaw 接入' })).toHaveAttribute('href', '/join?tab=machine')
    expect(screen.getByRole('link', { name: '看公开战绩' })).toHaveAttribute('href', '/world?tab=rankings')
    expect(await screen.findByText((_, node) => node?.textContent === '已入驻 Agent：128')).toBeInTheDocument()
    expect(screen.getByText('可追更的人生流')).toBeInTheDocument()
    expect(await screen.findByText('今日新秀')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows a single observer focus for an active session', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockDashboardApi({
      growthProfileOverrides: {
        intervention_reason: '建议继续保留 AID 观察位，确保用户能稳定接收系统告警。',
        next_action: {
          key: 'advance_market_loop',
          title: '推进首轮真实流转',
          description: '它已经进入万象楼，当前目标是把首轮任务推进到交卷、验卷与结算。',
          href: '/marketplace?tab=tasks&source=growth-autopilot',
          cta: '查看流转链路',
        },
      },
      workerTasks: [
        buildTask({
          task_id: 'task_worker_1',
          title: '真实任务验收',
          status: 'submitted',
        }),
      ],
    })
    mockFetchNotifications.mockResolvedValue({
      items: [
        {
          notification_id: 'notif_1',
          recipient_aid: 'worker-agent',
          type: 'escrow_created',
          title: '托管已创建',
          content: '请回到任务工作台继续推进。',
          link: '/wallet?focus=notifications',
          is_read: false,
          metadata: null,
          created_at: '2026-03-14T00:00:00.000Z',
        },
      ],
      total: 1,
      unread_count: 1,
      limit: 5,
      offset: 0,
    })
    mockFetchStarterTaskPack.mockResolvedValue({
      agent_aid: 'worker-agent',
      stage: 'first_order',
      summary: '首单引擎测试数据',
      recommendations: [
        {
          task: {
            id: 2,
            task_id: 'starter_1',
            employer_aid: 'employer-agent',
            title: '冷启动任务',
            description: '适合新 agent 的首单任务',
            reward: 30,
            status: 'open',
            created_at: '2026-03-14T00:00:00.000Z',
          },
          match_score: 0.83,
          starter_fit: 'high',
          risk_level: 'low',
          reasons: ['reward-fit'],
          summary: '奖励规模合适，适合打通首单。',
        },
      ],
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByText('首单、战绩与人生流')).toBeInTheDocument()
    expect(screen.getByText('当前最值钱的一步')).toBeInTheDocument()
    expect((await screen.findAllByText('推进首轮真实流转')).length).toBeGreaterThan(0)
    expect(await screen.findByText('首单引擎')).toBeInTheDocument()
    expect(await screen.findByText((content, node) => content === '需要观察：' && node?.tagName === 'SPAN')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '查看流转链路' }).some((link) => (
        link.getAttribute('href') === '/marketplace?tab=tasks&source=growth-autopilot'
      ))).toBe(true)
    })
  })

  it('switches observer role without bringing back the old tabbed dashboard', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockDashboardApi({
      employerTasks: [
        buildTask({
          id: 10,
          task_id: 'task_employer_1',
          employer_aid: 'worker-agent',
          worker_aid: 'worker-2',
          title: '雇主侧待验收任务',
          status: 'submitted',
        }),
      ],
      workerTasks: [
        buildTask({
          id: 11,
          task_id: 'task_worker_1',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          title: '交付侧当前任务',
          status: 'in_progress',
        }),
      ],
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByText('观察镜头')).toBeInTheDocument()
    expect(await screen.findByText('进行中交付')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '查看当前流转' }).some((link) => (
        link.getAttribute('href') === '/marketplace?tab=tasks&task=task_worker_1&focus=task-workspace&source=home-worker'
      ))).toBe(true)
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '发榜镜头' }))

    await waitFor(() => {
      expect(mockSetActiveRole).toHaveBeenCalledWith('employer')
    })
    expect(await screen.findByText('进行中悬赏')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '查看当前流转' }).some((link) => (
        link.getAttribute('href') === '/marketplace?tab=tasks&task=task_employer_1&focus=task-workspace&source=home-employer'
      ))).toBe(true)
    })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
