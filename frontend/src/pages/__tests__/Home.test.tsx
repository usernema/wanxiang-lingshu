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

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveRole.mockReturnValue('worker')
  })

  it('renders the landing page for guests', async () => {
    mockGetActiveSession.mockReturnValue(null)
    mockGetActiveRole.mockReturnValue('default')
    mockApiGet.mockImplementation(async (endpoint: string) => {
      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByRole('link', { name: '入世领道籍' })).toHaveAttribute('href', '/join')
    expect(screen.queryByText('代理当前主线')).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'OpenClaw 协议' }))
    expect(await screen.findByText('修行主链路')).toBeInTheDocument()
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
              intervention_reason: '建议尽快绑定观察邮箱，否则人类无法稳定接收告警。',
              next_action: {
                key: 'advance_market_loop',
                title: '推进首轮真实流转',
                description: '它已经进入万象楼，当前目标是把首轮任务推进到交卷、验卷与结算。',
                href: '/marketplace?tab=tasks&source=growth-autopilot',
                cta: '查看流转链路',
              },
              last_evaluated_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:00:00.000Z',
              created_at: '2026-03-14T00:00:00.000Z',
            },
            pools: [],
          },
        }
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

    expect(await screen.findByText('代理当前主线')).toBeInTheDocument()
    expect(screen.getByText('当前修行身份')).toBeInTheDocument()
    expect(await screen.findByText((_, node) => node?.textContent === '自动流转：首轮流转中')).toBeInTheDocument()
    expect(screen.getAllByText('行脚人视角').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: '代理态势' })).toHaveAttribute('aria-selected', 'true')
    const taskActionTitles = await screen.findAllByText('推进首轮真实流转')
    expect(taskActionTitles.length).toBeGreaterThan(0)
    const taskWorkspaceLinks = await screen.findAllByRole('link', { name: '查看流转链路' })
    expect(taskWorkspaceLinks.length).toBeGreaterThan(0)
    taskWorkspaceLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/marketplace?tab=tasks&source=growth-autopilot')
    })
    expect(screen.getAllByRole('link', { name: '去看飞剑传书' }).every((link) => (
      link.getAttribute('href') === '/wallet?focus=notifications&source=home'
    ))).toBe(true)

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: '黑箱流转' }))

    expect(screen.getByText('可接悬赏')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去浏览悬赏' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&queue=open&source=home-worker-funnel',
    )

    await user.click(screen.getByRole('tab', { name: '成长沉淀' }))
    expect(screen.getByText('系统成长刻度')).toBeInTheDocument()
    expect(screen.getByText('第七日')).toBeInTheDocument()
    expect(screen.getByText('沉淀并发布首卷法卷')).toBeInTheDocument()
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
              domain_scores: { development: 90 },
              current_maturity_pool: 'delivery',
              recommended_task_scope: 'medium',
              auto_growth_eligible: true,
              completed_task_count: 1,
              active_skill_count: 1,
              total_task_count: 1,
              incubating_draft_count: 0,
              validated_draft_count: 0,
              published_draft_count: 1,
              employer_template_count: 0,
              template_reuse_count: 0,
              promotion_readiness_score: 75,
              recommended_next_pool: 'specialist',
              promotion_candidate: true,
              suggested_actions: ['publish'],
              risk_flags: [],
              evaluation_summary: 'ok',
              last_evaluated_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:00:00.000Z',
              created_at: '2026-03-14T00:00:00.000Z',
            },
            pools: [],
          },
        }
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
    await user.click(await screen.findByRole('button', { name: '发榜人视角' }))

    expect(screen.getAllByText('发榜人视角').length).toBeGreaterThan(0)
    expect((await screen.findAllByText('继续推进当前悬赏')).length).toBeGreaterThan(0)
    const employerWorkspaceLinks = screen.getAllByRole('link', { name: '回到发榜工作台' })
    expect(employerWorkspaceLinks.length).toBeGreaterThan(0)
    employerWorkspaceLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        '/marketplace?tab=tasks&task=task_employer_1&focus=task-workspace&source=home-employer',
      )
    })
    await user.click(screen.getByRole('tab', { name: '黑箱流转' }))
    expect(screen.getByRole('tab', { name: '黑箱流转' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('待验卷')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去验卷' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&task=task_employer_1&focus=task-workspace&source=home-employer-funnel-review',
    )
    expect(mockSetActiveRole).toHaveBeenCalledWith('employer')
  })

  it('routes worker completed funnel card to skill operations when completed work has become reusable assets', async () => {
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
        return { data: { data: [] } }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [{ id: 1, skill_id: 'skill_1', author_aid: 'worker-agent', name: '站内交付', price: 25, purchase_count: 1, view_count: 10, status: 'active' }] }
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
              domain_scores: { development: 92 },
              current_maturity_pool: 'delivery',
              recommended_task_scope: 'medium',
              auto_growth_eligible: true,
              completed_task_count: 1,
              active_skill_count: 1,
              total_task_count: 1,
              incubating_draft_count: 0,
              validated_draft_count: 0,
              published_draft_count: 1,
              employer_template_count: 0,
              template_reuse_count: 0,
              promotion_readiness_score: 82,
              recommended_next_pool: 'specialist',
              promotion_candidate: true,
              suggested_actions: ['publish'],
              risk_flags: [],
              evaluation_summary: 'ok',
              last_evaluated_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:00:00.000Z',
              created_at: '2026-03-14T00:00:00.000Z',
            },
            pools: [],
          },
        }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
        return {
          data: [
            {
              id: 1,
              task_id: 'task_completed_1',
              employer_aid: 'employer-agent',
              worker_aid: 'worker-agent',
              title: '已完成交付任务',
              description: '完成后沉淀为法卷',
              reward: 25,
              status: 'completed',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T01:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/marketplace/tasks') {
        return { data: [] }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect((await screen.findAllByText('继续运营已沉淀法卷')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '去运营法卷' }).some((link) => (
      link.getAttribute('href') === '/marketplace?tab=skills&source=home-worker-assets'
    ))).toBe(true)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: '黑箱流转' }))
    expect(screen.getAllByRole('link', { name: '去运营法卷' }).some((link) => (
      link.getAttribute('href') === '/marketplace?tab=skills&source=home-worker-funnel-completed'
    ))).toBe(true)
    expect(screen.queryByText('去历练榜接首单')).not.toBeInTheDocument()
  })

  it('routes employer completed funnel card to profile assets when reusable templates already exist', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockGetActiveRole.mockReturnValue('employer')
    mockFetchNotifications.mockResolvedValue({
      items: [],
      total: 0,
      unread_count: 0,
      limit: 5,
      offset: 0,
    })
    mockApiGet.mockImplementation(async (endpoint: string) => {
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
        return { data: { data: [] } }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [] }
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
              domain_scores: { development: 92 },
              current_maturity_pool: 'delivery',
              recommended_task_scope: 'medium',
              auto_growth_eligible: true,
              completed_task_count: 1,
              active_skill_count: 0,
              total_task_count: 1,
              incubating_draft_count: 0,
              validated_draft_count: 0,
              published_draft_count: 0,
              employer_template_count: 2,
              template_reuse_count: 1,
              promotion_readiness_score: 82,
              recommended_next_pool: 'specialist',
              promotion_candidate: true,
              suggested_actions: ['reuse'],
              risk_flags: [],
              evaluation_summary: 'ok',
              last_evaluated_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T00:00:00.000Z',
              created_at: '2026-03-14T00:00:00.000Z',
            },
            pools: [],
          },
        }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return {
          data: [
            {
              id: 10,
              task_id: 'task_employer_completed_1',
              employer_aid: 'worker-agent',
              worker_aid: 'worker-2',
              title: '雇主侧已完成任务',
              description: '已形成模板资产',
              reward: 50,
              status: 'completed',
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
    await user.click(await screen.findByRole('button', { name: '发榜人视角' }))

    expect((await screen.findAllByText('复盘模板并继续放大复购')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '去复盘模板' }).some((link) => (
      link.getAttribute('href') === '/profile?source=home-employer-assets'
    ))).toBe(true)
    await user.click(screen.getByRole('tab', { name: '黑箱流转' }))
    expect(screen.getAllByRole('link', { name: '去复盘模板' }).some((link) => (
      link.getAttribute('href') === '/profile?source=home-employer-funnel-completed'
    ))).toBe(true)
  })
})
