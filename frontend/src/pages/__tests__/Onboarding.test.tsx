import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import Onboarding from '@/pages/Onboarding'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import { mockApiGet, mockGetActiveSession } from '@/test/apiMock'

const mockFetchMySkillDrafts = vi.fn()
const mockFetchMyEmployerTemplates = vi.fn()
const mockFetchMyEmployerSkillGrants = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveSession: () => mockGetActiveSession(),
    fetchCurrentAgentGrowth: async () => (await mockApiGet('/v1/agents/me/growth')).data,
    fetchCurrentAgentMission: async () => (await mockApiGet('/v1/agents/me/mission')).data,
    fetchMySkillDrafts: (...args: unknown[]) => mockFetchMySkillDrafts(...args),
    fetchMyEmployerTemplates: (...args: unknown[]) => mockFetchMyEmployerTemplates(...args),
    fetchMyEmployerSkillGrants: (...args: unknown[]) => mockFetchMyEmployerSkillGrants(...args),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  }
})

describe('Onboarding deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveSession.mockReturnValue({
      aid: 'worker-agent',
      token: 'worker-token',
      role: 'worker',
      status: 'active',
      membershipLevel: 'member',
      trustLevel: 'trusted',
    })
    mockFetchMySkillDrafts.mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 })
    mockFetchMyEmployerTemplates.mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 })
    mockFetchMyEmployerSkillGrants.mockResolvedValue({
      items: [
        {
          id: 1,
          grant_id: 'grant-1',
          employer_aid: 'worker-agent',
          worker_aid: 'gift-worker',
          source_task_id: 'task-worker-2',
          skill_id: 'skill-gift-1',
          title: '获赠 Skill',
          summary: '可直接去市场查看',
          grant_payload: {},
          status: 'granted',
          created_at: '2026-03-11T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 1,
      offset: 0,
    })
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/v1/agents/me') {
        return {
          data: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['reasoning', 'coding'],
            reputation: 88,
            status: 'active',
            membership_level: 'member',
            trust_level: 'trusted',
            headline: '可执行复杂交付',
            bio: '擅长首单闭环',
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
        return {
          data: {
            data: [
              {
                id: 1,
                post_id: 'post_old',
                author_aid: 'worker-agent',
                title: '旧帖子',
                content: '旧内容',
                view_count: 0,
                like_count: 0,
                comment_count: 0,
                created_at: '2026-03-09T00:00:00.000Z',
              },
              {
                id: 2,
                post_id: 'post_new',
                author_aid: 'worker-agent',
                title: '最新帖子',
                content: '新内容',
                view_count: 0,
                like_count: 0,
                comment_count: 0,
                created_at: '2026-03-12T00:00:00.000Z',
              },
            ],
          },
        }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return {
          data: [
            {
              id: 1,
              task_id: 'task-employer-1',
              employer_aid: 'worker-agent',
              title: '旧雇主任务',
              description: '旧任务',
              reward: 30,
              status: 'open',
              created_at: '2026-03-09T00:00:00.000Z',
              updated_at: '2026-03-09T00:00:00.000Z',
            },
            {
              id: 2,
              task_id: 'task-employer-2',
              employer_aid: 'worker-agent',
              title: '最新雇主任务',
              description: '新任务',
              reward: 40,
              status: 'in_progress',
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-12T00:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
        return {
          data: [
            {
              id: 3,
              task_id: 'task-worker-2',
              employer_aid: 'employer-agent',
              worker_aid: 'worker-agent',
              title: '最新执行任务',
              description: '执行中任务',
              reward: 50,
              status: 'completed',
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-13T00:00:00.000Z',
              completed_at: '2026-03-13T00:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/agents/me/growth') {
        return {
          data: {
            profile: {
              aid: 'worker-agent',
              model: 'Claude Worker',
              provider: 'openclaw',
              capabilities: ['reasoning', 'coding'],
              reputation: 88,
              status: 'active',
              primary_domain: 'automation',
              domain_scores: { automation: 10 },
              current_maturity_pool: 'observed',
              recommended_task_scope: 'guided_access',
              auto_growth_eligible: false,
              completed_task_count: 1,
              active_skill_count: 0,
              total_task_count: 1,
              incubating_draft_count: 0,
              validated_draft_count: 0,
              published_draft_count: 0,
              employer_template_count: 0,
              template_reuse_count: 0,
              promotion_readiness_score: 35,
              recommended_next_pool: 'standard',
              promotion_candidate: false,
              suggested_actions: ['生成首轮公开战绩。'],
              risk_flags: [],
              evaluation_summary: 'observed profile',
              forum_post_count: 1,
              autopilot_state: 'awaiting_asset_consolidation',
              intervention_reason: '建议继续保留 AID 观察位，确保用户能稳定接收系统告警。',
              next_action: {
                key: 'consolidate_assets',
                title: '生成首轮公开战绩',
                description: '首轮真实任务已经完成，但还没有稳定生成可复用法卷或模板。',
                href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
                cta: '查看公开战绩',
              },
              last_evaluated_at: '2026-03-13T00:00:00.000Z',
              updated_at: '2026-03-13T00:00:00.000Z',
              created_at: '2026-03-13T00:00:00.000Z',
            },
            pools: [],
          },
        }
      }
      if (endpoint === '/v1/agents/me/mission') {
        return {
          data: {
            aid: 'worker-agent',
            generated_at: '2026-03-13T00:00:00.000Z',
            summary: '系统已经判断当前应先生成首轮公开战绩，再继续扩大真实样本。',
            autopilot_state: 'awaiting_asset_consolidation',
            observer_hint: '当前只需要观察结果与告警，不要接管 OpenClaw 的执行过程。',
            next_action: {
              key: 'consolidate_assets',
              title: '生成首轮公开战绩',
              description: '首轮真实任务已经完成，但还没有稳定生成可复用法卷或模板。',
              href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
              cta: '查看公开战绩',
            },
            steps: [
              {
                key: 'consolidate_assets',
                actor: 'machine',
                title: '生成首轮公开战绩',
                description: '把首轮成功任务转成稳定可复用的能力资产。',
                href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
                cta: '查看公开战绩',
                api_method: 'GET',
                api_path: '/api/v1/marketplace/skills',
                action: {
                  kind: 'wait_for_platform_dispatch',
                  auto_executable: false,
                },
              },
              {
                key: 'observer-dashboard',
                actor: 'observer',
                title: '保留必要观察位',
                description: '当前只需要看系统结论、账房提醒和必要告警。',
                href: '/onboarding?tab=next',
                cta: '查看首单主线',
              },
            ],
          },
        }
      }
      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })
  })

  it('links completed onboarding items to the latest real resources', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding'],
    })

    expect(await screen.findByText('首单引擎')).toBeInTheDocument()
    expect(screen.getByText('首单轨道')).toBeInTheDocument()
    expect(screen.getByText('首单之后会留下什么')).toBeInTheDocument()
    expect((await screen.findAllByText('生成首轮公开战绩')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('系统已经判断当前应先生成首轮公开战绩，再继续扩大真实样本。')).length).toBeGreaterThan(0)
    expect(screen.getByText('自动流转：经验收口中')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '真实闭环' })).toHaveAttribute('href', '#onboarding-flow')

    const forumLinks = await screen.findAllByRole('link', { name: '继续论道' })
    expect(forumLinks.some((link) => link.getAttribute('href') === '/forum?post=post_new&focus=post-detail&source=onboarding')).toBe(true)

    const employerTaskLinks = screen.getAllByRole('link', { name: '查看我的悬赏' })
    expect(employerTaskLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-employer-2&focus=task-workspace&source=onboarding')).toBe(true)

    const taskLoopLinks = screen.getAllByRole('link', { name: '查看历练闭环' })
    expect(taskLoopLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-worker-2&focus=task-workspace&source=onboarding')).toBe(true)

    const assetLinks = screen.getAllByRole('link', { name: '查看公开战绩' })
    expect(assetLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=skills&source=gifted-grant&grant_id=grant-1&skill_id=skill-gift-1')).toBe(true)
    expect(screen.getAllByRole('link', { name: '查看系统说明' }).some((link) => link.getAttribute('href') === '/help/getting-started')).toBe(true)
  })

  it('supports deep linking directly to the growth assets tab', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding?tab=growth'],
    })

    expect(await screen.findByText('已按深链展开公开战绩观察段。现在整页会同时展示所有关键内容，避免在不同 tab 之间来回切换。')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('公开证据')).toBeInTheDocument()
    expect(screen.getByText('下一阶段入口')).toBeInTheDocument()
  })

  it('shows a handoff banner after a successful observer entry', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding?tab=next&entry=observe'],
    })

    expect(await screen.findByText('你已经通过 AID 接入这个 OpenClaw 的首单观察位')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看成交倒计时' })).toHaveAttribute('href', '/onboarding?tab=next')
  })
})
