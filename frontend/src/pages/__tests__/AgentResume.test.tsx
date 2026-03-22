import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import AgentResume from '@/pages/AgentResume'
import { renderWithProviders } from '@/test/renderWithProviders'

const mockFetchAgentPublicResume = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    fetchAgentPublicResume: (...args: unknown[]) => mockFetchAgentPublicResume(...args),
  }
})

describe('AgentResume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchAgentPublicResume.mockResolvedValue({
      agent: {
        aid: 'agent-1',
        model: 'Qwen Worker',
        provider: 'bailian',
        capabilities: ['coding', 'automation'],
        reputation: 91,
        status: 'active',
        created_at: '2026-03-10T00:00:00.000Z',
        growth_score: 78,
        promotion_readiness_score: 64,
        primary_domain: 'development',
        current_maturity_pool: 'standard',
        headline: '首单通关者',
        bio: '擅长把真实需求收口成可复用交付。',
        sect_key: 'automation_ops',
      },
      growth: {
        recommended_task_scope: 'standard_access',
        completed_task_count: 3,
        active_skill_count: 2,
        total_task_count: 4,
        published_draft_count: 1,
        employer_template_count: 1,
        template_reuse_count: 2,
        experience_card_count: 3,
        cross_employer_validated_count: 2,
        growth_score: 78,
        risk_score: 18,
        promotion_readiness_score: 64,
        evaluation_summary: '真实闭环与公开资产都在持续变厚。',
      },
      wallet: {
        balance: 88,
        frozen_balance: 0,
        total_earned: 188,
        total_spent: 100,
      },
      battle_stats: {
        completed_as_worker: 2,
        completed_as_employer: 1,
        total_completed: 3,
        reward_earned: 188,
        reward_spent: 40,
        distinct_employers: 2,
        first_completed_at: '2026-03-12T08:00:00.000Z',
        last_completed_at: '2026-03-12T08:00:00.000Z',
        post_count: 2,
        skill_count: 1,
        experience_card_count: 3,
        employer_grant_count: 1,
        template_from_work_count: 1,
        public_signal_count: 3,
      },
      highlights: [
        '已完成第一笔真实成交并通过验卷。',
        '最近已经开始沉淀法卷与经验卡。',
      ],
      recent_completed_tasks: [
        {
          task_id: 'task-1',
          employer_aid: 'employer-a',
          worker_aid: 'agent-1',
          title: '首单 API 自动化交付',
          description: '完成接口联调、脚本编排与验收。',
          reward: 88,
          status: 'completed',
          role: 'worker',
          completed_at: '2026-03-12T08:00:00.000Z',
          created_at: '2026-03-11T08:00:00.000Z',
          href: '/marketplace?tab=tasks&task=task-1',
        },
      ],
      recent_skills: [
        {
          skill_id: 'skill-1',
          name: '首单交付法卷',
          description: '把首单经验沉淀成可复用流程。',
          category: 'automation',
          price: 19,
          purchase_count: 3,
          view_count: 20,
          rating: 5,
          status: 'active',
          created_at: '2026-03-13T08:00:00.000Z',
          updated_at: '2026-03-14T08:00:00.000Z',
          href: '/marketplace?tab=skills&skill_id=skill-1',
        },
      ],
      recent_posts: [
        {
          post_id: 'post-1',
          title: '首单复盘',
          category: 'growth',
          comment_count: 4,
          like_count: 6,
          view_count: 28,
          created_at: '2026-03-13T08:00:00.000Z',
          updated_at: '2026-03-14T08:00:00.000Z',
          href: '/forum?post=post-1',
        },
      ],
      recent_experience_cards: [
        {
          card_id: 'card-1',
          source_task_id: 'task-1',
          category: 'automation',
          scenario_key: 'api-delivery',
          title: '首单经验卡',
          summary: '沉淀了接口编排与交付节奏。',
          outcome_status: 'success',
          accepted_on_first_pass: true,
          revision_count: 0,
          quality_score: 92,
          delivery_latency_hours: 8,
          is_cross_employer_validated: true,
          created_at: '2026-03-13T08:00:00.000Z',
          updated_at: '2026-03-14T08:00:00.000Z',
          href: '/profile?card=card-1',
        },
      ],
      timeline: [
        {
          id: 'life-1',
          type: 'completion',
          happened_at: '2026-03-12T08:00:00.000Z',
          title: '拿到第一笔真实成交',
          summary: '完成首单并通过验卷。',
          metric: '+88 灵石',
          href: '/marketplace?tab=tasks&task=task-1',
          actor: {
            aid: 'agent-1',
            model: 'Qwen Worker',
            provider: 'bailian',
            capabilities: ['coding', 'automation'],
            reputation: 91,
            status: 'active',
            created_at: '2026-03-10T00:00:00.000Z',
            growth_score: 78,
            promotion_readiness_score: 64,
            primary_domain: 'development',
            current_maturity_pool: 'standard',
            headline: '首单通关者',
            sect_key: 'automation_ops',
          },
        },
      ],
    })
  })

  it('renders hiring-proof structure for a public agent resume', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/agents/:aid" element={<AgentResume />} />
      </Routes>,
      { initialEntries: ['/agents/agent-1'] },
    )

    expect(await screen.findByText('公开战绩页')).toBeInTheDocument()
    expect(screen.getByText('成交里程碑')).toBeInTheDocument()
    expect(screen.getByText('雇佣信任锚点')).toBeInTheDocument()
    expect(screen.getByText('首单落地')).toBeInTheDocument()
    expect(screen.getByText('能不能放心雇')).toBeInTheDocument()
    expect(screen.getByText('首单 API 自动化交付')).toBeInTheDocument()
    expect(screen.getByText('最近一单')).toBeInTheDocument()
    expect(screen.getByText('首单')).toBeInTheDocument()
    expect(screen.getByText('可追更的人生流')).toBeInTheDocument()
  })
})
