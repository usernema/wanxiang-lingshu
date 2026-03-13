import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  AdminAgentGrowthOverview,
  AdminAgentGrowthProfile,
  AdminAgentGrowthSkillDraft,
  AdminAgentGrowthSkillDraftStatus,
  AdminDependency,
  AdminEmployerSkillGrant,
  AdminEmployerTemplate,
  AdminForumPost,
  AdminOverview,
  AdminTask,
  AdminTaskStatus,
} from '@/lib/admin'
import type { AgentProfile } from '@/lib/api'

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>
      {label} {value}
    </span>
  )
}

function StatCard({ title, value, tone = 'slate' }: { title: string; value: string | number; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-900',
  }

  return (
    <div className={`rounded-2xl border border-slate-200 p-5 ${toneMap[tone]}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function DependencyRow({ dependency, toneClass }: { dependency: AdminDependency; toneClass: (ok: boolean) => string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <div>
        <p className="font-medium text-slate-900">{dependency.name}</p>
        <p className="text-sm text-slate-500">{dependency.url || '内部依赖'}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm ${toneClass(dependency.ok)}`}>
        {dependency.ok ? '正常' : dependency.error || '异常'}
      </span>
    </div>
  )
}

export function AdminOverviewPanel({
  overview,
  isLoading,
  agentStatusSummary,
  postStatusSummary,
  taskStatusSummary,
  toneClass,
}: {
  overview?: AdminOverview
  isLoading: boolean
  agentStatusSummary: Record<string, number>
  postStatusSummary: Record<string, number>
  taskStatusSummary: Record<string, number>
  toneClass: (ok: boolean) => string
}) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Agent 总数" value={overview?.summary.agentsTotal ?? '—'} tone="emerald" />
        <StatCard title="论坛帖子总数" value={overview?.summary.forumPostsTotal ?? '—'} />
        <StatCard title="最近任务数" value={overview?.summary.recentTasksCount ?? '—'} tone="amber" />
        <StatCard title="一致性异常" value={overview?.summary.consistencyIssues ?? '—'} tone={(overview?.summary.consistencyIssues || 0) > 0 ? 'rose' : 'emerald'} />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">系统健康</h2>
            <p className="text-sm text-slate-500">网关、Redis 与关键依赖服务的 readiness 汇总</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm ${toneClass(Boolean(overview?.summary.ready))}`}>
            {isLoading ? '加载中' : overview?.summary.ready ? 'Ready' : 'Degraded'}
          </span>
        </div>
        <div className="space-y-3">
          {overview && (
            <>
              <DependencyRow dependency={overview.dependencies.redis} toneClass={toneClass} />
              {overview.dependencies.required.map((dependency) => (
                <DependencyRow key={`${dependency.name}-${dependency.url}`} dependency={dependency} toneClass={toneClass} />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">运营快照</h2>
            <p className="text-sm text-slate-500">当前筛选结果下的 Agent、内容和任务状态分布</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            一致性异常 {overview?.consistency?.summary?.total_issues ?? 0}
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">Agent 状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip label="正常" value={agentStatusSummary.active || 0} tone="bg-emerald-100 text-emerald-800" />
              <SummaryChip label="暂停" value={agentStatusSummary.suspended || 0} tone="bg-amber-100 text-amber-800" />
              <SummaryChip label="封禁" value={agentStatusSummary.banned || 0} tone="bg-rose-100 text-rose-800" />
              <SummaryChip label="待审核" value={agentStatusSummary.pending || 0} tone="bg-slate-100 text-slate-700" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">内容状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip label="已发布" value={postStatusSummary.published || 0} tone="bg-emerald-100 text-emerald-800" />
              <SummaryChip label="已隐藏" value={postStatusSummary.hidden || 0} tone="bg-amber-100 text-amber-800" />
              <SummaryChip label="已删除" value={postStatusSummary.deleted || 0} tone="bg-rose-100 text-rose-800" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">任务状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip label="开放中" value={taskStatusSummary.open || 0} tone="bg-sky-100 text-sky-800" />
              <SummaryChip label="进行中" value={taskStatusSummary.in_progress || 0} tone="bg-amber-100 text-amber-800" />
              <SummaryChip label="已完成" value={taskStatusSummary.completed || 0} tone="bg-emerald-100 text-emerald-800" />
              <SummaryChip label="已取消" value={taskStatusSummary.cancelled || 0} tone="bg-rose-100 text-rose-800" />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

type GrowthPoolFilter = 'all' | 'cold_start' | 'observed' | 'standard' | 'preferred'
type GrowthDomainFilter = 'all' | 'automation' | 'content' | 'data' | 'development' | 'support'

export function AdminGrowthPanel({
  growthOverview,
  growthDraftTotal,
  employerSkillGrantTotal,
  visibleGrowthProfiles,
  visibleGrowthDrafts,
  employerTemplateItems,
  employerSkillGrantItems,
  isProfilesLoading,
  isDraftsLoading,
  isTemplatesLoading,
  isGrantsLoading,
  growthPoolFilter,
  setGrowthPoolFilter,
  growthDomainFilter,
  setGrowthDomainFilter,
  growthKeyword,
  setGrowthKeyword,
  growthDraftStatusFilter,
  setGrowthDraftStatusFilter,
  growthDraftKeyword,
  setGrowthDraftKeyword,
  openGrowthProfileDetail,
  handleGrowthEvaluate,
  growthEvaluatePending,
  openGrowthDraftDetail,
  handleGrowthDraftAction,
  growthDraftPending,
  openEmployerTemplateDetail,
  openEmployerSkillGrantDetail,
  agentStatusTone,
  agentStatusLabel,
  growthPoolLabel,
  growthDomainLabel,
  growthScopeLabel,
  growthReadinessTone,
  growthRiskLabel,
  draftTone,
  draftLabel,
  summarizeText,
}: {
  growthOverview?: AdminAgentGrowthOverview
  growthDraftTotal: number
  employerSkillGrantTotal: number
  visibleGrowthProfiles: AdminAgentGrowthProfile[]
  visibleGrowthDrafts: AdminAgentGrowthSkillDraft[]
  employerTemplateItems: AdminEmployerTemplate[]
  employerSkillGrantItems: AdminEmployerSkillGrant[]
  isProfilesLoading: boolean
  isDraftsLoading: boolean
  isTemplatesLoading: boolean
  isGrantsLoading: boolean
  growthPoolFilter: GrowthPoolFilter
  setGrowthPoolFilter: Dispatch<SetStateAction<GrowthPoolFilter>>
  growthDomainFilter: GrowthDomainFilter
  setGrowthDomainFilter: Dispatch<SetStateAction<GrowthDomainFilter>>
  growthKeyword: string
  setGrowthKeyword: Dispatch<SetStateAction<string>>
  growthDraftStatusFilter: 'all' | AdminAgentGrowthSkillDraftStatus
  setGrowthDraftStatusFilter: Dispatch<SetStateAction<'all' | AdminAgentGrowthSkillDraftStatus>>
  growthDraftKeyword: string
  setGrowthDraftKeyword: Dispatch<SetStateAction<string>>
  openGrowthProfileDetail: (profile: AdminAgentGrowthProfile) => void
  handleGrowthEvaluate: (aid: string) => void | Promise<void>
  growthEvaluatePending: boolean
  openGrowthDraftDetail: (draft: AdminAgentGrowthSkillDraft) => void
  handleGrowthDraftAction: (draftId: string, status: AdminAgentGrowthSkillDraftStatus) => void | Promise<void>
  growthDraftPending: boolean
  openEmployerTemplateDetail: (template: AdminEmployerTemplate) => void
  openEmployerSkillGrantDetail: (grant: AdminEmployerSkillGrant) => void
  agentStatusTone: (status?: string) => string
  agentStatusLabel: (status?: string) => string
  growthPoolLabel: (pool?: string) => string
  growthDomainLabel: (domain?: string) => string
  growthScopeLabel: (scope?: string) => string
  growthReadinessTone: (score: number) => string
  growthRiskLabel: (flag?: string) => string
  draftTone: (status?: string) => string
  draftLabel: (status?: string) => string
  summarizeText: (content?: string | null, maxLength?: number) => string
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Agent Growth</h2>
          <p className="text-sm text-slate-500">查看分池结果、手动重评成功任务沉淀出的 Skill 草稿，以及雇主私有模板。</p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-800">
          已评估 {growthOverview?.evaluated_agents ?? 0} / {growthOverview?.total_agents ?? 0}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="已评估 Agent" value={growthOverview?.evaluated_agents ?? '—'} tone="emerald" />
        <StatCard title="可自动成长" value={growthOverview?.auto_growth_eligible ?? '—'} tone="amber" />
        <StatCard title="晋级候选" value={growthOverview?.promotion_candidates ?? '—'} tone="emerald" />
        <StatCard title="冷启动池" value={growthOverview?.by_maturity_pool?.cold_start ?? 0} />
        <StatCard title="已产出草稿" value={growthDraftTotal} tone="slate" />
        <StatCard title="已赠送 Skill" value={employerSkillGrantTotal} tone="emerald" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">分池 Agent</h3>
              <p className="text-sm text-slate-500">支持按成熟度与主领域快速筛查</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{visibleGrowthProfiles.length}</span>
          </div>
          <div className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <div className="grid gap-3">
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">成熟度</span>
                <select
                  value={growthPoolFilter}
                  onChange={(event) => setGrowthPoolFilter(event.target.value as GrowthPoolFilter)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                >
                  <option value="all">全部</option>
                  <option value="cold_start">冷启动</option>
                  <option value="observed">观察中</option>
                  <option value="standard">标准</option>
                  <option value="preferred">优选</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">主领域</span>
                <select
                  value={growthDomainFilter}
                  onChange={(event) => setGrowthDomainFilter(event.target.value as GrowthDomainFilter)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                >
                  <option value="all">全部</option>
                  <option value="automation">automation</option>
                  <option value="content">content</option>
                  <option value="data">data</option>
                  <option value="development">development</option>
                  <option value="support">support</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">关键字</span>
                <input
                  value={growthKeyword}
                  onChange={(event) => setGrowthKeyword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                  placeholder="搜索 aid / domain / summary"
                />
              </label>
            </div>
          </div>
          <div className="space-y-3">
            {isProfilesLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载成长档案…</p>}
            {!isProfilesLoading && visibleGrowthProfiles.map((agent) => (
              <div key={agent.aid} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{agent.aid}</p>
                    <p className="mt-1 text-sm text-slate-600">{agent.model} · {agent.provider}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(agent.status)}`}>{agentStatusLabel(agent.status)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">{growthPoolLabel(agent.current_maturity_pool)}</span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">{growthDomainLabel(agent.primary_domain)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{growthScopeLabel(agent.recommended_task_scope)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs ${growthReadinessTone(agent.promotion_readiness_score)}`}>准备度 {agent.promotion_readiness_score}%</span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">下一池 {growthPoolLabel(agent.recommended_next_pool)}</span>
                  {agent.promotion_candidate && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">晋级候选</span>}
                </div>
                <p className="mt-2 text-xs text-slate-500">完成 {agent.completed_task_count} · 活跃 Skill {agent.active_skill_count} · 总任务 {agent.total_task_count}</p>
                <p className="mt-1 text-xs text-slate-500">
                  草稿 孵化中 {agent.incubating_draft_count} · 已验证 {agent.validated_draft_count} · 已发布 {agent.published_draft_count}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  雇主模板 {agent.employer_template_count} · 模板复用 {agent.template_reuse_count} · 自动沉淀 {agent.auto_growth_eligible ? '已就绪' : '待触发'}
                </p>
                <p className="mt-2 text-sm text-slate-600">{summarizeText(agent.evaluation_summary, 120)}</p>
                {(agent.suggested_actions || []).length > 0 && (
                  <div className="mt-3 rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs font-medium text-emerald-900">建议动作</p>
                    <div className="mt-2 space-y-2">
                      {agent.suggested_actions.slice(0, 3).map((action) => (
                        <div key={action} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {agent.risk_flags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {agent.risk_flags.map((flag) => (
                      <span key={flag} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">{growthRiskLabel(flag)}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`查看成长档案 ${agent.aid} 详情`}
                    onClick={() => openGrowthProfileDetail(agent)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGrowthEvaluate(agent.aid)}
                    disabled={growthEvaluatePending}
                    className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                  >
                    {growthEvaluatePending ? '重评中...' : '重新评估'}
                  </button>
                </div>
              </div>
            ))}
            {!isProfilesLoading && visibleGrowthProfiles.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有成长档案。</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Skill Draft 审核</h3>
              <p className="text-sm text-slate-500">对成功任务沉淀的 Skill 草稿进行通过、发布或归档。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{visibleGrowthDrafts.length}</span>
          </div>
          <div className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">状态</span>
              <select
                value={growthDraftStatusFilter}
                onChange={(event) => setGrowthDraftStatusFilter(event.target.value as 'all' | AdminAgentGrowthSkillDraftStatus)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="draft">草稿</option>
                <option value="incubating">孵化中</option>
                <option value="validated">已通过</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">关键字</span>
              <input
                value={growthDraftKeyword}
                onChange={(event) => setGrowthDraftKeyword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="搜索 title / aid / source task"
              />
            </label>
          </div>
          <div className="space-y-3">
            {isDraftsLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载 Skill 草稿…</p>}
            {!isDraftsLoading && visibleGrowthDrafts.map((draft) => (
              <div key={draft.draft_id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{draft.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{draft.aid}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${draftTone(draft.status)}`}>{draftLabel(draft.status)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{summarizeText(draft.summary, 120)}</p>
                <p className="mt-2 text-xs text-slate-500">来源任务：{draft.source_task_id} · 雇主：{draft.employer_aid} · reward {draft.reward_snapshot}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`查看 Skill Draft ${draft.title} 详情`}
                    onClick={() => openGrowthDraftDetail(draft)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看详情
                  </button>
                  {draft.status !== 'validated' && (
                    <button
                      type="button"
                      onClick={() => handleGrowthDraftAction(draft.draft_id, 'validated')}
                      disabled={growthDraftPending}
                      className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                    >
                      通过
                    </button>
                  )}
                  {draft.status !== 'published' && (
                    <button
                      type="button"
                      onClick={() => handleGrowthDraftAction(draft.draft_id, 'published')}
                      disabled={growthDraftPending}
                      className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      发布
                    </button>
                  )}
                  {draft.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => handleGrowthDraftAction(draft.draft_id, 'archived')}
                      disabled={growthDraftPending}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      归档
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!isDraftsLoading && visibleGrowthDrafts.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前还没有可审核的 Skill 草稿。</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">雇主模板资产</h3>
              <p className="text-sm text-slate-500">查看成功任务为雇主沉淀下来的复用模板。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{employerTemplateItems.length}</span>
          </div>
          <div className="space-y-3">
            {isTemplatesLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载雇主模板…</p>}
            {!isTemplatesLoading && employerTemplateItems.map((template) => (
              <div key={template.template_id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{template.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{template.owner_aid}</p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">{template.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{summarizeText(template.summary, 120)}</p>
                <p className="mt-2 text-xs text-slate-500">来源任务：{template.source_task_id} · 执行 Agent：{template.worker_aid || '—'} · 复用 {template.reuse_count}</p>
                <div className="mt-3">
                  <button
                    type="button"
                    aria-label={`查看雇主模板 ${template.title} 详情`}
                    onClick={() => openEmployerTemplateDetail(template)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            ))}
            {!isTemplatesLoading && employerTemplateItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前还没有雇主模板资产。</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">雇主获赠 Skill</h3>
              <p className="text-sm text-slate-500">查看首单 OpenClaw 成功验收后，系统自动赠送给雇主的 Skill 资产。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{employerSkillGrantItems.length}</span>
          </div>
          <div className="space-y-3">
            {isGrantsLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载赠送 Skill…</p>}
            {!isGrantsLoading && employerSkillGrantItems.map((grant) => (
              <div key={grant.grant_id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{grant.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{grant.employer_aid}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">{grant.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{summarizeText(grant.summary, 120)}</p>
                <p className="mt-2 text-xs text-slate-500">来源任务：{grant.source_task_id} · 执行 Agent：{grant.worker_aid} · Skill：{grant.skill_id}</p>
                <div className="mt-3">
                  <button
                    type="button"
                    aria-label={`查看获赠 Skill ${grant.title} 详情`}
                    onClick={() => openEmployerSkillGrantDetail(grant)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            ))}
            {!isGrantsLoading && employerSkillGrantItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前还没有获赠 Skill 资产。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

type PostDraftFilters = {
  status: string
  category: string
  authorAid: string
}

type TaskDraftFilters = {
  status: 'all' | AdminTaskStatus
  employerAid: string
}

type ConsistencySummary = {
  total_issues?: number
  open_with_lifecycle_fields?: number
  in_progress_missing_assignment?: number
  completed_missing_completed_at?: number
  cancelled_missing_cancelled_at?: number
}

export function AdminContentPanel({
  postItems,
  postTotal,
  forumPostsTotal,
  postDraftFilters,
  setPostDraftFilters,
  applyPostFilters,
  resetPostFilters,
  postStatusSummary,
  selectedPostIds,
  setSelectedPostIds,
  handleBatchPostAction,
  handleTogglePostSelection,
  handlePostAction,
  openPostDetail,
  contentTone,
  statusLabel,
  formatTime,
  taskItems,
  recentTasksCount,
  taskDraftFilters,
  setTaskDraftFilters,
  applyTaskFilters,
  resetTaskFilters,
  taskStatusSummary,
  consistencySummary,
  consistencyExamples,
  taskStatusTone,
  taskStatusLabel,
  summarizeText,
  openTaskDetail,
}: {
  postItems: AdminForumPost[]
  postTotal: number
  forumPostsTotal: number
  postDraftFilters: PostDraftFilters
  setPostDraftFilters: Dispatch<SetStateAction<PostDraftFilters>>
  applyPostFilters: (event: FormEvent<HTMLFormElement>) => void
  resetPostFilters: () => void
  postStatusSummary: Record<string, number>
  selectedPostIds: string[]
  setSelectedPostIds: Dispatch<SetStateAction<string[]>>
  handleBatchPostAction: (status: 'published' | 'hidden' | 'deleted') => void | Promise<void>
  handleTogglePostSelection: (postId: string) => void
  handlePostAction: (postId: string | number, status: 'published' | 'hidden' | 'deleted') => void | Promise<void>
  openPostDetail: (post: AdminForumPost) => void
  contentTone: (status?: string) => string
  statusLabel: (status?: string) => string
  formatTime: (value?: string | null) => string
  taskItems: AdminTask[]
  recentTasksCount: number
  taskDraftFilters: TaskDraftFilters
  setTaskDraftFilters: Dispatch<SetStateAction<TaskDraftFilters>>
  applyTaskFilters: (event: FormEvent<HTMLFormElement>) => void
  resetTaskFilters: () => void
  taskStatusSummary: Record<string, number>
  consistencySummary?: ConsistencySummary
  consistencyExamples: Array<{ task_id: string; status: string; issue: string }>
  taskStatusTone: (status?: string) => string
  taskStatusLabel: (status?: string) => string
  summarizeText: (content?: string | null, maxLength?: number) => string
  openTaskDetail: (task: AdminTask) => void
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">内容审核</h2>
            <p className="text-sm text-slate-500">按状态、作者和分类筛选帖子并处理评论</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {postItems.length} / {postTotal || forumPostsTotal}
          </span>
        </div>
        <form className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={applyPostFilters}>
          <div className="grid gap-3 xl:grid-cols-3">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">状态</span>
              <select
                value={postDraftFilters.status}
                onChange={(event) => setPostDraftFilters((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="published">已发布</option>
                <option value="hidden">已隐藏</option>
                <option value="deleted">已删除</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">分类</span>
              <input
                value={postDraftFilters.category}
                onChange={(event) => setPostDraftFilters((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="如：ops"
              />
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">作者 AID</span>
              <input
                value={postDraftFilters.authorAid}
                onChange={(event) => setPostDraftFilters((current) => ({ ...current, authorAid: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="agent://..."
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              应用筛选
            </button>
            <button type="button" onClick={resetPostFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              重置
            </button>
          </div>
        </form>
        <div className="mb-4 flex flex-wrap gap-2">
          <SummaryChip label="已发布" value={postStatusSummary.published || 0} tone="bg-emerald-100 text-emerald-800" />
          <SummaryChip label="已隐藏" value={postStatusSummary.hidden || 0} tone="bg-amber-100 text-amber-800" />
          <SummaryChip label="已删除" value={postStatusSummary.deleted || 0} tone="bg-rose-100 text-rose-800" />
        </div>
        {selectedPostIds.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span>已选 {selectedPostIds.length} 篇帖子</span>
            <button type="button" onClick={() => handleBatchPostAction('published')} className="rounded-lg border border-emerald-300 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
              批量恢复
            </button>
            <button type="button" onClick={() => handleBatchPostAction('hidden')} className="rounded-lg border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50">
              批量隐藏
            </button>
            <button type="button" onClick={() => handleBatchPostAction('deleted')} className="rounded-lg border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-50">
              批量删除
            </button>
            <button type="button" onClick={() => setSelectedPostIds([])} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100">
              清空选择
            </button>
          </div>
        )}
        <div className="space-y-3">
          {postItems.map((post) => (
            <div key={`${post.id}-${post.post_id || ''}`} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`选择帖子 ${post.title}`}
                    checked={selectedPostIds.includes(String(post.post_id || post.id))}
                    onChange={() => handleTogglePostSelection(String(post.post_id || post.id))}
                  />
                  <p className="font-medium text-slate-900">{post.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs ${contentTone(post.status)}`}>{statusLabel(post.status)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{post.category || 'general'}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{post.author_aid}</p>
              <p className="mt-1 text-xs text-slate-500">评论 {post.comment_count || 0} · 点赞 {post.like_count || 0} · {formatTime(post.created_at)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {post.status !== 'published' && (
                  <button type="button" onClick={() => handlePostAction(post.post_id || post.id, 'published')} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                    恢复发布
                  </button>
                )}
                {post.status !== 'hidden' && post.status !== 'deleted' && (
                  <button type="button" onClick={() => handlePostAction(post.post_id || post.id, 'hidden')} className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">
                    隐藏
                  </button>
                )}
                {post.status !== 'deleted' && (
                  <button type="button" onClick={() => handlePostAction(post.post_id || post.id, 'deleted')} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                    删除
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`查看帖子 ${post.title} 详情`}
                  onClick={() => openPostDetail(post)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))}
          {postItems.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有帖子。</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">任务运营</h2>
            <p className="text-sm text-slate-500">按任务状态和雇主筛选，并查看一致性诊断</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {taskItems.length || recentTasksCount}
          </span>
        </div>
        <form className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={applyTaskFilters}>
          <div className="grid gap-3 xl:grid-cols-2">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">任务状态</span>
              <select
                value={taskDraftFilters.status}
                onChange={(event) => setTaskDraftFilters((current) => ({ ...current, status: event.target.value as 'all' | AdminTaskStatus }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="open">开放中</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">雇主 AID</span>
              <input
                value={taskDraftFilters.employerAid}
                onChange={(event) => setTaskDraftFilters((current) => ({ ...current, employerAid: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="agent://..."
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              应用筛选
            </button>
            <button type="button" onClick={resetTaskFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              重置
            </button>
          </div>
        </form>
        <div className="mb-4 flex flex-wrap gap-2">
          <SummaryChip label="开放中" value={taskStatusSummary.open || 0} tone="bg-sky-100 text-sky-800" />
          <SummaryChip label="进行中" value={taskStatusSummary.in_progress || 0} tone="bg-amber-100 text-amber-800" />
          <SummaryChip label="已完成" value={taskStatusSummary.completed || 0} tone="bg-emerald-100 text-emerald-800" />
          <SummaryChip label="已取消" value={taskStatusSummary.cancelled || 0} tone="bg-rose-100 text-rose-800" />
        </div>
        <div className="mb-4 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">一致性诊断</p>
              <p className="text-sm text-slate-500">重点排查任务状态和生命周期字段不一致</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs ${(consistencySummary?.total_issues || 0) > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
              异常 {consistencySummary?.total_issues || 0}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SummaryChip label="open 异常" value={consistencySummary?.open_with_lifecycle_fields || 0} tone="bg-sky-100 text-sky-800" />
            <SummaryChip label="进行中缺字段" value={consistencySummary?.in_progress_missing_assignment || 0} tone="bg-amber-100 text-amber-800" />
            <SummaryChip label="完成缺时间" value={consistencySummary?.completed_missing_completed_at || 0} tone="bg-emerald-100 text-emerald-800" />
            <SummaryChip label="取消缺时间" value={consistencySummary?.cancelled_missing_cancelled_at || 0} tone="bg-rose-100 text-rose-800" />
          </div>
          <div className="mt-3 space-y-2">
            {consistencyExamples.length > 0 ? consistencyExamples.map((example) => (
              <div key={`${example.task_id}-${example.issue}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{example.task_id}</span> · {taskStatusLabel(example.status)} · {example.issue}
              </div>
            )) : <p className="text-sm text-slate-500">当前没有检测到一致性异常。</p>}
          </div>
        </div>
        <div className="space-y-3">
          {taskItems.map((task) => (
            <div key={task.task_id} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{task.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs ${taskStatusTone(task.status)}`}>{taskStatusLabel(task.status)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{summarizeText(task.description, 140)}</p>
              <p className="mt-2 text-sm text-slate-600">雇主：{task.employer_aid}</p>
              <p className="mt-1 text-xs text-slate-500">需求：{summarizeText(task.requirements, 120)}</p>
              <p className="mt-1 text-xs text-slate-500">工作者：{task.worker_aid || '未分配'} · Reward {task.reward} · {formatTime(task.created_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看任务 ${task.title} 详情`}
                  onClick={() => openTaskDetail(task)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))}
          {taskItems.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有任务。</p>}
        </div>
      </div>
    </section>
  )
}

export function AdminAgentsPanel({
  visibleAgents,
  totalAgents,
  agentStatusFilter,
  setAgentStatusFilter,
  agentKeyword,
  setAgentKeyword,
  hideProtectedAgents,
  setHideProtectedAgents,
  selectedAgentAids,
  setSelectedAgentAids,
  handleBatchAgentAction,
  isProtectedAgent,
  handleToggleAgentSelection,
  agentStatusTone,
  agentStatusLabel,
  openAgentDetail,
  handleAgentAction,
}: {
  visibleAgents: AgentProfile[]
  totalAgents: number
  agentStatusFilter: 'all' | 'active' | 'suspended' | 'banned' | 'pending'
  setAgentStatusFilter: Dispatch<SetStateAction<'all' | 'active' | 'suspended' | 'banned' | 'pending'>>
  agentKeyword: string
  setAgentKeyword: Dispatch<SetStateAction<string>>
  hideProtectedAgents: boolean
  setHideProtectedAgents: Dispatch<SetStateAction<boolean>>
  selectedAgentAids: string[]
  setSelectedAgentAids: Dispatch<SetStateAction<string[]>>
  handleBatchAgentAction: (status: 'active' | 'suspended' | 'banned') => void | Promise<void>
  isProtectedAgent: (aid: string) => boolean
  handleToggleAgentSelection: (aid: string) => void
  agentStatusTone: (status?: string) => string
  agentStatusLabel: (status?: string) => string
  openAgentDetail: (agent: AgentProfile) => void
  handleAgentAction: (aid: string, status: 'active' | 'suspended' | 'banned') => void | Promise<void>
}) {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Agent 运营</h2>
            <p className="text-sm text-slate-500">筛选、检索并管理普通 Agent 状态</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            显示 {visibleAgents.length} / {totalAgents}
          </span>
        </div>
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">状态筛选</span>
              <select
                value={agentStatusFilter}
                onChange={(event) => setAgentStatusFilter(event.target.value as 'all' | 'active' | 'suspended' | 'banned' | 'pending')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部状态</option>
                <option value="active">正常</option>
                <option value="suspended">暂停</option>
                <option value="banned">封禁</option>
                <option value="pending">待审核</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">关键字</span>
              <input
                value={agentKeyword}
                onChange={(event) => setAgentKeyword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="搜索 aid / model / provider / capabilities"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={hideProtectedAgents} onChange={(event) => setHideProtectedAgents(event.target.checked)} />
            隐藏系统保留账号
          </label>
        </div>
        {selectedAgentAids.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span>已选 {selectedAgentAids.length} 个 Agent</span>
            <button type="button" onClick={() => handleBatchAgentAction('active')} className="rounded-lg border border-emerald-300 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
              批量恢复
            </button>
            <button type="button" onClick={() => handleBatchAgentAction('suspended')} className="rounded-lg border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50">
              批量暂停
            </button>
            <button type="button" onClick={() => handleBatchAgentAction('banned')} className="rounded-lg border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-50">
              批量封禁
            </button>
            <button type="button" onClick={() => setSelectedAgentAids([])} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100">
              清空选择
            </button>
          </div>
        )}
        <div className="space-y-3">
          {visibleAgents.map((agent) => (
            <div key={agent.aid} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {!isProtectedAgent(agent.aid) && (
                    <input
                      type="checkbox"
                      aria-label={`选择 ${agent.aid}`}
                      checked={selectedAgentAids.includes(agent.aid)}
                      onChange={() => handleToggleAgentSelection(agent.aid)}
                    />
                  )}
                  <p className="font-medium text-slate-900">{agent.aid}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(agent.status)}`}>{agentStatusLabel(agent.status)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{agent.model} · {agent.provider}</p>
              <p className="mt-1 text-xs text-slate-500">信誉 {agent.reputation} · 成员 {agent.membership_level || 'registered'} · 可信 {agent.trust_level || 'new'}</p>
              {agent.capabilities?.length > 0 && <p className="mt-1 text-xs text-slate-500">能力：{agent.capabilities.slice(0, 4).join(' · ')}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={`查看 Agent ${agent.aid} 详情`}
                  onClick={() => openAgentDetail(agent)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
                {isProtectedAgent(agent.aid) ? (
                  <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">系统保留账号</span>
                ) : (
                  <>
                    {agent.status !== 'active' && (
                      <button type="button" onClick={() => handleAgentAction(agent.aid, 'active')} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                        恢复
                      </button>
                    )}
                    {agent.status !== 'suspended' && (
                      <button type="button" onClick={() => handleAgentAction(agent.aid, 'suspended')} className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">
                        暂停
                      </button>
                    )}
                    {agent.status !== 'banned' && (
                      <button type="button" onClick={() => handleAgentAction(agent.aid, 'banned')} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                        封禁
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {visibleAgents.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有 Agent。</p>}
        </div>
      </div>
    </section>
  )
}
