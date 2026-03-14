import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import Home from '@/pages/Home'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import { mockApiGet, mockGetActiveRole, mockGetActiveSession, mockSetActiveRole } from '@/test/apiMock'
import type { Session, SessionRole } from '@/lib/api'

const mockFetchNotifications = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveRole: () => mockGetActiveRole(),
    getActiveSession: () => mockGetActiveSession(),
    setActiveRole: (role: SessionRole) => mockSetActiveRole(role),
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
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

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveRole.mockReturnValue('worker')
  })

  it('renders the landing page for guests', async () => {
    mockGetActiveSession.mockReturnValue(null)
    mockGetActiveRole.mockReturnValue('default')
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/health/ready') {
        return { data: { status: 'ready' } }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByRole('link', { name: '注册 / 登录' })).toHaveAttribute('href', '/join')
    expect(screen.queryByText('本周继续做什么')).not.toBeInTheDocument()
    expect(await screen.findByText('正式版主链路说明')).toBeInTheDocument()
  })

  it('renders worker-focused next actions and growth roadmap', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockGetActiveRole.mockReturnValue('worker')
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
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/health/ready') {
        return { data: { status: 'ready' } }
      }
      if (endpoint === '/v1/agents/me') {
        return {
          data: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['coding'],
            reputation: 88,
            status: 'active',
            membership_level: 'member',
            trust_level: 'verified',
            headline: '',
            bio: '',
            created_at: '2026-03-14T00:00:00.000Z',
          },
        }
      }
      if (endpoint === '/v1/credits/balance') {
        return {
          data: {
            aid: 'worker-agent',
            balance: 120,
            frozen_balance: 10,
            total_earned: 150,
            total_spent: 30,
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
        return {
          data: [
            {
              id: 1,
              task_id: 'task_123',
              employer_aid: 'employer-agent',
              worker_aid: 'worker-agent',
              title: '真实任务验收',
              description: '回到工作台继续处理',
              reward: 25,
              status: 'submitted',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T01:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/marketplace/tasks') {
        return {
          data: [
            {
              id: 2,
              task_id: 'task_open_1',
              employer_aid: 'employer-agent',
              worker_aid: null,
              title: '公开任务 1',
              description: '待申请',
              reward: 30,
              status: 'open',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:30:00.000Z',
            },
            {
              id: 3,
              task_id: 'task_self_open',
              employer_aid: 'worker-agent',
              worker_aid: null,
              title: '自己的开放任务',
              description: '不应计入待申请',
              reward: 20,
              status: 'open',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:10:00.000Z',
            },
          ],
        }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByText('本周继续做什么')).toBeInTheDocument()
    expect(screen.getByText('首页工作视角')).toBeInTheDocument()
    expect(screen.getAllByText('执行者视角').length).toBeGreaterThan(0)
    expect(screen.getByText('角色任务漏斗')).toBeInTheDocument()
    expect(screen.getByText('可申请任务')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去浏览任务' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&source=home-worker-funnel',
    )
    const taskWorkspaceLinks = await screen.findAllByRole('link', { name: '回到执行工作台' })
    expect(taskWorkspaceLinks.length).toBeGreaterThan(0)
    taskWorkspaceLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/marketplace?tab=tasks&task=task_123&focus=task-workspace&source=home-worker')
    })
    const taskActionTitles = await screen.findAllByText('继续执行中任务')
    expect(taskActionTitles.length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去看通知中心' })).toHaveAttribute(
      'href',
      '/wallet?focus=notifications&source=home',
    )
    expect(screen.getByText('7 天成长路径')).toBeInTheDocument()
    expect(screen.getByText('Day 7')).toBeInTheDocument()
    expect(screen.getByText('沉淀并发布首个 Skill')).toBeInTheDocument()
    expect(mockSetActiveRole).toHaveBeenCalledWith('worker')
  })

  it('switches to employer view and updates homepage guidance', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockGetActiveRole.mockReturnValue('worker')
    mockFetchNotifications.mockResolvedValue({
      items: [],
      total: 0,
      unread_count: 0,
      limit: 5,
      offset: 0,
    })
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/health/ready') {
        return { data: { status: 'ready' } }
      }
      if (endpoint === '/v1/agents/me') {
        return {
          data: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['coding'],
            reputation: 88,
            status: 'active',
            membership_level: 'member',
            trust_level: 'verified',
            headline: '全栈执行者',
            bio: '可以做开发与交付',
            created_at: '2026-03-14T00:00:00.000Z',
          },
        }
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
      if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
        return {
          data: {
            data: [
              {
                id: 2,
                post_id: 'post_2',
                author_aid: 'worker-agent',
                title: '最近交付复盘',
                content: '内容',
                view_count: 2,
                like_count: 1,
                comment_count: 0,
                created_at: '2026-03-14T00:00:00.000Z',
              },
            ],
          },
        }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [{ id: 1, skill_id: 'skill_1', author_aid: 'worker-agent', name: '站内交付', price: 25, purchase_count: 1, view_count: 10, status: 'active' }] }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return {
          data: [
            {
              id: 10,
              task_id: 'task_employer_1',
              employer_aid: 'worker-agent',
              worker_aid: 'worker-2',
              title: '雇主侧待验收任务',
              description: '等待验收',
              reward: 50,
              status: 'submitted',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T02:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks') {
        return { data: [] }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '雇主视角' }))

    expect((await screen.findAllByText('雇主视角')).length).toBeGreaterThanOrEqual(2)
    expect((await screen.findAllByText('继续雇主任务流转')).length).toBeGreaterThan(0)
    const employerWorkspaceLinks = screen.getAllByRole('link', { name: '回到雇主工作台' })
    expect(employerWorkspaceLinks.length).toBeGreaterThan(0)
    employerWorkspaceLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        '/marketplace?tab=tasks&task=task_employer_1&focus=task-workspace&source=home-employer',
      )
    })
    expect(screen.getByText('角色任务漏斗')).toBeInTheDocument()
    expect(screen.getByText('等待验收')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去验收任务' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&task=task_employer_1&focus=task-workspace&source=home-employer-funnel-review',
    )
    expect(mockSetActiveRole).toHaveBeenCalledWith('employer')
  })
})
