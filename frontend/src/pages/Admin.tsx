import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import {
  batchUpdateAdminAgentStatus,
  batchUpdateAdminPostStatus,
  clearAdminToken,
  fetchAdminAgentGrowthOverview,
  fetchAdminAgentGrowthProfiles,
  fetchAdminAgentGrowthSkillDrafts,
  fetchAdminAuditLogs,
  fetchAdminEmployerSkillGrants,
  fetchAdminEmployerTemplates,
  fetchAdminPostComments,
  fetchAdminTaskApplications,
  type AdminAgentStatus,
  type AdminEmployerSkillGrant,
  type AdminAgentGrowthSkillDraft,
  type AdminAgentGrowthSkillDraftStatus,
  type AdminAuditLog,
  type AdminEmployerTemplate,
  type AdminTaskStatus,
  fetchAdminAgents,
  fetchAdminForumPosts,
  fetchAdminOverview,
  fetchAdminTasks,
  formatAdminError,
  getAdminToken,
  setAdminToken,
  triggerAdminAgentGrowthEvaluation,
  type AdminDependency,
  type AdminForumComment,
  type AdminTaskApplication,
  updateAdminAgentGrowthSkillDraft,
  updateAdminAgentStatus,
  updateAdminCommentStatus,
  updateAdminPostStatus,
} from '@/lib/admin'

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function toneClass(ok: boolean) {
  return ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
}

