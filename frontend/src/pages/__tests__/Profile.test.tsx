import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Routes, Route, useLocation } from 'react-router-dom'
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
const mockFetchCurrentDojoDiagnostic = vi.fn()
const mockFetchCurrentDojoOverview = vi.fn()
const mockFetchCurrentDojoMistakes = vi.fn()
const mockFetchCurrentDojoRemediationPlans = vi.fn()
const mockFetchMySkillDrafts = vi.fn()
const mockFetchMyEmployerTemplates = vi.fn()
const mockFetchMyEmployerSkillGrants = vi.fn()
const mockCreateTaskFromEmployerTemplate = vi.fn()
const mockStartCurrentDojoDiagnostics = vi.fn()
const mockSubmitCurrentDojoDiagnostic = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveRole: () => mockGetActiveRole(),
    getActiveSession: () => mockGetActiveSession(),
    fetchCurrentAgentGrowth: () => mockFetchCurrentAgentGrowth(),
    fetchCurrentDojoDiagnostic: () => mockFetchCurrentDojoDiagnostic(),
    fetchCurrentDojoOverview: () => mockFetchCurrentDojoOverview(),
    fetchCurrentDojoMistakes: (...args: unknown[]) => mockFetchCurrentDojoMistakes(...args),
    fetchCurrentDojoRemediationPlans: (...args: unknown[]) => mockFetchCurrentDojoRemediationPlans(...args),
    fetchMySkillDrafts: (...args: unknown[]) => mockFetchMySkillDrafts(...args),
    fetchMyEmployerTemplates: (...args: unknown[]) => mockFetchMyEmployerTemplates(...args),
    fetchMyEmployerSkillGrants: (...args: unknown[]) => mockFetchMyEmployerSkillGrants(...args),
    createTaskFromEmployerTemplate: (...args: unknown[]) => mockCreateTaskFromEmployerTemplate(...args),
    startCurrentDojoDiagnostics: (...args: unknown[]) => mockStartCurrentDojoDiagnostics(...args),
    submitCurrentDojoDiagnostic: (...args: unknown[]) => mockSubmitCurrentDojoDiagnostic(...args),
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

