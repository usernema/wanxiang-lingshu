import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import Marketplace from '@/pages/Marketplace'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  buildMarketplaceTask,
  buildSessionState,
  buildTaskApplication,
  buildTaskConsistencyReport,
} from '@/test/fixtures/marketplace'
import {
  applyMarketplaceApiMocks,
  defaultEmployerSession,
  defaultWorkerSession,
  mockApiGet,
  mockApiPost,
  mockGetActiveRole,
  mockGetSession,
  mockSetActiveRole,
  mockSwitchRole,
} from '@/test/apiMock'
import type { Session, SessionRole } from '@/lib/api'
import type { MarketplaceTask, TaskApplication, TaskConsistencyReport } from '@/types'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    fetchStarterTaskPack: async () => ({
      agent_aid: 'worker-agent',
      stage: 'first_order',
      summary: '首单引擎测试数据',
      recommendations: [],
    }),
    getActiveRole: () => mockGetActiveRole(),
    getSession: (role?: SessionRole) => mockGetSession(role),
    ensureSession: async () => {
      const session = mockGetSession()
      if (!session) {
        throw new actual.ApiSessionError('No session is available', 'UNAUTHORIZED')
      }
      return session
    },
    setActiveRole: (role: SessionRole) => mockSetActiveRole(role),
    switchRole: (role: SessionRole) => mockSwitchRole(role),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
      post: (endpoint: string, payload?: unknown) => mockApiPost(endpoint, payload),
    },
  }
})

type RenderMarketplaceOptions = {
  tasks?: MarketplaceTask[]
  diagnostics?: TaskConsistencyReport
  applications?: Record<string, TaskApplication[]>
  skills?: unknown[]
  sessions?: Partial<Record<SessionRole, Session | null>>
  activeRole?: SessionRole
  initialEntries?: string[]
  apiGetImpl?: (endpoint: string) => Promise<{ data: unknown }>
  apiPostImpl?: (endpoint: string, payload?: unknown) => Promise<{ data: unknown }>
}

function defaultApiGet(
  tasks: MarketplaceTask[],
  diagnostics: TaskConsistencyReport,
  applications: Record<string, TaskApplication[]>,
  skills: unknown[],
) {
  return async (endpoint: string) => {
    if (endpoint.startsWith('/v1/marketplace/tasks?') || endpoint === '/v1/marketplace/tasks') {
      return { data: tasks }
    }
    if (endpoint === '/v1/marketplace/tasks/diagnostics/consistency') {
      return { data: diagnostics }
    }
    if (endpoint.startsWith('/v1/marketplace/tasks/') && endpoint.endsWith('/applications')) {
      const taskId = endpoint.split('/')[4]
      return { data: applications[taskId] ?? [] }
    }
    if (endpoint === '/v1/marketplace/skills') {
      return { data: skills }
    }
    throw new Error(`Unhandled GET endpoint: ${endpoint}`)
  }
}

function renderMarketplace({
  tasks = [buildMarketplaceTask()],
  diagnostics = buildTaskConsistencyReport(),
  applications = {},
  skills = [],
  sessions,
  activeRole = 'employer',
  initialEntries,
  apiGetImpl,
  apiPostImpl,
}: RenderMarketplaceOptions = {}) {
  applyMarketplaceApiMocks({
    default: defaultEmployerSession,
    employer: defaultEmployerSession,
    worker: defaultWorkerSession,
    ...sessions,
  })
  mockGetActiveRole.mockReturnValue(activeRole)
  mockApiGet.mockImplementation(apiGetImpl ?? defaultApiGet(tasks, diagnostics, applications, skills))
  mockApiPost.mockImplementation(apiPostImpl ?? (async () => ({ data: {} })))

  return renderWithProviders(
    <Routes>
      <Route path="/marketplace" element={<Marketplace sessionState={buildSessionState()} />} />
    </Routes>,
    { initialEntries: initialEntries ?? ['/marketplace'] },
  )
}

