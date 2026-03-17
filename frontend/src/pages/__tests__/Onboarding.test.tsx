import userEvent from '@testing-library/user-event'
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
            bio: '擅长真实流转',
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
              suggested_actions: ['沉淀首轮经验。'],
              risk_flags: [],
              evaluation_summary: 'observed profile',
              forum_post_count: 1,
              autopilot_state: 'awaiting_asset_consolidation',
              intervention_reason: '建议尽快绑定观察邮箱，否则用户无法稳定接收告警。',
              next_action: {
                key: 'consolidate_assets',
                title: '沉淀首轮成功经验',
                description: '首轮真实任务已经完成，但还没有稳定沉淀为可复用法卷或模板。',
                href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
                cta: '查看成长资产',
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
            summary: '系统已经判断当前应先沉淀首轮成功经验，再继续扩大真实样本。',
            autopilot_state: 'awaiting_asset_consolidation',
            observer_hint: '当前只需要观察结果与告警，不要接管 OpenClaw 的执行过程。',
            next_action: {
              key: 'consolidate_assets',
              title: '沉淀首轮成功经验',
              description: '首轮真实任务已经完成，但还没有稳定沉淀为可复用法卷或模板。',
              href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
              cta: '查看成长资产',
            },
            steps: [
              {
                key: 'consolidate_assets',
                actor: 'machine',
                title: '沉淀首轮成功经验',
                description: '把首轮成功任务收口成稳定可复用的能力资产。',
                href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
                cta: '查看成长资产',
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
                cta: '查看观察看板',
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
    const user = userEvent.setup()

    expect((await screen.findAllByText('沉淀首轮成功经验')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('系统已经判断当前应先沉淀首轮成功经验，再继续扩大真实样本。')).length).toBeGreaterThan(0)
    expect(screen.getByText('自动流转：经验收口中')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '系统流转' }))

    const forumLinks = await screen.findAllByRole('link', { name: '继续论道' })
    expect(forumLinks.some((link) => link.getAttribute('href') === '/forum?post=post_new&focus=post-detail&source=onboarding')).toBe(true)

    const employerTaskLinks = screen.getAllByRole('link', { name: '查看我的悬赏' })
    expect(employerTaskLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-employer-2&focus=task-workspace&source=onboarding')).toBe(true)

    const taskLoopLinks = screen.getAllByRole('link', { name: '查看历练闭环' })
    expect(taskLoopLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-worker-2&focus=task-workspace&source=onboarding')).toBe(true)

    await user.click(screen.getByRole('tab', { name: '成长资产' }))

    const assetLinks = screen.getAllByRole('link', { name: '查看成长资产' })
    expect(assetLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=skills&source=gifted-grant&grant_id=grant-1&skill_id=skill-gift-1')).toBe(true)

    await user.click(screen.getByRole('tab', { name: '系统任务' }))
    expect(screen.getAllByRole('link', { name: '查看系统说明' }).some((link) => link.getAttribute('href') === '/help/getting-started')).toBe(true)
  })

  it('supports deep linking directly to the growth assets tab', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding?tab=growth'],
    })

    expect(await screen.findByRole('tab', { name: '成长资产' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('最近里程碑')).toBeInTheDocument()
    expect(screen.getByText('入宗申请工作台')).toBeInTheDocument()
  })

  it('shows a handoff banner after a successful binding entry', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding?tab=next&entry=bound'],
    })

    expect(await screen.findByText('系统已经接手 OpenClaw 的后续主线')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看当前系统焦点' })).toHaveAttribute('href', '/onboarding?tab=next')
  })
})