async function openProfileTab(label: string) {
  fireEvent.click(await screen.findByRole('tab', { name: label }))
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
  employerSkillGrantsResponse?: {
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
      suggested_actions: ['发布至少 1 个从真实任务总结出来的法卷，形成可展示的作品沉淀。'],
      risk_flags: [],
      evaluation_summary: '标准池成长档案',
      autopilot_state: 'awaiting_asset_consolidation',
      intervention_reason: '建议尽快绑定观察邮箱，否则人类无法稳定接收告警。',
      next_action: {
        key: 'consolidate_assets',
        title: '沉淀首轮成功经验',
        description: '首轮真实任务已经完成，但还没有稳定沉淀为可复用法卷或模板。',
        href: '/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot',
        cta: '查看成长资产',
      },
      last_evaluated_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-10T00:00:00.000Z',
    },
    pools: [
      { id: 1, aid: 'worker-agent', pool_type: 'maturity', pool_key: 'standard', pool_score: 100, status: 'active', effective_at: '2026-03-10T00:00:00.000Z', created_at: '2026-03-10T00:00:00.000Z' },
    ],
  })
  mockFetchCurrentDojoOverview.mockResolvedValue({
    aid: 'worker-agent',
    school_key: 'automation_ops',
    stage: 'diagnostic',
    binding: {
      aid: 'worker-agent',
      primary_coach_aid: 'official://dojo/general-coach',
      school_key: 'automation_ops',
      stage: 'diagnostic',
      status: 'active',
    },
    coach: {
      coach_aid: 'official://dojo/general-coach',
      coach_type: 'official',
      schools: ['automation_ops'],
      bio: '平台官方总教练',
      pricing: { amount: 0, currency: 'credits' },
      rating: 5,
      status: 'active',
    },
    active_plan: {
      plan_id: 'plan-1',
      aid: 'worker-agent',
      coach_aid: 'official://dojo/general-coach',
      trigger_type: 'diagnostic',
      goal: { title: '完成入门诊断并进入训练场' },
      assigned_set_ids: ['dojo_automation_ops_diagnostic_v1'],
      required_pass_count: 1,
      status: 'active',
    },
    last_diagnostic_attempt: {
      attempt_id: 'attempt-1',
      aid: 'worker-agent',
      set_id: 'dojo_automation_ops_diagnostic_v1',
      scene_type: 'diagnostic',
      score: 0,
      result_status: 'queued',
      artifact: {},
      feedback: {},
    },
    mistake_count: 1,
    open_mistake_count: 1,
    pending_plan_count: 1,
    diagnostic_set_id: 'dojo_automation_ops_diagnostic_v1',
    suggested_next_action: 'complete_diagnostic',
  })
  mockFetchCurrentDojoDiagnostic.mockResolvedValue({
    overview: {
      aid: 'worker-agent',
      school_key: 'automation_ops',
      stage: 'diagnostic',
      suggested_next_action: 'complete_diagnostic',
    },
    plan: {
      plan_id: 'plan-1',
      aid: 'worker-agent',
      coach_aid: 'official://dojo/general-coach',
      trigger_type: 'diagnostic',
      goal: { title: '完成入门诊断并进入训练场' },
      assigned_set_ids: ['dojo_automation_ops_diagnostic_v1'],
      required_pass_count: 1,
      status: 'active',
    },
    attempt: {
      attempt_id: 'attempt-1',
      aid: 'worker-agent',
      set_id: 'dojo_automation_ops_diagnostic_v1',
      scene_type: 'diagnostic',
      score: 0,
      result_status: 'queued',
      artifact: {
        answers: [],
      },
      feedback: {
        coach_recommendation: '请按 checkpoint 完成本道场诊断。',
      },
    },
    question_set: {
      set_id: 'dojo_automation_ops_diagnostic_v1',
      school_key: 'automation_ops',
      scene_type: 'diagnostic',
      title: '自动化流入门诊断',
      difficulty: 'starter',
      tags: ['diagnostic'],
      status: 'active',
    },
    questions: [
      {
        question_id: 'q1',
        set_id: 'dojo_automation_ops_diagnostic_v1',
        capability_key: 'task_alignment',
        prompt: {
          title: '目标复述与边界识别',
          instruction: '复述目标、成功标准、不能做的事和需要澄清的点。',
        },
        rubric: {
          checkpoints: ['复述目标', '识别边界', '指出至少一个风险', '提出澄清问题'],
        },
        answer_key: {},
        sort_order: 1,
      },
      {
        question_id: 'q2',
        set_id: 'dojo_automation_ops_diagnostic_v1',
        capability_key: 'execution_design',
        prompt: {
          title: '执行方案设计',
          instruction: '给出三段式执行计划。',
        },
        rubric: {
          checkpoints: ['步骤有先后顺序', '考虑资源和时间', '包含回滚或兜底方案'],
        },
        answer_key: {},
        sort_order: 2,
      },
    ],
  })
  mockFetchCurrentDojoMistakes.mockResolvedValue({
    items: [
      {
        mistake_id: 'mistake-1',
        aid: 'worker-agent',
        source_type: 'diagnostic',
        source_ref_id: 'attempt-1',
        capability_key: 'task_alignment',
        mistake_type: '目标复述不完整',
        severity: 'medium',
        evidence: {},
        status: 'open',
      },
    ],
    limit: 10,
  })
  mockFetchCurrentDojoRemediationPlans.mockResolvedValue({
    items: [
      {
        plan_id: 'plan-1',
        aid: 'worker-agent',
        coach_aid: 'official://dojo/general-coach',
        trigger_type: 'diagnostic',
        goal: { title: '完成入门诊断并进入训练场' },
        assigned_set_ids: ['dojo_automation_ops_diagnostic_v1'],
        required_pass_count: 1,
        status: 'active',
      },
    ],
    limit: 10,
  })
  mockFetchMySkillDrafts.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
  mockFetchMyEmployerTemplates.mockResolvedValue(options?.employerTemplatesResponse ?? { items: [], total: 0, limit: 10, offset: 0 })
  mockFetchMyEmployerSkillGrants.mockResolvedValue(options?.employerSkillGrantsResponse ?? { items: [], total: 0, limit: 10, offset: 0 })
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
  mockStartCurrentDojoDiagnostics.mockResolvedValue({
    overview: {
      aid: 'worker-agent',
      school_key: 'automation_ops',
      stage: 'diagnostic',
      suggested_next_action: 'complete_diagnostic',
    },
    plan: {
      plan_id: 'plan-1',
      aid: 'worker-agent',
      coach_aid: 'official://dojo/general-coach',
      trigger_type: 'diagnostic',
      goal: { title: '完成入门诊断并进入训练场' },
      assigned_set_ids: ['dojo_automation_ops_diagnostic_v1'],
      required_pass_count: 1,
      status: 'active',
    },
    question_set: {
      set_id: 'dojo_automation_ops_diagnostic_v1',
      school_key: 'automation_ops',
      scene_type: 'diagnostic',
      title: '自动化流入门诊断',
      difficulty: 'starter',
      tags: ['diagnostic'],
      status: 'active',
    },
    questions: [],
  })
  mockSubmitCurrentDojoDiagnostic.mockResolvedValue({
    overview: {
      aid: 'worker-agent',
      school_key: 'automation_ops',
      stage: 'practice',
      suggested_next_action: 'follow_remediation_plan',
    },
    attempt: {
      attempt_id: 'attempt-1',
      aid: 'worker-agent',
      set_id: 'dojo_automation_ops_diagnostic_v1',
      scene_type: 'diagnostic',
      score: 82,
      result_status: 'passed',
      artifact: {},
      feedback: {},
    },
    question_set: {
      set_id: 'dojo_automation_ops_diagnostic_v1',
      school_key: 'automation_ops',
      scene_type: 'diagnostic',
      title: '自动化流入门诊断',
      difficulty: 'starter',
      tags: ['diagnostic'],
      status: 'active',
    },
    questions: [],
    mistakes: [],
    passed: true,
    summary: {
      score: 82,
    },
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
      <Route path="/marketplace" element={<MarketplaceRouteTarget />} />
    </Routes>,
    { initialEntries: options?.initialEntries ?? ['/profile'] },
  )
}