describe('Marketplace observer-only regression coverage', () => {
  it('shows loading copy while marketplace session bootstrap is in progress', async () => {
    renderWithProviders(
      <Marketplace sessionState={buildSessionState({ bootstrapState: 'loading' })} />,
    )

    expect(await screen.findByText('正在恢复万象楼访问所需会话...')).toBeInTheDocument()
  })

  it('shows bootstrap error copy when marketplace session restoration fails', async () => {
    renderWithProviders(
      <Marketplace sessionState={buildSessionState({ bootstrapState: 'error', errorMessage: 'marketplace bootstrap failed' })} />,
    )

    expect(await screen.findByText('marketplace bootstrap failed')).toBeInTheDocument()
  })

  it('shows observer empty-state actions when no tasks are available', async () => {
    renderMarketplace({ tasks: [] })

    expect(await screen.findByText('当前没有符合筛选条件的悬赏。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续观察任务队列' })).toHaveAttribute('href', '/marketplace?tab=tasks')
    expect(screen.getByRole('link', { name: '去账房核对飞剑' })).toHaveAttribute('href', '/wallet?focus=notifications&source=marketplace-empty')
    expect(screen.getAllByRole('link', { name: '去洞府看复盘' }).some((link) => link.getAttribute('href') === '/profile?source=marketplace-empty')).toBe(true)
    expect(screen.queryByRole('link', { name: '去发布悬赏' })).not.toBeInTheDocument()
  })

  it('keeps task workspace in observer mode and removes action buttons', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-observer',
          title: '观察态任务',
          status: 'open',
        }),
      ],
      applications: {
        'task-observer': [buildTaskApplication({ applicant_aid: 'candidate-agent' })],
      },
    })

    expect(await screen.findByText('当前网页只读观察。点将、托管与录用决策由 OpenClaw 自主完成。')).toBeInTheDocument()
    expect(screen.getByText('交付推进保持自动化')).toBeInTheDocument()
    expect(screen.getByText('验卷决策改为只读观察')).toBeInTheDocument()
    expect(screen.getByText('当前网页只保留观察位。推荐动作仍由 OpenClaw 在机器侧自主执行。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '以行脚人身份接榜' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '以行脚人身份交卷候验' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '以发榜人身份验卷并放款' })).not.toBeInTheDocument()
  })

  it('shows diagnostics summary while keeping observer-only workflow', async () => {
    renderMarketplace({
      tasks: [buildMarketplaceTask({ task_id: 'task-anomaly', title: '异常任务' })],
      diagnostics: buildTaskConsistencyReport({
        summary: {
          total_issues: 2,
          open_with_lifecycle_fields: 1,
          in_progress_missing_assignment: 1,
        },
        examples: [
          {
            task_id: 'task-anomaly',
            status: 'open',
            issue: 'open task unexpectedly contains lifecycle timestamps',
          },
        ],
      }),
    })

    expect(await screen.findByText('一致性诊断')).toBeInTheDocument()
    expect(screen.getByText('系统观察结论')).toBeInTheDocument()
    expect(await screen.findByText('发现 2 个一致性问题')).toBeInTheDocument()
    expect(await screen.findByText('当前选中任务在 diagnostics 中被标记为异常')).toBeInTheDocument()
    expect(screen.getAllByText('open task unexpectedly contains lifecycle timestamps').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '立即接榜' })).not.toBeInTheDocument()
  })

  it('shows observer copy for create-task focus and publish panel', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=tasks&focus=create-task'],
    })

    expect(await screen.findByText('已定位到发榜区，但当前网页只保留观察位。请改为观察榜单状态与系统结论。')).toBeInTheDocument()
    expect(screen.getByText('任务观察主线')).toBeInTheDocument()
    expect(await screen.findByText('网页端已切换为只读观察')).toBeInTheDocument()
    expect(screen.getByText('发榜、点将、托管与验卷都由 OpenClaw 自主推进。这里仅保留榜单观察与结果回看，不再允许网页端代发悬赏。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '以发榜人身份发布悬赏' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('keeps skills marketplace read-only and shows publish observer notice', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=skills'],
      skills: [
        {
          id: 1,
          skill_id: 'skill-1',
          author_aid: 'worker-agent',
          name: '首单复用 Skill',
          description: '从真实任务提炼出的执行方法。',
          category: 'development',
          price: 30,
          purchase_count: 2,
          view_count: 10,
          rating: 5,
          status: 'active',
        },
      ],
    })

    expect(await screen.findByText('法卷观察主线')).toBeInTheDocument()
    expect(await screen.findByText('网页端只读观察，不执行购入动作')).toBeInTheDocument()
    expect(await screen.findByText('法卷发布改为自动生成')).toBeInTheDocument()
    expect(screen.getByText('网页端不再允许直接上架或购入法卷。这里仅保留卷面观察，真正的生成、发布与复用由 OpenClaw 自主完成。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上架法卷' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('uses observer empty-state actions in the skills tab', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=skills'],
      tasks: [buildMarketplaceTask()],
      skills: [],
    })

    expect(await screen.findByText('当前暂无法卷。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '回到历练榜观察' })).toHaveAttribute('href', '/marketplace?tab=tasks')
    expect(screen.getAllByRole('link', { name: '去洞府看战绩' }).some((link) => link.getAttribute('href') === '/profile?tab=assets&source=marketplace-empty')).toBe(true)
    expect(screen.queryByRole('link', { name: '去上架法卷' })).not.toBeInTheDocument()
  })

  it('opens skills tab and highlights gifted skill context from deep link', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=skills&source=gifted-grant&grant_id=grant-1&skill_id=skill-focus-1'],
      skills: [
        {
          id: 1,
          skill_id: 'skill-focus-1',
          author_aid: 'worker-agent',
          name: '首单复用 Skill',
          description: '从真实任务提炼出的执行方法。',
          category: 'development',
          price: 30,
          purchase_count: 2,
          view_count: 10,
          rating: 5,
          status: 'active',
        },
      ],
    })

    expect(await screen.findByText('已定位到获赠法卷：首单复用 Skill。你可以在这里继续查看卷面详情、定价和市集反馈。')).toBeInTheDocument()
    expect(screen.getByText('获赠来源')).toBeInTheDocument()
  })

  it('filters worker open queue from deep link in observer mode', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      initialEntries: ['/marketplace?tab=tasks&queue=open'],
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-self-open',
          title: '自己的开放任务',
          employer_aid: 'worker-agent',
          status: 'open',
        }),
        buildMarketplaceTask({
          id: 2,
          task_id: 'task-open-public',
          title: '公开任务队列',
          employer_aid: 'employer-agent',
          status: 'open',
        }),
        buildMarketplaceTask({
          id: 3,
          task_id: 'task-submitted-other',
          title: '已提交任务',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
          status: 'submitted',
        }),
      ],
    })

    expect(await screen.findByText('已定位到交付观察面的「可接悬赏」队列，共 1 个任务。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /公开任务队列/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /自己的开放任务/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已提交任务/i })).not.toBeInTheDocument()
  })

  it('shows completed queue observer fallback actions', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      initialEntries: ['/marketplace?tab=tasks&queue=completed'],
      tasks: [],
    })

    expect(await screen.findByText('已定位到交付观察面的「已完成结案」队列，当前没有匹配任务。')).toBeInTheDocument()
    expect(screen.getAllByText('已完成结案仅供观察').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '去账房盯飞剑' }).some((link) => link.getAttribute('href') === '/wallet?focus=notifications&source=marketplace-observer')).toBe(true)
    expect(screen.getAllByRole('link', { name: '去洞府看成长' }).some((link) => link.getAttribute('href') === '/profile?source=marketplace-observer')).toBe(true)
  })
})
