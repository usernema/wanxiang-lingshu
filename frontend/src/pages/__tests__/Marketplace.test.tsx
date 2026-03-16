import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { Routes, Route, useLocation } from 'react-router-dom'
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
  makeAxiosError,
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
      <Route
        path="/marketplace"
        element={
          <>
            <Marketplace sessionState={buildSessionState()} />
            <RouteLocationProbe />
          </>
        }
      />
      <Route path="/profile" element={<div>Profile Route Target</div>} />
    </Routes>,
    { initialEntries: initialEntries ?? ['/marketplace'] },
  )
}

function RouteLocationProbe() {
  const location = useLocation()
  return <div data-testid="route-location" className="hidden">{location.pathname}{location.search}</div>
}

describe('Marketplace UI regression coverage', () => {
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

  it('shows empty-state copy when task list is empty', async () => {
    renderMarketplace({ tasks: [] })

    expect(await screen.findByText('当前没有符合筛选条件的悬赏。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去发布悬赏' })).toHaveAttribute('href', '/marketplace?tab=tasks&focus=create-task')
    expect(screen.getByRole('link', { name: '先去论道台发需求帖' })).toHaveAttribute('href', '/forum?focus=create-post&source=marketplace-empty')
    expect(screen.getByRole('link', { name: '切到法卷坊' })).toHaveAttribute('href', '/marketplace?tab=skills')
  })

  it('shows diagnostics summary and selected-task anomaly message', async () => {
    const task = buildMarketplaceTask({ task_id: 'task-anomaly', title: '异常任务' })

    renderMarketplace({
      tasks: [task],
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
    expect(await screen.findByText('发现 2 个一致性问题')).toBeInTheDocument()
    expect(await screen.findByText('当前选中任务在 diagnostics 中被标记为异常')).toBeInTheDocument()
    expect(screen.getAllByText('open task unexpectedly contains lifecycle timestamps')).toHaveLength(2)
  })

  it('shows disabled hints for self-apply and missing escrow completion', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-self-apply',
          title: '自申请任务',
          employer_aid: 'worker-agent',
          status: 'open',
        }),
        buildMarketplaceTask({
          id: 2,
          task_id: 'task-missing-escrow',
          title: '缺少托管任务',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          escrow_id: null,
          status: 'in_progress',
        }),
      ],
    })

    expect(await screen.findByText('发榜人本人不能以行脚人身份接自己的悬赏。')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /缺少托管任务/i }))

    expect((await screen.findAllByText('当前悬赏缺少 escrow，无法交卷候验。')).length).toBeGreaterThan(0)
  })

  it('shows assign disabled hint when escrow already exists', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-assigned',
          title: '已托管任务',
          status: 'open',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      applications: {
        'task-assigned': [buildTaskApplication({ applicant_aid: 'candidate-agent' })],
      },
    })

    expect(await screen.findByText('当前悬赏已经分配或已创建托管。')).toBeInTheDocument()
  })

  it('shows state-guide copy for open completed and cancelled tasks', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({ task_id: 'task-open', title: '开放任务', status: 'open' }),
        buildMarketplaceTask({ id: 2, task_id: 'task-completed', title: '已完成任务', status: 'completed' }),
        buildMarketplaceTask({ id: 3, task_id: 'task-cancelled', title: '已取消任务', status: 'cancelled' }),
      ],
    })

    expect(
      await screen.findByText('当前悬赏处于 open：行脚人可以接榜，发榜人可以从接榜玉简里点将执行者。'),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /已完成任务/i }))
    expect(
      await screen.findByText('当前悬赏处于 completed：悬赏已完成，托管应已释放，不再允许 assign / complete / cancel。'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /已取消任务/i }))
    expect(
      await screen.findByText('当前悬赏处于 cancelled：悬赏已撤下，不再允许 apply / assign / complete / cancel。'),
    ).toBeInTheDocument()
  })

  it('allows worker to submit assigned compatibility tasks', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-assigned-complete',
          title: '历史 assigned 任务',
          status: 'assigned',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-compat',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-assigned-complete/complete') {
          return {
            data: {
              task_id: 'task-assigned-complete',
              status: 'submitted',
              message: 'Task submitted for employer acceptance',
              growth_assets: null,
            },
          }
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    const completeButton = await screen.findByRole('button', { name: '以行脚人身份交卷候验' })

    await waitFor(() => expect(completeButton).toBeEnabled())
    await user.click(completeButton)

    expect((await screen.findAllByText('悬赏已交卷候验，等待发榜人确认。')).length).toBeGreaterThan(0)
  })

  it('shows in_progress state-guide copy', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-in-progress',
          title: '进行中任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
    })

    expect(await screen.findByText('悬赏状态机说明')).toBeInTheDocument()
    expect(
      await screen.findByText('当前悬赏处于 in_progress：只有被点将的行脚人可以交卷候验，发榜人可以撤榜。'),
    ).toBeInTheDocument()
  })

  it('maps backend complete-task escrow error into product copy', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-complete',
          title: '可完成任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-complete/complete') {
          throw makeAxiosError(400, { detail: 'Task has no escrow to submit for acceptance' })
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    const completeButton = await screen.findByRole('button', { name: '以行脚人身份交卷候验' })

    await waitFor(() => expect(completeButton).toBeEnabled())
    await user.click(completeButton)

    expect(
      await screen.findByText('当前悬赏缺少 escrow，无法交卷候验。请先检查点将与 credit 托管状态。'),
    ).toBeInTheDocument()
  })

  it('shows submit-for-acceptance success copy after worker completion', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-complete-success',
          title: '首单验收任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-complete-success/complete') {
          return {
            data: {
              task_id: 'task-complete-success',
              status: 'submitted',
              message: 'Task submitted for employer acceptance',
              growth_assets: {
                skill_draft_id: 'draft_1',
                employer_template_id: 'tmpl_1',
                employer_skill_grant_id: 'grant_1',
                published_skill_id: 'skill_1',
                auto_published: true,
              },
            },
          }
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以行脚人身份交卷候验' }))

    expect((await screen.findAllByText('悬赏已交卷候验，等待发榜人确认。')).length).toBeGreaterThan(0)
    expect(await screen.findByText('悬赏已交卷候验，等待成长资产在验卷后落地')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去账房盯飞剑' })).toHaveAttribute(
      'href',
      '/wallet?focus=notifications&source=marketplace-submitted',
    )
    expect(screen.getByRole('link', { name: '去洞府看成长档案' })).toHaveAttribute(
      'href',
      '/profile?source=marketplace-submitted',
    )
  })

  it('surfaces growth asset and repurchase links after employer acceptance', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-accept-growth',
          title: '验收后自动沉淀任务',
          status: 'submitted',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-accept-growth/accept-completion') {
          return {
            data: {
              task_id: 'task-accept-growth',
              status: 'completed',
              message: 'Task accepted, payment released, first-success skill auto-published, and employer gift granted',
              growth_assets: {
                skill_draft_id: 'draft_growth_1',
                employer_template_id: 'tmpl_growth_1',
                employer_skill_grant_id: 'grant_growth_1',
                published_skill_id: 'skill_growth_1',
                auto_published: true,
              },
            },
          }
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以发榜人身份验卷并放款' }))

    expect(await screen.findByText('验卷完成，法卷已自动发布并赠送给发榜人')).toBeInTheDocument()
    expect(screen.getByText('draft_growth_1')).toBeInTheDocument()
    expect(screen.getByText('tmpl_growth_1')).toBeInTheDocument()
    expect(screen.getByText('grant_growth_1')).toBeInTheDocument()
    expect(screen.getByText('skill_growth_1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去查看获赠法卷' })).toHaveAttribute(
      'href',
      '/marketplace?tab=skills&source=gifted-grant&grant_id=grant_growth_1&skill_id=skill_growth_1',
    )
    expect(screen.getByRole('link', { name: '去洞府复用模板' })).toHaveAttribute(
      'href',
      '/profile?source=marketplace-growth',
    )
    expect(screen.getAllByRole('link', { name: '去账房飞剑中心' }).some((link) => link.getAttribute('href') === '/wallet?focus=notifications&source=marketplace-acceptance')).toBe(true)
  })

  it('maps 401 errors into session-expired product copy', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [buildMarketplaceTask({ task_id: 'task-apply-401', title: '401 申请任务', status: 'open' })],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-apply-401/apply') {
          throw makeAxiosError(401, {})
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以行脚人身份接榜' }))

    expect(await screen.findByText('当前登录已失效或已过期，请先刷新会话。')).toBeInTheDocument()
  })

  it('maps 403 worker mismatch errors into product copy', async () => {
    renderMarketplace({
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-complete-403',
          title: '403 完成任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-complete-403/complete') {
          throw makeAxiosError(403, { detail: 'forbidden' })
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以行脚人身份交卷候验' }))

    expect(await screen.findByText('当前行脚人身份与请求中的执行者不匹配。')).toBeInTheDocument()
  })

  it('surfaces 409 conflict detail in the error banner', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-cancel-409',
          title: '409 取消任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-cancel-409/cancel') {
          throw makeAxiosError(409, { detail: 'Task status changed by another actor' })
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以发榜人身份撤榜' }))

    expect(await screen.findByText('Task status changed by another actor')).toBeInTheDocument()
  })

  it('shows diagnostics fetch failure copy when diagnostics query fails', async () => {
    renderMarketplace({
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/diagnostics/consistency') {
          throw new Error('diagnostics failed')
        }
        if (endpoint.startsWith('/v1/marketplace/tasks?') || endpoint === '/v1/marketplace/tasks') {
          return { data: [buildMarketplaceTask()] }
        }
        if (endpoint.startsWith('/v1/marketplace/tasks/') && endpoint.endsWith('/applications')) {
          return { data: [buildTaskApplication()] }
        }
        if (endpoint === '/v1/marketplace/skills') {
          return { data: [] }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('diagnostics 加载失败，请检查 marketplace 服务。')).toBeInTheDocument()
  })

  it('navigates to profile when recommended action points to balance verification', async () => {
    renderMarketplace({
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-completed-profile',
          title: '已完成待验资任务',
          status: 'completed',
        }),
      ],
    })

    expect(await screen.findByText('推荐去洞府验证灵石变化')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去账房飞剑中心' })).toHaveAttribute(
      'href',
      '/wallet?focus=notifications&source=marketplace-task',
    )
    expect(screen.getByRole('link', { name: '去洞府核对资金' })).toHaveAttribute(
      'href',
      '/profile?focus=credit-verification&source=marketplace',
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '查看洞府' }))

    expect(await screen.findByText('Profile Route Target')).toBeInTheDocument()
  })

  it('shows actionable empty-state links in skills tab', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=skills'],
      tasks: [buildMarketplaceTask()],
      skills: [],
    })

    expect(await screen.findByText('当前暂无法卷。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去上架法卷' })).toHaveAttribute('href', '/marketplace?tab=skills&focus=publish-skill')
    expect(screen.getByRole('link', { name: '切到历练榜' })).toHaveAttribute('href', '/marketplace?tab=tasks')
  })

  it('surfaces recommended apply action for open tasks in worker view', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-recommended-apply',
          title: '推荐申请任务',
          status: 'open',
          employer_aid: 'employer-agent',
        }),
      ],
    })

    expect(await screen.findByText('推荐先接下这道悬赏')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即接榜' })).toBeInTheDocument()
  })

  it('surfaces recommended complete action for assigned in-progress tasks in worker view', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-recommended-complete',
          title: '推荐完成任务',
          status: 'in_progress',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
    })

    expect(await screen.findByText('推荐先交卷候验')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交交卷' })).toBeInTheDocument()
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

  it('keeps marketplace url clean on default entry', async () => {
    renderMarketplace({
      tasks: [buildMarketplaceTask({ task_id: 'task-clean', title: '默认任务' })],
    })

    expect(await screen.findByText('默认任务')).toBeInTheDocument()
    expect(screen.getByTestId('route-location')).toHaveTextContent('/marketplace')
  })

  it('filters worker open queue from deep link and excludes self-owned open tasks', async () => {
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

    expect(await screen.findByText('已定位到行脚人视角的「可接悬赏」队列，共 1 个任务。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /公开任务队列/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /自己的开放任务/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已提交任务/i })).not.toBeInTheDocument()
  })

  it('filters employer review queue from deep link and auto-focuses matching review task', async () => {
    renderMarketplace({
      activeRole: 'employer',
      initialEntries: ['/marketplace?tab=tasks&queue=review'],
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-open-other',
          title: '开放任务',
          status: 'open',
        }),
        buildMarketplaceTask({
          id: 2,
          task_id: 'task-review-target',
          title: '待验收目标任务',
          status: 'submitted',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
        buildMarketplaceTask({
          id: 3,
          task_id: 'task-review-other',
          title: '别人的待验收任务',
          status: 'submitted',
          employer_aid: 'another-employer',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-2',
        }),
      ],
    })

    expect(await screen.findByText('已定位到发榜人视角的「待验卷」队列，共 1 个任务。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /待验收目标任务/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /别人的待验收任务/i })).not.toBeInTheDocument()
    expect(await screen.findByText('当前悬赏处于 submitted：行脚人已提交交卷，发榜人可以验卷放款或打回重修。')).toBeInTheDocument()
  })

  it('filters worker execution queue from deep link and keeps assigned tasks readable', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      initialEntries: ['/marketplace?tab=tasks&queue=execution'],
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-assigned-focus',
          title: '已分配执行任务',
          status: 'assigned',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
        buildMarketplaceTask({
          id: 2,
          task_id: 'task-execution-other',
          title: '别人的执行任务',
          status: 'in_progress',
          employer_aid: 'employer-agent',
          worker_aid: 'other-worker',
          escrow_id: 'escrow-2',
        }),
      ],
    })

    expect(await screen.findByText('已定位到行脚人视角的「历练中」队列，共 1 个任务。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /已分配执行任务/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /别人的执行任务/i })).not.toBeInTheDocument()
    expect(await screen.findByText('当前悬赏处于 assigned：悬赏已完成点将，通常表示托管已建立，下一步等待行脚人开始历练。')).toBeInTheDocument()
  })

  it('shows completed queue growth guidance for worker deep link', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      initialEntries: ['/marketplace?tab=tasks&queue=completed'],
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-completed-worker',
          title: '已完成交付任务',
          status: 'completed',
          employer_aid: 'employer-agent',
          worker_aid: 'worker-agent',
          escrow_id: 'escrow-1',
        }),
      ],
    })

    expect(await screen.findByRole('button', { name: /已完成交付任务/i })).toBeInTheDocument()
    expect(await screen.findByText('历练结案后要把经验沉淀成资产')).toBeInTheDocument()
    expect(screen.getByText('当前 completed 队列里有 1 个已结案悬赏，建议优先核对收入，并把成功经验整理成公开法卷。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去上架法卷' })).toHaveAttribute(
      'href',
      '/marketplace?tab=skills&focus=publish-skill&source=marketplace-completed',
    )
    expect(screen.getByRole('link', { name: '去账房核对收入' })).toHaveAttribute(
      'href',
      '/wallet?focus=notifications&source=marketplace-completed',
    )
  })

  it('shows completed queue fallback actions when worker has no completed tasks', async () => {
    renderMarketplace({
      activeRole: 'worker',
      sessions: {
        default: defaultWorkerSession,
      },
      initialEntries: ['/marketplace?tab=tasks&queue=completed'],
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-open-worker',
          title: '开放任务',
          status: 'open',
          employer_aid: 'employer-agent',
        }),
      ],
    })

    expect(await screen.findByText('当前阶段队列里没有符合条件的悬赏。')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '去上架法卷' }).some((link) => (
      link.getAttribute('href') === '/marketplace?tab=skills&focus=publish-skill&source=marketplace-completed'
    ))).toBe(true)
    expect(screen.getAllByRole('link', { name: '去洞府看成长档案' }).some((link) => (
      link.getAttribute('href') === '/profile?source=marketplace-completed'
    ))).toBe(true)
  })

  it('deep-links into the requested task workspace', async () => {
    renderMarketplace({
      initialEntries: ['/marketplace?tab=tasks&task=task-focus-2&focus=task-workspace'],
      tasks: [
        buildMarketplaceTask({ task_id: 'task-focus-1', title: '普通任务' }),
        buildMarketplaceTask({ id: 2, task_id: 'task-focus-2', title: '指定任务工作台' }),
      ],
    })

    expect(await screen.findByText('已定位到悬赏工作台：指定任务工作台')).toBeInTheDocument()
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/marketplace?tab=tasks&task=task-focus-2&focus=task-workspace',
    )
  })
})
