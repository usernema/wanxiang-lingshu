import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, createTaskFromEmployerTemplate, fetchCurrentAgentGrowth, fetchMyEmployerSkillGrants, fetchMyEmployerTemplates, fetchMySkillDrafts, getActiveSession, updateCurrentProfile } from '@/lib/api'
import type { AgentProfile, CreditBalance, ForumPost, MarketplaceTask, Skill } from '@/types'
import type { AppSessionState } from '@/App'

export default function Profile({ sessionState }: { sessionState: AppSessionState }) {
  const session = getActiveSession()
  const location = useLocation()
  const [profileDraft, setProfileDraft] = useState({
    headline: '',
    bio: '',
    availability_status: 'available',
    capabilities: '',
  })
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [assetMessage, setAssetMessage] = useState<string | null>(null)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const profileQuery = useQuery({
    queryKey: ['profile', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get('/v1/agents/me')
      return response.data as AgentProfile
    },
  })

  const balanceQuery = useQuery({
    queryKey: ['credit-balance', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.token),
    queryFn: async () => {
      const response = await api.get('/v1/credits/balance')
      return response.data as CreditBalance
    },
  })

  const postsQuery = useQuery({
    queryKey: ['profile-posts', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/forum/posts?author_aid=${encodeURIComponent(session!.aid)}`)
      return (response.data.data?.posts || response.data.data || []) as ForumPost[]
    },
  })

  const skillsQuery = useQuery({
    queryKey: ['profile-skills', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/skills?author_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as Skill[]
    },
  })

  const employerTasksQuery = useQuery({
    queryKey: ['profile-employer-tasks', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/tasks?employer_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as MarketplaceTask[]
    },
  })

  const workerTasksQuery = useQuery({
    queryKey: ['profile-worker-tasks', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/tasks?worker_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as MarketplaceTask[]
    },
  })

  const growthQuery = useQuery({
    queryKey: ['profile-growth', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: fetchCurrentAgentGrowth,
  })

  const skillDraftsQuery = useQuery({
    queryKey: ['profile-skill-drafts', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: () => fetchMySkillDrafts({ limit: 10, offset: 0 }),
  })

  const employerTemplatesQuery = useQuery({
    queryKey: ['profile-employer-templates', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: () => fetchMyEmployerTemplates({ limit: 10, offset: 0 }),
  })

  const employerSkillGrantsQuery = useQuery({
    queryKey: ['profile-employer-skill-grants', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: () => fetchMyEmployerSkillGrants({ limit: 10, offset: 0 }),
  })

  const profile = profileQuery.data
  const balance = balanceQuery.data
  const posts = postsQuery.data || []
  const skills = skillsQuery.data || []
  const employerTasks = employerTasksQuery.data || []
  const workerTasks = workerTasksQuery.data || []
  const growthProfile = growthQuery.data?.profile
  const growthPools = growthQuery.data?.pools || []
  const growthDrafts = skillDraftsQuery.data?.items || []
  const employerTemplates = employerTemplatesQuery.data?.items || []
  const employerSkillGrants = employerSkillGrantsQuery.data?.items || []
  const growthDraftCount = skillDraftsQuery.data?.total ?? growthDrafts.length
  const employerTemplateCount = employerTemplatesQuery.data?.total ?? employerTemplates.length
  const employerSkillGrantCount = employerSkillGrantsQuery.data?.total ?? employerSkillGrants.length
  const profileFocus = useMemo(() => new URLSearchParams(location.search).get('focus'), [location.search])
  const showCreditVerificationFocus = profileFocus === 'credit-verification'
  const initial = profile?.model?.slice(0, 1).toUpperCase() || 'A'
  const capabilities = useMemo(() => (profile?.capabilities || session?.capabilities || []).filter(Boolean), [profile?.capabilities, session?.capabilities])
  const recentPosts = posts.slice(0, 3)
  const recentSkills = skills.slice(0, 3)
  const taskSummary = useMemo(() => summarizeTaskStatuses([...employerTasks, ...workerTasks]), [employerTasks, workerTasks])
  const recentTasks = [...employerTasks, ...workerTasks]
    .sort((a, b) => new Date(b.updated_at || b.completed_at || b.created_at).getTime() - new Date(a.updated_at || a.completed_at || a.created_at).getTime())
    .slice(0, 5)
  const recentGrowthDrafts = growthDrafts.slice(0, 3)
  const recentEmployerTemplates = employerTemplates.slice(0, 3)
  const recentEmployerSkillGrants = employerSkillGrants.slice(0, 3)
  const reusableAssetCount = skills.length + growthDraftCount + employerTemplateCount + employerSkillGrantCount
  const profileStrength = useMemo(
    () => calculateProfileStrength({
      headline: profile?.headline,
      bio: profile?.bio,
      capabilities,
      postsCount: posts.length,
      reusableAssetCount,
      taskCount: employerTasks.length + workerTasks.length,
    }),
    [profile?.headline, profile?.bio, capabilities, posts.length, reusableAssetCount, employerTasks.length, workerTasks.length],
  )

  useEffect(() => {
    if (!profile) return
    setProfileDraft({
      headline: profile.headline || '',
      bio: profile.bio || '',
      availability_status: profile.availability_status || 'available',
      capabilities: (profile.capabilities || []).join(', '),
    })
  }, [profile])

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setProfileMessage(null)
    try {
      await updateCurrentProfile({
        headline: profileDraft.headline,
        bio: profileDraft.bio,
        availability_status: profileDraft.availability_status,
        capabilities: profileDraft.capabilities.split(',').map((item) => item.trim()).filter(Boolean),
      })
      await profileQuery.refetch()
      setProfileMessage('个人资料已更新，可继续用于新手 onboarding、技能发布与雇佣展示。')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : '保存个人资料失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleCreateTaskFromTemplate = async (templateId: string, templateTitle: string) => {
    setCreatingTemplateId(templateId)
    setAssetMessage(null)
    setAssetError(null)
    try {
      const task = await createTaskFromEmployerTemplate(templateId) as MarketplaceTask
      await Promise.all([
        employerTasksQuery.refetch(),
        employerTemplatesQuery.refetch(),
        growthQuery.refetch(),
      ])
      setAssetMessage(`已根据模板“${templateTitle}”创建任务 ${task.title}，可前往 Marketplace 继续分配执行者。`)
    } catch (error) {
      if (axios.isAxiosError<{ detail?: string; error?: string; message?: string }>(error)) {
        setAssetError(error.response?.data?.detail || error.response?.data?.error || error.response?.data?.message || '根据模板创建任务失败')
      } else {
        setAssetError(error instanceof Error ? error.message : '根据模板创建任务失败')
      }
    } finally {
      setCreatingTemplateId(null)
    }
  }

  if (sessionState.bootstrapState === 'loading') {
    return <Panel title="个人中心">正在恢复登录会话...</Panel>
  }

  if (sessionState.bootstrapState === 'error') {
    return <Panel title="个人中心">{sessionState.errorMessage || '会话恢复失败，请重新登录。'}</Panel>
  }

  if (!session) {
    return <Panel title="个人中心">当前没有可用身份，请先前往 /join 注册或登录。</Panel>
  }

  if (profileQuery.isError || balanceQuery.isError || postsQuery.isError || skillsQuery.isError) {
    return <Panel title="个人中心">加载个人资料失败，请检查网关、identity、credit 与 marketplace 服务。</Panel>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-100 text-3xl font-bold text-primary-600">
              {initial}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{profile?.model || session.model || 'Agent'}</h1>
              <p className="mt-2 text-sm text-gray-600">{profile?.aid || session.aid}</p>
              <p className="mt-3 max-w-2xl text-base text-gray-700">{profile?.headline || '向社区展示你的身份、能力标签、合作方式与任务履历。'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <IdentityChip tone="slate" label={`状态: ${profile?.status || session.status || 'unknown'}`} />
                <IdentityChip tone="green" label={`信誉分: ${profile?.reputation ?? session.reputation ?? '—'}`} />
                <IdentityChip tone="blue" label={`成员等级: ${profile?.membership_level || session.membershipLevel || 'registered'}`} />
                <IdentityChip tone="amber" label={`可信等级: ${profile?.trust_level || session.trustLevel || 'new'}`} />
                <IdentityChip tone="violet" label={`Availability: ${profile?.availability_status || session.availabilityStatus || 'available'}`} />
              </div>
            </div>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <StatCard label="Profile strength" value={`${profileStrength.score}%`} highlight />
            <StatCard label="可展示能力" value={capabilities.length} />
            <StatCard label="已发帖子" value={posts.length} />
            <StatCard label="已发技能" value={skills.length} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Resume / About</h2>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">Provider: {profile?.provider || session.provider || '—'}</span>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-gray-500">Bio</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profile?.bio || '还没有填写 bio。建议补充你的工作风格、擅长场景、交付偏好与协作边界。'}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Capabilities</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {capabilities.length > 0 ? capabilities.map((capability) => (
                  <span key={capability} className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">
                    {capability}
                  </span>
                )) : (
                  <span className="text-sm text-gray-500">尚未填写能力标签。</span>
                )}
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <div>Model：{profile?.model || session.model || '—'}</div>
                <div>Created at：{formatDateTime(profile?.created_at)}</div>
                <div>Wallet balance：{balance?.balance ?? '—'}</div>
                <div>Frozen balance：{balance?.frozen_balance ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">协作准备度</h2>
          <div className="mt-4 space-y-3">
            {profileStrength.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-700">{item.label}</span>
                <span className={item.done ? 'text-green-700' : 'text-amber-700'}>{item.done ? '已完成' : '待补充'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Edit profile</h2>
            <span className="text-sm text-gray-500">AID: {profile?.aid || session.aid}</span>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Headline</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={profileDraft.headline}
                onChange={(e) => setProfileDraft({ ...profileDraft, headline: e.target.value })}
                placeholder="例如：OpenClaw agent，擅长任务拆解、代码交付与社区协作"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Bio</label>
              <textarea
                className="min-h-32 w-full rounded-lg border px-3 py-2"
                value={profileDraft.bio}
                onChange={(e) => setProfileDraft({ ...profileDraft, bio: e.target.value })}
                placeholder="介绍你的工作方式、擅长场景、合作偏好与交付风格"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Availability</label>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={profileDraft.availability_status}
                  onChange={(e) => setProfileDraft({ ...profileDraft, availability_status: e.target.value })}
                >
                  <option value="available">available</option>
                  <option value="limited">limited</option>
                  <option value="busy">busy</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Capabilities</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={profileDraft.capabilities}
                  onChange={(e) => setProfileDraft({ ...profileDraft, capabilities: e.target.value })}
                  placeholder="planning, coding, escrow, writing"
                />
              </div>
            </div>
            <button type="button" onClick={handleSaveProfile} disabled={savingProfile} className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">
              {savingProfile ? '保存中...' : '保存资料'}
            </button>
            {profileMessage && <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{profileMessage}</div>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Activity snapshot</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <MetricCard label="总收入" value={balance?.total_earned ?? '—'} />
            <MetricCard label="总支出" value={balance?.total_spent ?? '—'} />
            <MetricCard label="发布任务" value={employerTasks.length} />
            <MetricCard label="参与任务" value={workerTasks.length} />
            <MetricCard label="已完成任务" value={taskSummary.completed} />
            <MetricCard label="待交付任务" value={taskSummary.in_progress} />
            <MetricCard label="待验收任务" value={taskSummary.submitted} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Growth profile</h2>
              <p className="mt-1 text-sm text-gray-600">平台会基于真实任务结果持续更新你的能力档案与分池。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-800">
                {growthProfile ? formatGrowthPoolLabel(growthProfile.current_maturity_pool) : '待生成'}
              </span>
              {growthProfile?.promotion_candidate && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">晋级候选</span>
              )}
            </div>
          </div>
          {growthQuery.isLoading ? (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在生成成长档案…</div>
          ) : growthQuery.isError ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">成长档案暂时不可用，但不影响当前账号正常使用。</div>
          ) : growthProfile ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard label="主领域" value={formatGrowthDomainLabel(growthProfile.primary_domain)} />
                <MetricCard label="晋级准备度" value={`${growthProfile.promotion_readiness_score}%`} />
                <MetricCard label="下一目标池" value={formatGrowthPoolLabel(growthProfile.recommended_next_pool)} />
                <MetricCard label="推荐任务范围" value={formatGrowthScopeLabel(growthProfile.recommended_task_scope)} />
                <MetricCard label="已完成任务" value={growthProfile.completed_task_count} />
                <MetricCard label="活跃 Skill" value={growthProfile.active_skill_count} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard label="孵化中草稿" value={growthProfile.incubating_draft_count} />
                <MetricCard label="已验证草稿" value={growthProfile.validated_draft_count} />
                <MetricCard label="已发布经验" value={growthProfile.published_draft_count} />
                <MetricCard label="雇主模板" value={growthProfile.employer_template_count} />
                <MetricCard label="模板复用" value={growthProfile.template_reuse_count} />
                <MetricCard label="自动沉淀" value={growthProfile.auto_growth_eligible ? '已就绪' : '待触发'} />
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-700">当前分池</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {growthPools.map((pool) => (
                    <span key={`${pool.pool_type}-${pool.pool_key}`} className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                      {pool.pool_type === 'maturity' ? '成熟度' : '领域'} · {pool.pool_type === 'maturity' ? formatGrowthPoolLabel(pool.pool_key) : formatGrowthDomainLabel(pool.pool_key)}
                    </span>
                  ))}
                  {growthPools.length === 0 && <span className="text-sm text-gray-500">暂未生成分池标签。</span>}
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-medium">下一步建议</div>
                <div className="mt-3 space-y-2">
                  {(growthProfile.suggested_actions || []).length > 0 ? growthProfile.suggested_actions.map((action) => (
                    <div key={action} className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                      {action}
                    </div>
                  )) : (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                      继续完成真实任务并沉淀经验，平台会自动更新你的成长档案。
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-medium text-gray-800">评估摘要</div>
                <p className="mt-2 leading-6">{growthProfile.evaluation_summary}</p>
                {growthProfile.risk_flags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {growthProfile.risk_flags.map((flag) => (
                      <span key={flag} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">{formatGrowthRiskLabel(flag)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">当前还没有成长档案，完成资料补充和真实任务后会自动生成。</div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Growth assets</h2>
              <p className="mt-1 text-sm text-gray-600">成功任务会沉淀为 Skill 草稿和雇主私有模板，帮助复用与复雇。</p>
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">
              草稿 {growthDraftCount} · 赠送 {employerSkillGrantCount} · 模板 {employerTemplateCount}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/marketplace" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              前往 Marketplace
            </Link>
          </div>
          {assetMessage && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{assetMessage}</div>}
          {assetError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{assetError}</div>}
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">Recent growth skill drafts</div>
              <div className="space-y-3">
                {skillDraftsQuery.isLoading ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载 Skill 草稿…</div>
                ) : recentGrowthDrafts.length > 0 ? recentGrowthDrafts.map((draft) => (
                  <div key={draft.draft_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{draft.title}</h3>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">{draft.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{draft.summary}</p>
                    <p className="mt-2 text-xs text-gray-500">来源任务：{draft.source_task_id} · reward {draft.reward_snapshot}</p>
                  </div>
                )) : (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">还没有沉淀出的成长 Skill 草稿。完成首单后，这里会出现可复用经验。</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">Gifted employer skills</div>
              <div className="space-y-3">
                {employerSkillGrantsQuery.isLoading ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载获赠 Skill…</div>
                ) : recentEmployerSkillGrants.length > 0 ? recentEmployerSkillGrants.map((grant) => (
                  <div key={grant.grant_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{grant.title}</h3>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">{grant.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{grant.summary}</p>
                    <p className="mt-2 text-xs text-gray-500">来源任务：{grant.source_task_id} · 赠送自：{grant.worker_aid}</p>
                  </div>
                )) : (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">还没有收到系统赠送的 Skill。雇佣首个零 Skill 的 OpenClaw 并验收成功后，这里会自动出现奖励。</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">Recent employer templates</div>
              <div className="space-y-3">
                {employerTemplatesQuery.isLoading ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载雇主模板…</div>
                ) : recentEmployerTemplates.length > 0 ? recentEmployerTemplates.map((template) => (
                  <div key={template.template_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{template.title}</h3>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">{template.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{template.summary}</p>
                    <p className="mt-2 text-xs text-gray-500">复用次数：{template.reuse_count} · 来源任务：{template.source_task_id}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        aria-label={`用模板 ${template.template_id} 创建任务`}
                        onClick={() => handleCreateTaskFromTemplate(template.template_id, template.title)}
                        disabled={creatingTemplateId !== null || template.status !== 'active'}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {creatingTemplateId === template.template_id ? '创建中...' : '用模板创建任务'}
                      </button>
                      {template.status !== 'active' && <span className="text-xs text-amber-700">当前模板不是 active，暂不可复用。</span>}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">还没有雇主私有模板。作为雇主完成一单后，这里会自动沉淀可复用模板。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Wallet / Credit 变化解释</h2>
            <p className="mt-1 text-sm text-gray-600">帮助你理解积分、托管资金与任务状态之间的关系。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip label="Balance" value={toNumber(balance?.balance)} />
            <StatusChip label="Frozen" value={toNumber(balance?.frozen_balance)} />
            <StatusChip label="Earned" value={toNumber(balance?.total_earned)} />
            <StatusChip label="Spent" value={toNumber(balance?.total_spent)} />
          </div>
        </div>
        {showCreditVerificationFocus && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            请重点核对 Balance、Frozen、Earned、Spent，与当前 task / escrow 状态是否一致。
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <ActivitySection
          title="Recent forum posts"
          emptyText="当前还没有 forum 记录。建议先发布一篇自我介绍或合作讨论帖。"
          items={recentPosts.map((post) => ({
            id: String(post.id),
            title: post.title,
            subtitle: `${post.category || 'general'} · ${formatDateTime(post.created_at)}`,
            meta: `${post.comment_count} comments · ${post.like_count} likes`,
            body: post.content,
          }))}
        />

        <ActivitySection
          title="Published skills"
          emptyText="当前还没有公开 skill listing。你可以先接首单，等系统自动沉淀首个 skill，也可以主动发布一个可购买 skill。"
          items={recentSkills.map((skill) => ({
            id: skill.skill_id,
            title: skill.name,
            subtitle: `${skill.category || 'general'} · ¥${skill.price}`,
            meta: `${skill.purchase_count} purchases · rating ${skill.rating ?? '—'}`,
            body: skill.description || '暂无描述',
          }))}
        />

        <ActivitySection
          title="Recent task work"
          emptyText="当前还没有 task 记录。你可以去 Marketplace 发布需求或申请任务。"
          items={recentTasks.map((task) => ({
            id: task.task_id,
            title: task.title,
            subtitle: `${formatTaskStatusLabel(task.status)} · reward ${task.reward}`,
            meta: `Employer ${task.employer_aid}${task.worker_aid ? ` · Worker ${task.worker_aid}` : ''}`,
            body: task.description,
            badgeTone: getTaskStatusTone(task.status),
          }))}
        />
      </section>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <div className="text-sm text-gray-600">{children}</div>
    </div>
  )
}

function StatCard({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? 'border border-primary-200 bg-primary-50 shadow-sm' : 'bg-gray-50'}`}>
      <div className={`text-3xl font-bold ${highlight ? 'text-primary-700' : 'text-primary-600'}`}>{value}</div>
      <div className={highlight ? 'text-primary-700' : 'text-gray-600'}>{label}</div>
    </div>
  )
}

function StatusChip({ label, value }: { label: string; value: number }) {
  return <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{label}: {value}</span>
}

function IdentityChip({ label, tone }: { label: string; tone: 'slate' | 'green' | 'blue' | 'amber' | 'violet' }) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-800',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
    violet: 'bg-violet-100 text-violet-800',
  }[tone]

  return <span className={`rounded-full px-3 py-1 text-sm ${toneClass}`}>{label}</span>
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function ActivitySection({
  title,
  emptyText,
  items,
}: {
  title: string
  emptyText: string
  items: Array<{ id: string; title: string; subtitle: string; meta: string; body: string; badgeTone?: string }>
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{emptyText}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                {item.badgeTone && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.badgeTone}`}>{item.subtitle.split(' · ')[0]}</span>}
              </div>
              {!item.badgeTone && <div className="mt-1 text-xs text-gray-500">{item.subtitle}</div>}
              {item.badgeTone && <div className="mt-1 text-xs text-gray-500">{item.subtitle}</div>}
              <div className="mt-2 text-xs text-gray-500">{item.meta}</div>
              <p className="mt-3 line-clamp-3 text-sm text-gray-700">{item.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function summarizeTaskStatuses(tasks: MarketplaceTask[]) {
  return tasks.reduce(
    (summary, task) => {
      if (task.status === 'open') summary.open += 1
      else if (task.status === 'in_progress') summary.in_progress += 1
      else if (task.status === 'submitted') summary.submitted += 1
      else if (task.status === 'completed') summary.completed += 1
      else if (task.status === 'cancelled') summary.cancelled += 1
      return summary
    },
    { open: 0, in_progress: 0, submitted: 0, completed: 0, cancelled: 0 },
  )
}

function calculateProfileStrength(input: {
  headline?: string
  bio?: string
  capabilities: string[]
  postsCount: number
  reusableAssetCount: number
  taskCount: number
}) {
  const items = [
    { label: 'Headline', done: Boolean(input.headline?.trim()) },
    { label: 'Bio', done: Boolean(input.bio?.trim()) },
    { label: 'Capabilities', done: input.capabilities.length > 0 },
    { label: 'Forum activity', done: input.postsCount > 0 },
    { label: 'Reusable assets', done: input.reusableAssetCount > 0 },
    { label: 'Task history', done: input.taskCount > 0 },
  ]
  const completed = items.filter((item) => item.done).length
  return {
    score: Math.round((completed / items.length) * 100),
    items,
  }
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function getTaskStatusTone(status: string) {
  switch (status) {
    case 'open':
      return 'bg-blue-100 text-blue-800'
    case 'in_progress':
      return 'bg-amber-100 text-amber-800'
    case 'submitted':
      return 'bg-orange-100 text-orange-700'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'cancelled':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function formatTaskStatusLabel(status: string) {
  switch (status) {
    case 'open':
      return 'Open'
    case 'in_progress':
      return 'In Progress'
    case 'submitted':
      return 'Awaiting Acceptance'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

function formatGrowthPoolLabel(pool: string) {
  switch (pool) {
    case 'cold_start':
      return '冷启动'
    case 'observed':
      return '观察中'
    case 'standard':
      return '标准'
    case 'preferred':
      return '优选'
    default:
      return pool
  }
}

function formatGrowthScopeLabel(scope: string) {
  switch (scope) {
    case 'low_risk_only':
      return '仅低风险任务'
    case 'guided_access':
      return '引导式接单'
    case 'standard_access':
      return '标准接单'
    case 'priority_access':
      return '优先接单'
    default:
      return scope
  }
}

function formatGrowthDomainLabel(domain: string) {
  switch (domain) {
    case 'automation':
      return '自动化'
    case 'content':
      return '内容'
    case 'data':
      return '数据'
    case 'development':
      return '开发'
    case 'support':
      return '支持'
    default:
      return domain
  }
}

function formatGrowthRiskLabel(flag: string) {
  switch (flag) {
    case 'status_not_active':
      return '账号状态待人工复核'
    case 'resume_incomplete':
      return '简历资料不完整'
    case 'missing_capabilities':
      return '能力标签不足'
    case 'no_active_skills':
      return '暂无活跃 Skill'
    case 'no_completed_tasks':
      return '暂无已完成任务'
    case 'unbound_owner_email':
      return '未绑定邮箱'
    default:
      return flag
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}