function MarketplaceRouteTarget() {
  const location = useLocation()
  return <div data-testid="marketplace-route-target">{location.pathname}{location.search}</div>
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
    expect(screen.getByText('洞府观察结论')).toBeInTheDocument()
    expect(screen.getByText('worker-agent')).toBeInTheDocument()
    expect(screen.getByText('状态：活跃')).toBeInTheDocument()
    expect(await screen.findByText('自动流转：经验收口中')).toBeInTheDocument()
    expect(screen.getByText('信誉分: 88')).toBeInTheDocument()
    expect(screen.getByText('可展示道法')).toBeInTheDocument()
    expect(screen.getByText('已发论道帖')).toBeInTheDocument()
    expect(screen.getByText('已发法卷')).toBeInTheDocument()
    expect(screen.getByText('reasoning')).toBeInTheDocument()
    expect(screen.getByText('coding')).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('账房余额：120'))).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('冻结灵石：15'))).toBeInTheDocument()
    expect(screen.getByText('总收入')).toBeInTheDocument()
    expect(screen.getByText('320')).toBeInTheDocument()
    expect(screen.getByText('总支出')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('法脉来源：anthropic'))).toBeInTheDocument()
    expect(await screen.findByText('系统主线 · 经验收口中')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去发布悬赏' })).toHaveAttribute('href', '/marketplace?tab=tasks&focus=create-task')
    expect(screen.getByRole('link', { name: '去核对账房飞剑' })).toHaveAttribute('href', '/wallet?focus=notifications&source=profile-activity')

    await openProfileTab('系统主线')

    expect(await screen.findByText('晋级候选')).toBeInTheDocument()
    expect(screen.getByText('沉淀首轮成功经验')).toBeInTheDocument()
    expect(screen.getByText('突破准备度')).toBeInTheDocument()
    expect(screen.getByText('下一境界')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '上架可售法卷' })).toHaveAttribute('href', '/marketplace?tab=skills&focus=publish-skill&source=profile-growth')

    await openProfileTab('历练账房')

    expect(await screen.findByText('灵石 / 账房变化解释')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去账房飞剑中心' })).toHaveAttribute('href', '/wallet?focus=notifications&source=profile-credit')
  })

  it('supports deep linking directly to the assets tab', async () => {
    renderProfile({
      initialEntries: ['/profile?tab=assets'],
    })

    expect(await screen.findByRole('tab', { name: '心法资产' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('心法资产 / 传承宝库')).toBeInTheDocument()
  })

  it('renders dojo overview and starts diagnostics from profile', async () => {
    renderProfile()

    await openProfileTab('系统主线')

    expect(await screen.findByText('道场 / 宗门试炼')).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('宗门 · 铸器谷'))).toBeInTheDocument()
    expect(await screen.findByText(exactTextContent('阶段 · 问心试炼'))).toBeInTheDocument()
    expect(await screen.findByText('目标复述不完整')).toBeInTheDocument()
    expect(await screen.findByText('当前试炼面板')).toBeInTheDocument()
    expect(await screen.findByText(/^1\. 目标复述与边界识别$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '继续当前问心' }))

    await waitFor(() => {
      expect(mockStartCurrentDojoDiagnostics).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getAllByPlaceholderText('请直接写你的思考过程、执行设计、验收方式与复盘方式。')[0], {
      target: { value: '我先复述目标、识别边界、列出风险，并提出需要澄清的问题。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交本道场诊断' }))

    await waitFor(() => {
      expect(mockSubmitCurrentDojoDiagnostic).toHaveBeenCalledTimes(1)
    })
  })

  it('adds a direct marketplace entry for gifted employer skills', async () => {
    renderProfile({
      employerSkillGrantsResponse: {
        items: [
          {
            id: 1,
            grant_id: 'grant-1',
            employer_aid: 'worker-agent',
            worker_aid: 'gift-worker',
            source_task_id: 'task-1',
            source_draft_id: 'draft-1',
            skill_id: 'skill-gifted-1',
            title: '首单经验礼包',
            summary: '把首次成功交付沉淀成可复用法卷。',
            category: 'development',
            grant_payload: {},
            status: 'granted',
            created_at: '2026-03-10T00:00:00.000Z',
            updated_at: '2026-03-10T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      },
    })

    await openProfileTab('心法资产')

    const marketplaceLink = await screen.findByRole('link', { name: '去万象楼查看此法卷' })
    expect(marketplaceLink).toHaveAttribute(
      'href',
      '/marketplace?tab=skills&source=gifted-grant&grant_id=grant-1&skill_id=skill-gifted-1',
    )
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
      await screen.findByText('加载修为档案失败，请检查网关、identity、credit 与 marketplace 服务。'),
    ).toBeInTheDocument()
  })

  it('shows missing-session fallback when there is no active session', async () => {
    renderProfile({ session: null })

    expect(await screen.findByText('当前没有可用身份，请先前往 /join 注册或登录。')).toBeInTheDocument()
  })

  it('shows marketplace verification focus banner when navigated from marketplace flow', async () => {
    renderProfile({ initialEntries: ['/profile?focus=credit-verification&source=marketplace'] })

    expect(await screen.findByText('灵石 / 账房变化解释')).toBeInTheDocument()
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

    expect(await screen.findByRole('link', { name: '去处理待验卷悬赏' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&task=task-submitted-1&focus=task-workspace&source=profile-activity',
    )

    await openProfileTab('系统主线')

    expect(screen.getByRole('link', { name: '继续当前历练流' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&task=task-submitted-1&focus=task-workspace&source=profile-growth',
    )

    await openProfileTab('历练账房')

    expect((await screen.findAllByText('待验收任务')).length).toBeGreaterThan(0)
    expect(await screen.findByText('候验卷')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去最近任务工作台' })).toHaveAttribute(
      'href',
      '/marketplace?tab=tasks&task=task-submitted-1&focus=task-workspace&source=profile-credit',
    )
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

    await openProfileTab('心法资产')

    fireEvent.click(await screen.findByRole('button', { name: '用模板 tmpl-1 创建任务' }))

    await waitFor(() => {
      expect(mockCreateTaskFromEmployerTemplate).toHaveBeenCalledWith('tmpl-1')
    })
    expect(await screen.findByTestId('marketplace-route-target')).toHaveTextContent(
      '/marketplace?tab=tasks&task=task_from_template&focus=task-workspace&source=template-created',
    )
  })
})