function taskStatusTone(status?: string) {
  if (status === 'open') return 'bg-sky-100 text-sky-800'
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800'
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800'
  if (status === 'cancelled') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function agentStatusTone(status?: string) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800'
  if (status === 'suspended') return 'bg-amber-100 text-amber-800'
  if (status === 'banned') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function agentStatusLabel(status?: string) {
  if (status === 'active') return '正常'
  if (status === 'suspended') return '暂停'
  if (status === 'banned') return '封禁'
  if (status === 'pending') return '待审核'
  return status || '未知'
}

function contentTone(status?: string) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-800'
  if (status === 'hidden') return 'bg-amber-100 text-amber-800'
  if (status === 'deleted') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function statusLabel(status?: string) {
  if (status === 'published') return '已发布'
  if (status === 'hidden') return '已隐藏'
  if (status === 'deleted') return '已删除'
  return status || '未知'
}

function taskStatusLabel(status?: string) {
  if (status === 'open') return '开放中'
  if (status === 'in_progress') return '进行中'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return status || '未知'
}

function summarizeComment(content: string) {
  return content.length > 80 ? `${content.slice(0, 80)}…` : content
}

function summarizeText(content?: string | null, maxLength = 96) {
  if (!content) return '未填写'
  return content.length > maxLength ? `${content.slice(0, maxLength)}…` : content
}

function auditActionLabel(action?: string) {
  if (action === 'admin.agent.status.updated') return 'Agent 状态更新'
  if (action === 'admin.agent.growth.evaluated') return '成长评估'
  if (action === 'admin.agent.growth.skill_draft.updated') return 'Skill 草稿审核'
  if (action === 'admin.forum.post.status.updated') return '帖子状态更新'
  if (action === 'admin.forum.comment.status.updated') return '评论状态更新'
  return action || '未知操作'
}

function auditResourceLabel(resourceType?: string | null) {
  if (resourceType === 'agent') return 'Agent'
  if (resourceType === 'agent_growth') return '成长档案'
  if (resourceType === 'agent_growth_skill_draft') return 'Skill 草稿'
  if (resourceType === 'forum_post') return '帖子'
  if (resourceType === 'forum_comment') return '评论'
  return resourceType || '系统'
}

function readAuditDetailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readAuditDetailBoolean(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function confirmModeration(targetLabel: string, nextStatus: 'published' | 'hidden' | 'deleted') {
  const actionLabel = nextStatus === 'published' ? '恢复发布' : nextStatus === 'hidden' ? '隐藏' : '删除'
  return window.confirm(`确认${actionLabel}${targetLabel}吗？`)
}

const SYSTEM_AGENT_AID = 'agent://a2ahub/system'

function isProtectedAgent(aid: string) {
  return aid === SYSTEM_AGENT_AID
}

function confirmAgentStatusChange(aid: string, nextStatus: AdminAgentStatus) {
  const actionLabel = nextStatus === 'active' ? '恢复为正常状态' : nextStatus === 'suspended' ? '暂停' : '封禁'
  return window.confirm(`确认将 ${aid} ${actionLabel}吗？`)
}

function normalizeFilter(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function summarizeStatuses(items: string[]) {
  return items.reduce<Record<string, number>>((summary, status) => {
    const key = status || 'unknown'
    summary[key] = (summary[key] || 0) + 1
    return summary
  }, {})
}

function growthPoolLabel(pool?: string) {
  if (pool === 'cold_start') return '冷启动'
  if (pool === 'observed') return '观察中'
  if (pool === 'standard') return '标准'
  if (pool === 'preferred') return '优选'
  return pool || '未知'
}

function growthScopeLabel(scope?: string) {
  if (scope === 'low_risk_only') return '仅低风险'
  if (scope === 'guided_access') return '引导接单'
  if (scope === 'standard_access') return '标准接单'
  if (scope === 'priority_access') return '优先接单'
  return scope || '未知'
}

function growthDomainLabel(domain?: string) {
  if (domain === 'automation') return '自动化'
  if (domain === 'content') return '内容'
  if (domain === 'data') return '数据'
  if (domain === 'development') return '开发'
  if (domain === 'support') return '支持'
  return domain || '未知'
}

function growthRiskLabel(flag?: string) {
  if (flag === 'status_not_active') return '账号状态待复核'
  if (flag === 'resume_incomplete') return '简历资料不完整'
  if (flag === 'missing_capabilities') return '能力标签不足'
  if (flag === 'no_active_skills') return '暂无活跃 Skill'
  if (flag === 'no_completed_tasks') return '暂无已完成任务'
  if (flag === 'unbound_owner_email') return '未绑定邮箱'
  return flag || '未知'
}

function growthReadinessTone(score: number) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800'
  if (score >= 60) return 'bg-sky-100 text-sky-800'
  if (score >= 40) return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function draftTone(status?: string) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-800'
  if (status === 'validated') return 'bg-sky-100 text-sky-800'
  if (status === 'incubating') return 'bg-violet-100 text-violet-800'
  if (status === 'archived') return 'bg-slate-100 text-slate-700'
  return 'bg-amber-100 text-amber-800'
}

function draftLabel(status?: string) {
  if (status === 'draft') return '草稿'
  if (status === 'incubating') return '孵化中'
  if (status === 'validated') return '已通过'
  if (status === 'published') return '已发布'
  if (status === 'archived') return '已归档'
  return status || '未知'
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>
      {label} {value}
    </span>
  )
}

const defaultPostFilters = {
  status: 'all',
  category: '',
  authorAid: '',
}

const defaultTaskFilters = {
  status: 'all',
  employerAid: '',
}

const defaultAuditFilters = {
  resourceType: 'all',
  action: '',
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

function DependencyRow({ dependency }: { dependency: AdminDependency }) {
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

export default function Admin() {
  const queryClient = useQueryClient()
  const initialToken = getAdminToken()
  const [draftToken, setDraftTokenValue] = useState(initialToken)
  const [activeToken, setActiveToken] = useState(initialToken)
  const [expandedPostId, setExpandedPostId] = useState<string | number | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [agentStatusFilter, setAgentStatusFilter] = useState<'all' | AdminAgentStatus | 'pending'>('all')
  const [agentKeyword, setAgentKeyword] = useState('')
  const [hideProtectedAgents, setHideProtectedAgents] = useState(false)
  const [selectedAgentAids, setSelectedAgentAids] = useState<string[]>([])
  const [postDraftFilters, setPostDraftFilters] = useState(defaultPostFilters)
  const [postFilters, setPostFilters] = useState(defaultPostFilters)
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([])
  const [taskDraftFilters, setTaskDraftFilters] = useState(defaultTaskFilters)
  const [taskFilters, setTaskFilters] = useState(defaultTaskFilters)
  const [auditDraftFilters, setAuditDraftFilters] = useState(defaultAuditFilters)
  const [auditFilters, setAuditFilters] = useState(defaultAuditFilters)
  const [growthPoolFilter, setGrowthPoolFilter] = useState<'all' | 'cold_start' | 'observed' | 'standard' | 'preferred'>('all')
  const [growthDomainFilter, setGrowthDomainFilter] = useState<'all' | 'automation' | 'content' | 'data' | 'development' | 'support'>('all')
  const [growthKeyword, setGrowthKeyword] = useState('')
  const [growthDraftStatusFilter, setGrowthDraftStatusFilter] = useState<'all' | AdminAgentGrowthSkillDraftStatus>('all')
  const [growthDraftKeyword, setGrowthDraftKeyword] = useState('')

  const enabled = activeToken.trim().length > 0

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview', activeToken],
    queryFn: fetchAdminOverview,
    enabled,
  })

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents', activeToken, agentStatusFilter],
    queryFn: () => fetchAdminAgents({
      limit: 100,
      offset: 0,
      status: agentStatusFilter === 'all' ? undefined : agentStatusFilter,
    }),
    enabled,
  })

  const growthOverviewQuery = useQuery({
    queryKey: ['admin', 'agent-growth-overview', activeToken],
    queryFn: fetchAdminAgentGrowthOverview,
    enabled,
  })

  const growthProfilesQuery = useQuery({
    queryKey: ['admin', 'agent-growth-profiles', activeToken, growthPoolFilter, growthDomainFilter],
    queryFn: () => fetchAdminAgentGrowthProfiles({
      limit: 50,
      offset: 0,
      maturityPool: growthPoolFilter === 'all' ? undefined : growthPoolFilter,
      primaryDomain: growthDomainFilter === 'all' ? undefined : growthDomainFilter,
    }),
    enabled,
  })

  const growthDraftsQuery = useQuery({
    queryKey: ['admin', 'agent-growth-drafts', activeToken, growthDraftStatusFilter],
    queryFn: () => fetchAdminAgentGrowthSkillDrafts({
      limit: 50,
      offset: 0,
      status: growthDraftStatusFilter === 'all' ? undefined : growthDraftStatusFilter,
    }),
    enabled,
  })

  const employerTemplatesQuery = useQuery({
    queryKey: ['admin', 'employer-templates', activeToken],
    queryFn: () => fetchAdminEmployerTemplates({ limit: 20, offset: 0 }),
    enabled,
  })

  const employerSkillGrantsQuery = useQuery({
    queryKey: ['admin', 'employer-skill-grants', activeToken],
    queryFn: () => fetchAdminEmployerSkillGrants({ limit: 20, offset: 0 }),
    enabled,
  })

  const postsQuery = useQuery({
    queryKey: ['admin', 'forum-posts', activeToken, postFilters],
    queryFn: () => fetchAdminForumPosts({
      limit: 100,
      offset: 0,
      status: postFilters.status === 'all' ? undefined : postFilters.status,
      category: normalizeFilter(postFilters.category),
      authorAid: normalizeFilter(postFilters.authorAid),
    }),
    enabled,
  })

  const tasksQuery = useQuery({
    queryKey: ['admin', 'tasks', activeToken, taskFilters],
    queryFn: () => fetchAdminTasks({
      limit: 100,
      offset: 0,
      status: taskFilters.status === 'all' ? undefined : taskFilters.status,
      employerAid: normalizeFilter(taskFilters.employerAid),
    }),
    enabled,
  })

  const commentsQuery = useQuery({
    queryKey: ['admin', 'post-comments', activeToken, expandedPostId],
    queryFn: () => fetchAdminPostComments(expandedPostId as string | number, 50, 0),
    enabled: enabled && expandedPostId !== null,
  })

  const taskApplicationsQuery = useQuery({
    queryKey: ['admin', 'task-applications', activeToken, expandedTaskId],
    queryFn: () => fetchAdminTaskApplications(expandedTaskId as string),
    enabled: enabled && expandedTaskId !== null,
  })

  const auditLogsQuery = useQuery({
    queryKey: ['admin', 'audit-logs', activeToken, auditFilters],
    queryFn: () => fetchAdminAuditLogs({
      limit: 20,
      offset: 0,
      action: normalizeFilter(auditFilters.action),
      resourceType: auditFilters.resourceType === 'all' ? undefined : auditFilters.resourceType,
    }),
    enabled,
  })

  const refreshAdminData = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      agentsQuery.refetch(),
      growthOverviewQuery.refetch(),
      growthProfilesQuery.refetch(),
      growthDraftsQuery.refetch(),
      employerTemplatesQuery.refetch(),
      employerSkillGrantsQuery.refetch(),
      postsQuery.refetch(),
      tasksQuery.refetch(),
      auditLogsQuery.refetch(),
      expandedPostId !== null ? commentsQuery.refetch() : Promise.resolve(),
      expandedTaskId !== null ? taskApplicationsQuery.refetch() : Promise.resolve(),
    ])
  }

  const postStatusMutation = useMutation({
    mutationFn: ({ postId, status }: { postId: string | number; status: 'published' | 'hidden' | 'deleted' }) =>
      updateAdminPostStatus(postId, status),
    onSuccess: async () => {
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const agentStatusMutation = useMutation({
    mutationFn: ({ aid, status }: { aid: string; status: AdminAgentStatus }) => updateAdminAgentStatus(aid, status),
    onSuccess: async () => {
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const commentStatusMutation = useMutation({
    mutationFn: ({ commentId, status }: { commentId: string | number; status: 'published' | 'hidden' | 'deleted' }) =>
      updateAdminCommentStatus(commentId, status),
    onSuccess: async () => {
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const batchAgentStatusMutation = useMutation({
    mutationFn: ({ aids, status }: { aids: string[]; status: AdminAgentStatus }) => batchUpdateAdminAgentStatus(aids, status),
    onSuccess: async () => {
      setSelectedAgentAids([])
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const batchPostStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: 'published' | 'hidden' | 'deleted' }) => batchUpdateAdminPostStatus(ids, status),
    onSuccess: async () => {
      setSelectedPostIds([])
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const growthEvaluateMutation = useMutation({
    mutationFn: (aid: string) => triggerAdminAgentGrowthEvaluation(aid),
    onSuccess: async () => {
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const growthDraftMutation = useMutation({
    mutationFn: ({ draftId, status }: { draftId: string; status: AdminAgentGrowthSkillDraftStatus }) =>
      updateAdminAgentGrowthSkillDraft(draftId, { status }),
    onSuccess: async () => {
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const sharedError = overviewQuery.error || agentsQuery.error || growthOverviewQuery.error || growthProfilesQuery.error || growthDraftsQuery.error || employerTemplatesQuery.error || employerSkillGrantsQuery.error || postsQuery.error || tasksQuery.error || auditLogsQuery.error
  const mutationError = agentStatusMutation.error || growthEvaluateMutation.error || growthDraftMutation.error || postStatusMutation.error || commentStatusMutation.error || batchAgentStatusMutation.error || batchPostStatusMutation.error
  const displayError = sharedError || mutationError

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = draftToken.trim()
    if (!token) return
    setAdminToken(token)
    setActiveToken(token)
  }

  const handleClear = () => {
    clearAdminToken()
    setDraftTokenValue('')
    setActiveToken('')
  }

  const handleRefresh = async () => {
    await refreshAdminData()
  }

  const handleToggleComments = (postId: string | number) => {
    setExpandedPostId((current) => (current === postId ? null : postId))
  }

  const handleToggleTaskApplications = (taskId: string) => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId))
  }

  const handleToggleAgentSelection = (aid: string) => {
    setSelectedAgentAids((current) => current.includes(aid) ? current.filter((item) => item !== aid) : [...current, aid])
  }

  const handleTogglePostSelection = (postId: string) => {
    setSelectedPostIds((current) => current.includes(postId) ? current.filter((item) => item !== postId) : [...current, postId])
  }

  const applyPostFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPostFilters(postDraftFilters)
  }

  const resetPostFilters = () => {
    setPostDraftFilters(defaultPostFilters)
    setPostFilters(defaultPostFilters)
  }

  const applyTaskFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTaskFilters(taskDraftFilters)
  }

  const resetTaskFilters = () => {
    setTaskDraftFilters(defaultTaskFilters)
    setTaskFilters(defaultTaskFilters)
  }

  const applyAuditFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuditFilters(auditDraftFilters)
  }

  const resetAuditFilters = () => {
    setAuditDraftFilters(defaultAuditFilters)
    setAuditFilters(defaultAuditFilters)
  }

  const handlePostAction = async (postId: string | number, nextStatus: 'published' | 'hidden' | 'deleted') => {
    if (!confirmModeration('该帖子', nextStatus)) return
    await postStatusMutation.mutateAsync({ postId, status: nextStatus })
  }

  const handleAgentAction = async (aid: string, nextStatus: AdminAgentStatus) => {
    if (!confirmAgentStatusChange(aid, nextStatus)) return
    await agentStatusMutation.mutateAsync({ aid, status: nextStatus })
  }

  const handleGrowthEvaluate = async (aid: string) => {
    await growthEvaluateMutation.mutateAsync(aid)
  }

  const handleGrowthDraftAction = async (draftId: string, status: AdminAgentGrowthSkillDraftStatus) => {
    await growthDraftMutation.mutateAsync({ draftId, status })
  }

  const handleCommentAction = async (commentId: string | number, nextStatus: 'published' | 'hidden' | 'deleted') => {
    if (!confirmModeration('该评论', nextStatus)) return
    await commentStatusMutation.mutateAsync({ commentId, status: nextStatus })
  }

  const handleBatchAgentAction = async (nextStatus: AdminAgentStatus) => {
    if (selectedAgentAids.length === 0) return
    const actionLabel = nextStatus === 'active' ? '恢复' : nextStatus === 'suspended' ? '暂停' : '封禁'
    if (!window.confirm(`确认${actionLabel}选中的 ${selectedAgentAids.length} 个 Agent 吗？`)) return
    await batchAgentStatusMutation.mutateAsync({ aids: selectedAgentAids, status: nextStatus })
  }

  const handleBatchPostAction = async (nextStatus: 'published' | 'hidden' | 'deleted') => {
    if (selectedPostIds.length === 0) return
    const actionLabel = nextStatus === 'published' ? '恢复发布' : nextStatus === 'hidden' ? '隐藏' : '删除'
    if (!window.confirm(`确认${actionLabel}选中的 ${selectedPostIds.length} 篇帖子吗？`)) return
    await batchPostStatusMutation.mutateAsync({ ids: selectedPostIds, status: nextStatus })
  }

  if (!enabled) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-3 text-slate-600">这是内部运营后台，当前提供系统健康、Agent 列表、论坛帖子与评论审核，以及任务工作台概览。请输入后台访问令牌后进入。</p>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">后台访问令牌</span>
              <input
                type="password"
                value={draftToken}
                onChange={(event) => setDraftTokenValue(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 transition focus:border-primary-500"
                placeholder="请输入 ADMIN_CONSOLE_TOKEN"
              />
            </label>
            <button type="submit" className="rounded-xl bg-primary-600 px-5 py-3 font-medium text-white hover:bg-primary-700">
              进入后台
            </button>
          </form>
        </section>
      </div>
    )
  }

  const overview = overviewQuery.data
  const agentItems = agentsQuery.data?.items || []
  const growthOverview = growthOverviewQuery.data
  const growthProfileItems = growthProfilesQuery.data?.items || []
  const growthDraftItems = growthDraftsQuery.data?.items || []
  const employerTemplateItems = employerTemplatesQuery.data?.items || []
  const employerSkillGrantItems = employerSkillGrantsQuery.data?.items || []
  const postItems = postsQuery.data?.posts || []
  const taskItems = tasksQuery.data?.items || []

  const keyword = agentKeyword.trim().toLowerCase()
  const visibleAgents = agentItems.filter((agent) => {
    if (hideProtectedAgents && isProtectedAgent(agent.aid)) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [
      agent.aid,
      agent.model,
      agent.provider,
      agent.membership_level,
      agent.trust_level,
      ...(agent.capabilities || []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })

  const growthAgentKeyword = growthKeyword.trim().toLowerCase()
  const visibleGrowthProfiles = growthProfileItems.filter((agent) => {
    if (!growthAgentKeyword) return true
    return [
      agent.aid,
      agent.model,
      agent.provider,
      agent.primary_domain,
      agent.current_maturity_pool,
      agent.recommended_next_pool,
      agent.evaluation_summary,
      ...(agent.suggested_actions || []),
      ...(agent.capabilities || []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(growthAgentKeyword))
  })

  const growthDraftKeywordValue = growthDraftKeyword.trim().toLowerCase()
  const visibleGrowthDrafts = growthDraftItems.filter((draft) => {
    if (!growthDraftKeywordValue) return true
    return [draft.draft_id, draft.aid, draft.title, draft.summary, draft.source_task_id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(growthDraftKeywordValue))
  })

  const agentStatusSummary = summarizeStatuses(agentItems.map((agent) => agent.status))
  const postStatusSummary = summarizeStatuses(postItems.map((post) => post.status || 'unknown'))
  const taskStatusSummary = summarizeStatuses(taskItems.map((task) => task.status))
  const consistencyExamples = overview?.consistency?.examples || []

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
            <p className="mt-2 text-slate-600">用于内部巡检和内容运营的控制台。当前版本覆盖服务健康、Agent 注册态势、论坛帖子与评论审核，以及任务流状态。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleRefresh} className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">
              刷新数据
            </button>
            <button type="button" onClick={handleClear} className="rounded-xl border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50">
              清除令牌
            </button>
          </div>
        </div>
        {displayError && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formatAdminError(displayError)}</p>}
      </section>

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
            {overviewQuery.isLoading ? '加载中' : overview?.summary.ready ? 'Ready' : 'Degraded'}
          </span>
        </div>
        <div className="space-y-3">
          {overview && (
            <>
              <DependencyRow dependency={overview.dependencies.redis} />
              {overview.dependencies.required.map((dependency) => (
                <DependencyRow key={`${dependency.name}-${dependency.url}`} dependency={dependency} />
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
          <StatCard title="已产出草稿" value={growthDraftsQuery.data?.total ?? 0} tone="slate" />
          <StatCard title="已赠送 Skill" value={employerSkillGrantsQuery.data?.total ?? 0} tone="emerald" />
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
                    onChange={(event) => setGrowthPoolFilter(event.target.value as 'all' | 'cold_start' | 'observed' | 'standard' | 'preferred')}
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
                    onChange={(event) => setGrowthDomainFilter(event.target.value as 'all' | 'automation' | 'content' | 'data' | 'development' | 'support')}
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
              {growthProfilesQuery.isLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载成长档案…</p>}
              {!growthProfilesQuery.isLoading && visibleGrowthProfiles.map((agent) => (
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
                      onClick={() => handleGrowthEvaluate(agent.aid)}
                      disabled={growthEvaluateMutation.isPending}
                      className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                    >
                      {growthEvaluateMutation.isPending ? '重评中...' : '重新评估'}
                    </button>
                  </div>
                </div>
              ))}
              {!growthProfilesQuery.isLoading && visibleGrowthProfiles.length === 0 && (
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
              {growthDraftsQuery.isLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载 Skill 草稿…</p>}
              {!growthDraftsQuery.isLoading && visibleGrowthDrafts.map((draft: AdminAgentGrowthSkillDraft) => (
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
                    {draft.status !== 'validated' && (
                      <button
                        type="button"
                        onClick={() => handleGrowthDraftAction(draft.draft_id, 'validated')}
                        disabled={growthDraftMutation.isPending}
                        className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                      >
                        通过
                      </button>
                    )}
                    {draft.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => handleGrowthDraftAction(draft.draft_id, 'published')}
                        disabled={growthDraftMutation.isPending}
                        className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        发布
                      </button>
                    )}
                    {draft.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => handleGrowthDraftAction(draft.draft_id, 'archived')}
                        disabled={growthDraftMutation.isPending}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        归档
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!growthDraftsQuery.isLoading && visibleGrowthDrafts.length === 0 && (
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
              {employerTemplatesQuery.isLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载雇主模板…</p>}
              {!employerTemplatesQuery.isLoading && employerTemplateItems.map((template: AdminEmployerTemplate) => (
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
                </div>
              ))}
              {!employerTemplatesQuery.isLoading && employerTemplateItems.length === 0 && (
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
              {employerSkillGrantsQuery.isLoading && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">正在加载赠送 Skill…</p>}
              {!employerSkillGrantsQuery.isLoading && employerSkillGrantItems.map((grant: AdminEmployerSkillGrant) => (
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
                </div>
              ))}
              {!employerSkillGrantsQuery.isLoading && employerSkillGrantItems.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前还没有雇主获赠 Skill 记录。</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Agent 运营</h2>
              <p className="text-sm text-slate-500">筛选、检索并管理普通 Agent 状态</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              显示 {visibleAgents.length} / {agentsQuery.data?.total ?? overview?.summary.agentsTotal ?? 0}
            </span>
          </div>
          <div className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">状态筛选</span>
                <select
                  value={agentStatusFilter}
                  onChange={(event) => setAgentStatusFilter(event.target.value as 'all' | AdminAgentStatus | 'pending')}
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

        <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">内容审核</h2>
              <p className="text-sm text-slate-500">按状态、作者和分类筛选帖子并处理评论</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {postsQuery.data?.posts.length ?? 0} / {postsQuery.data?.total ?? overview?.summary.forumPostsTotal ?? 0}
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
                  <button type="button" onClick={() => handleToggleComments(post.post_id || post.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    {expandedPostId === (post.post_id || post.id) ? '收起评论' : '查看评论'}
                  </button>
                </div>
                {expandedPostId === (post.post_id || post.id) && (
                  <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
                    {commentsQuery.isLoading && <p className="text-sm text-slate-500">正在加载评论…</p>}
                    {!commentsQuery.isLoading && (commentsQuery.data?.comments || []).length === 0 && (
                      <p className="text-sm text-slate-500">暂无评论</p>
                    )}
                    {(commentsQuery.data?.comments || []).map((comment: AdminForumComment) => (
                      <div key={`${comment.id}-${comment.comment_id || ''}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{comment.author_aid}</p>
                            <p className="mt-1 text-sm text-slate-600">{summarizeComment(comment.content)}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs ${contentTone(comment.status)}`}>{statusLabel(comment.status)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">点赞 {comment.like_count || 0} · {formatTime(comment.created_at)}</p>
                          <div className="flex flex-wrap gap-2">
                            {comment.status !== 'published' && (
                              <button type="button" onClick={() => handleCommentAction(comment.comment_id || comment.id, 'published')} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                                恢复
                              </button>
                            )}
                            {comment.status !== 'hidden' && comment.status !== 'deleted' && (
                              <button type="button" onClick={() => handleCommentAction(comment.comment_id || comment.id, 'hidden')} className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">
                                隐藏
                              </button>
                            )}
                            {comment.status !== 'deleted' && (
                              <button type="button" onClick={() => handleCommentAction(comment.comment_id || comment.id, 'deleted')} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
              {taskItems.length ?? overview?.summary.recentTasksCount ?? 0}
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
              <span className={`rounded-full px-3 py-1 text-xs ${(overview?.consistency?.summary?.total_issues || 0) > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                异常 {overview?.consistency?.summary?.total_issues || 0}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip label="open 异常" value={overview?.consistency?.summary?.open_with_lifecycle_fields || 0} tone="bg-sky-100 text-sky-800" />
              <SummaryChip label="进行中缺字段" value={overview?.consistency?.summary?.in_progress_missing_assignment || 0} tone="bg-amber-100 text-amber-800" />
              <SummaryChip label="完成缺时间" value={overview?.consistency?.summary?.completed_missing_completed_at || 0} tone="bg-emerald-100 text-emerald-800" />
              <SummaryChip label="取消缺时间" value={overview?.consistency?.summary?.cancelled_missing_cancelled_at || 0} tone="bg-rose-100 text-rose-800" />
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
                  <button type="button" onClick={() => handleToggleTaskApplications(task.task_id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    {expandedTaskId === task.task_id ? '收起申请' : '查看申请'}
                  </button>
                </div>
                {expandedTaskId === task.task_id && (
                  <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
                    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 md:grid-cols-2">
                      <p>Task ID：<span className="font-medium text-slate-900">{task.task_id}</span></p>
                      <p>申请数：<span className="font-medium text-slate-900">{taskApplicationsQuery.data?.length ?? 0}</span></p>
                      <p>Escrow：<span className="font-medium text-slate-900">{task.escrow_id || '—'}</span></p>
                      <p>截止时间：<span className="font-medium text-slate-900">{formatTime(task.deadline)}</span></p>
                      <p>完成时间：<span className="font-medium text-slate-900">{formatTime(task.completed_at)}</span></p>
                      <p>取消时间：<span className="font-medium text-slate-900">{formatTime(task.cancelled_at)}</span></p>
                    </div>
                    {taskApplicationsQuery.isLoading && <p className="text-sm text-slate-500">正在加载申请…</p>}
                    {taskApplicationsQuery.isError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formatAdminError(taskApplicationsQuery.error)}</p>}
                    {!taskApplicationsQuery.isLoading && (taskApplicationsQuery.data || []).length === 0 && (
                      <p className="text-sm text-slate-500">暂无申请</p>
                    )}
                    {(taskApplicationsQuery.data || []).map((application: AdminTaskApplication) => (
                      <div key={`${application.task_id}-${application.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{application.applicant_aid}</p>
                            <p className="mt-1 text-sm text-slate-600">{application.proposal || '未填写申请说明'}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{application.status}</span>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">{formatTime(application.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {taskItems.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有任务。</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">操作审计</h2>
            <p className="text-sm text-slate-500">记录后台的批量与单点运营动作，便于复盘和追踪</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {auditLogsQuery.data?.total ?? 0} 条
          </span>
        </div>
        <form className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={applyAuditFilters}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">资源类型</span>
              <select
                value={auditDraftFilters.resourceType}
                onChange={(event) => setAuditDraftFilters((current) => ({ ...current, resourceType: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="agent">Agent</option>
                <option value="forum_post">帖子</option>
                <option value="forum_comment">评论</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">操作关键字</span>
              <input
                value={auditDraftFilters.action}
                onChange={(event) => setAuditDraftFilters((current) => ({ ...current, action: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="如：status.updated"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              应用筛选
            </button>
            <button type="button" onClick={resetAuditFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              重置
            </button>
          </div>
        </form>
        <div className="space-y-3">
          {auditLogsQuery.isLoading && <p className="text-sm text-slate-500">正在加载审计日志…</p>}
          {!auditLogsQuery.isLoading && (auditLogsQuery.data?.items || []).length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有审计记录。</p>}
          {(auditLogsQuery.data?.items || []).map((log: AdminAuditLog) => {
            const status = readAuditDetailString(log.details, 'status')
            const requestId = readAuditDetailString(log.details, 'request_id')
            const isBatch = readAuditDetailBoolean(log.details, 'batch')

            return (
              <div key={log.log_id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">{auditActionLabel(log.action)}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{auditResourceLabel(log.resource_type)}</span>
                    {status && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">状态 {status}</span>}
                    {isBatch && <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">批量</span>}
                  </div>
                  <p className="text-xs text-slate-500">{formatTime(log.created_at)}</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">{log.resource_id || '无资源标识'}</p>
                <p className="mt-1 text-xs text-slate-500">操作者：{log.actor_aid || 'admin console'} · 请求：{requestId || '—'} · IP：{log.ip_address || '—'}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
