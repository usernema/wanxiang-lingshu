import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
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
      <Route path="/profile" element={<div>Profile Route Target</div>} />
    </Routes>,
    { initialEntries: ['/marketplace'] },
  )
}

describe('Marketplace UI regression coverage', () => {
  it('shows loading copy while marketplace session bootstrap is in progress', async () => {
    renderWithProviders(
      <Marketplace sessionState={buildSessionState({ bootstrapState: 'loading' })} />,
    )

    expect(await screen.findByText('正在恢复市场访问所需会话...')).toBeInTheDocument()
  })

  it('shows bootstrap error copy when marketplace session restoration fails', async () => {
    renderWithProviders(
      <Marketplace sessionState={buildSessionState({ bootstrapState: 'error', errorMessage: 'marketplace bootstrap failed' })} />,
    )

    expect(await screen.findByText('marketplace bootstrap failed')).toBeInTheDocument()
  })

  it('shows empty-state copy when task list is empty', async () => {
    renderMarketplace({ tasks: [] })

    expect(await screen.findByText('当前没有符合筛选条件的任务。')).toBeInTheDocument()
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

    expect(await screen.findByText('雇主本人不能以 worker 身份申请自己的任务。')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /缺少托管任务/i }))

    expect((await screen.findAllByText('当前任务缺少 escrow，无法释放托管。')).length).toBeGreaterThan(0)
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

    expect(await screen.findByText('当前任务已经分配或已创建托管。')).toBeInTheDocument()
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
      await screen.findByText('当前任务处于 open：worker 可以申请，任务 employer 可以从申请列表中分配执行者。'),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /已完成任务/i }))
    expect(
      await screen.findByText('当前任务处于 completed：任务已完成，托管应已释放，不再允许 assign / complete / cancel。'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /已取消任务/i }))
    expect(
      await screen.findByText('当前任务处于 cancelled：任务已取消，不再允许 apply / assign / complete / cancel。'),
    ).toBeInTheDocument()
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

    expect(await screen.findByText('状态机说明')).toBeInTheDocument()
    expect(
      await screen.findByText('当前任务处于 in_progress：只有被分配的 worker 可以 complete，employer 可以 cancel。'),
    ).toBeInTheDocument()
  })

  it('maps backend complete-task escrow error into product copy', async () => {
    renderMarketplace({
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
          throw makeAxiosError(400, { detail: 'Task has no escrow to release' })
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    const completeButton = await screen.findByRole('button', { name: '以 Worker 身份完成任务' })

    await waitFor(() => expect(completeButton).toBeEnabled())
    await user.click(completeButton)

    expect(
      await screen.findByText('当前任务缺少 escrow，无法完成。请先检查分配与 credit 托管状态。'),
    ).toBeInTheDocument()
  })

  it('maps 401 errors into session-expired product copy', async () => {
    renderMarketplace({
      tasks: [buildMarketplaceTask({ task_id: 'task-apply-401', title: '401 申请任务', status: 'open' })],
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/marketplace/tasks/task-apply-401/apply') {
          throw makeAxiosError(401, {})
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '以 Worker 身份申请任务' }))

    expect(await screen.findByText('当前登录已失效或已过期，请先刷新会话。')).toBeInTheDocument()
  })

  it('maps 403 worker mismatch errors into product copy', async () => {
    renderMarketplace({
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
    await user.click(await screen.findByRole('button', { name: '以 Worker 身份完成任务' }))

    expect(await screen.findByText('当前 worker 身份与请求中的执行者不匹配。')).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: '以 Employer 身份取消任务' }))

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

    expect(await screen.findByText('推荐去 Profile 验证余额变化')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '查看 Profile' }))

    expect(await screen.findByText('Profile Route Target')).toBeInTheDocument()
  })

  it('surfaces recommended apply action for open tasks in worker view', async () => {
    renderMarketplace({
      activeRole: 'worker',
      tasks: [
        buildMarketplaceTask({
          task_id: 'task-recommended-apply',
          title: '推荐申请任务',
          status: 'open',
          employer_aid: 'employer-agent',
        }),
      ],
    })

    expect(await screen.findByText('推荐先申请这个任务')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即申请' })).toBeInTheDocument()
  })

  it('surfaces recommended complete action for assigned in-progress tasks in worker view', async () => {
    renderMarketplace({
      activeRole: 'worker',
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

    expect(await screen.findByText('推荐立即完成任务')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '完成任务' })).toBeInTheDocument()
  })
})
