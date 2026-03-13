import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminAuditPanel } from '@/components/admin/AdminAuditPanel'
import { AdminDetailDrawers } from '@/components/admin/AdminDetailDrawers'
import {
  AdminAgentsPanel,
  AdminContentPanel,
  AdminGrowthPanel,
  AdminOverviewPanel,
} from '@/components/admin/AdminWorkspacePanels'
import type { AgentProfile } from '@/lib/api'
import {
  batchUpdateAdminAgentStatus,
  batchUpdateAdminPostStatus,
  clearAdminToken,
  type AdminAgentGrowthProfile,
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
  type AdminForumPost,
  type AdminTask,
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

function summarizeText(content?: string | null, maxLength = 96) {
  if (!content) return '未填写'
  return content.length > maxLength ? `${content.slice(0, maxLength)}…` : content
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

const defaultPostFilters = {
  status: 'all',
  category: '',
  authorAid: '',
}

const defaultTaskFilters: {
  status: 'all' | AdminTaskStatus
  employerAid: string
} = {
  status: 'all',
  employerAid: '',
}

const defaultAuditFilters = {
  resourceType: 'all',
  action: '',
}

type AdminTabKey = 'overview' | 'agents' | 'growth' | 'content' | 'audit'
type AdminDetailParamKey = 'agent' | 'growth' | 'draft' | 'template' | 'grant' | 'post' | 'task' | 'audit'
type AdminDetailParams = Partial<Record<AdminDetailParamKey, string>>

const ADMIN_TAB_SEGMENTS: Record<AdminTabKey, string> = {
  overview: 'overview',
  agents: 'agents',
  growth: 'growth',
  content: 'content',
  audit: 'audit',
}

function getAdminBasePath(pathname: string) {
  return pathname.startsWith('/admin') ? '/admin' : ''
}

function getAdminTabFromPath(pathname: string): AdminTabKey {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const basePath = getAdminBasePath(normalizedPath)
  const relativePath = basePath ? normalizedPath.slice(basePath.length) || '/' : normalizedPath
  const [segment] = relativePath.split('/').filter(Boolean)

  if (segment === 'agents') return 'agents'
  if (segment === 'growth') return 'growth'
  if (segment === 'content') return 'content'
  if (segment === 'audit') return 'audit'
  return 'overview'
}

function getAdminTabHref(pathname: string, tab: AdminTabKey) {
  const basePath = getAdminBasePath(pathname)
  const segment = ADMIN_TAB_SEGMENTS[tab]
  return basePath ? `${basePath}/${segment}` : `/${segment}`
}

function buildAdminHref(pathname: string, tab: AdminTabKey, params: AdminDetailParams = {}) {
  const href = getAdminTabHref(pathname, tab)
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value)
    }
  })

  const search = searchParams.toString()
  return search ? `${href}?${search}` : href
}

function AdminTabButton({
  label,
  badge,
  isActive,
  onClick,
}: {
  label: string
  badge?: string | number
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
        isActive
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span aria-hidden="true" className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

export default function Admin() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const initialToken = getAdminToken()
  const [draftToken, setDraftTokenValue] = useState(initialToken)
  const [activeToken, setActiveToken] = useState(initialToken)
  const [expandedPostId, setExpandedPostId] = useState<string | number | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null)
  const [selectedGrowthProfile, setSelectedGrowthProfile] = useState<AdminAgentGrowthProfile | null>(null)
  const [selectedGrowthDraft, setSelectedGrowthDraft] = useState<AdminAgentGrowthSkillDraft | null>(null)
  const [selectedEmployerTemplate, setSelectedEmployerTemplate] = useState<AdminEmployerTemplate | null>(null)
  const [selectedEmployerSkillGrant, setSelectedEmployerSkillGrant] = useState<AdminEmployerSkillGrant | null>(null)
  const [selectedPost, setSelectedPost] = useState<AdminForumPost | null>(null)
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null)
  const [selectedAuditLog, setSelectedAuditLog] = useState<AdminAuditLog | null>(null)
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
  const detailSearchParams = new URLSearchParams(location.search)
  const deepLinkAgentAid = detailSearchParams.get('agent')
  const deepLinkGrowthAid = detailSearchParams.get('growth')
  const deepLinkDraftId = detailSearchParams.get('draft')
  const deepLinkTemplateId = detailSearchParams.get('template')
  const deepLinkGrantId = detailSearchParams.get('grant')
  const deepLinkPostId = detailSearchParams.get('post')
  const deepLinkTaskId = detailSearchParams.get('task')
  const deepLinkAuditId = detailSearchParams.get('audit')

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
    setSelectedAgent(null)
    setSelectedGrowthProfile(null)
    setSelectedGrowthDraft(null)
    setSelectedEmployerTemplate(null)
    setSelectedEmployerSkillGrant(null)
    setSelectedPost(null)
    setSelectedTask(null)
    setSelectedAuditLog(null)
    setExpandedPostId(null)
    setExpandedTaskId(null)
  }

  const handleRefresh = async () => {
    await refreshAdminData()
  }

  const openAgentDetail = (agent: AgentProfile) => {
    setSelectedAgent(agent)
  }

  const closeAgentDetail = () => {
    setSelectedAgent(null)
    clearAdminDetailParams(['agent'])
  }

  const openPostDetail = (post: AdminForumPost) => {
    setSelectedPost(post)
    setExpandedPostId(post.post_id || post.id)
  }

  const closePostDetail = () => {
    setSelectedPost(null)
    setExpandedPostId(null)
    clearAdminDetailParams(['post'])
  }

  const openTaskDetail = (task: AdminTask) => {
    setSelectedTask(task)
    setExpandedTaskId(task.task_id)
  }

  const closeTaskDetail = () => {
    setSelectedTask(null)
    setExpandedTaskId(null)
    clearAdminDetailParams(['task'])
  }

  const openGrowthProfileDetail = (profile: AdminAgentGrowthProfile) => {
    setSelectedGrowthProfile(profile)
  }

  const closeGrowthProfileDetail = () => {
    setSelectedGrowthProfile(null)
    clearAdminDetailParams(['growth'])
  }

  const openGrowthDraftDetail = (draft: AdminAgentGrowthSkillDraft) => {
    setSelectedGrowthDraft(draft)
  }

  const closeGrowthDraftDetail = () => {
    setSelectedGrowthDraft(null)
    clearAdminDetailParams(['draft'])
  }

  const openEmployerTemplateDetail = (template: AdminEmployerTemplate) => {
    setSelectedEmployerTemplate(template)
  }

  const closeEmployerTemplateDetail = () => {
    setSelectedEmployerTemplate(null)
    clearAdminDetailParams(['template'])
  }

  const openEmployerSkillGrantDetail = (grant: AdminEmployerSkillGrant) => {
    setSelectedEmployerSkillGrant(grant)
  }

  const closeEmployerSkillGrantDetail = () => {
    setSelectedEmployerSkillGrant(null)
    clearAdminDetailParams(['grant'])
  }

  const openAuditLogDetail = (log: AdminAuditLog) => {
    setSelectedAuditLog(log)
  }

  const closeAuditLogDetail = () => {
    setSelectedAuditLog(null)
    clearAdminDetailParams(['audit'])
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

  const closeAllDetails = () => {
    setSelectedAgent(null)
    setSelectedGrowthProfile(null)
    setSelectedGrowthDraft(null)
    setSelectedEmployerTemplate(null)
    setSelectedEmployerSkillGrant(null)
    setSelectedPost(null)
    setSelectedTask(null)
    setSelectedAuditLog(null)
    setExpandedPostId(null)
    setExpandedTaskId(null)
  }

  const clearAdminDetailParams = (keys: AdminDetailParamKey[]) => {
    const nextSearchParams = new URLSearchParams(location.search)
    let changed = false

    keys.forEach((key) => {
      if (nextSearchParams.has(key)) {
        nextSearchParams.delete(key)
        changed = true
      }
    })

    if (!changed) return

    const nextSearch = nextSearchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }

  const navigateToAdminView = (tab: AdminTabKey, params: AdminDetailParams = {}) => {
    if (tab === 'agents') {
      setAgentStatusFilter('all')
      setAgentKeyword('')
      setHideProtectedAgents(false)
    }

    if (tab === 'growth') {
      setGrowthPoolFilter('all')
      setGrowthDomainFilter('all')
      setGrowthKeyword('')
      setGrowthDraftStatusFilter('all')
      setGrowthDraftKeyword('')
    }

    if (tab === 'content') {
      setPostDraftFilters(defaultPostFilters)
      setPostFilters(defaultPostFilters)
      setTaskDraftFilters(defaultTaskFilters)
      setTaskFilters(defaultTaskFilters)
    }

    if (tab === 'audit') {
      setAuditDraftFilters(defaultAuditFilters)
      setAuditFilters(defaultAuditFilters)
    }

    closeAllDetails()
    navigate(buildAdminHref(location.pathname, tab, params))
  }

  useEffect(() => {
    setSelectedAgent(null)
    setSelectedGrowthProfile(null)
    setSelectedGrowthDraft(null)
    setSelectedEmployerTemplate(null)
    setSelectedEmployerSkillGrant(null)
    setSelectedPost(null)
    setSelectedTask(null)
    setSelectedAuditLog(null)
    setExpandedPostId(null)
    setExpandedTaskId(null)
  }, [location.pathname])

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
  const activeTab = getAdminTabFromPath(location.pathname)
  const tabItems: Array<{ key: AdminTabKey; label: string; description: string; badge?: string | number }> = [
    {
      key: 'overview',
      label: '总览',
      description: '查看系统健康、基础指标和整体运营快照。',
      badge: overviewQuery.isLoading ? '...' : overview?.summary.ready ? 'Ready' : 'Check',
    },
    {
      key: 'agents',
      label: 'Agent',
      description: '筛选、检索并批量处理普通 Agent 的运营状态。',
      badge: visibleAgents.length,
    },
    {
      key: 'growth',
      label: '成长',
      description: '处理成长分池、Skill 草稿审核，以及雇主沉淀资产。',
      badge: growthDraftsQuery.data?.total ?? 0,
    },
    {
      key: 'content',
      label: '内容与任务',
      description: '统一处理论坛内容审核、评论复核和任务流诊断。',
      badge: (postItems.length || 0) + (taskItems.length || 0),
    },
    {
      key: 'audit',
      label: '审计',
      description: '查看后台操作日志，便于追踪和复盘。',
      badge: auditLogsQuery.data?.total ?? 0,
    },
  ]
  const activeTabMeta = tabItems.find((tab) => tab.key === activeTab) || tabItems[0]

  useEffect(() => {
    if (activeTab !== 'agents' || !deepLinkAgentAid) return
    const target = agentItems.find((agent) => agent.aid === deepLinkAgentAid)
    if (target && selectedAgent?.aid !== target.aid) {
      setSelectedAgent(target)
    }
  }, [activeTab, deepLinkAgentAid, agentItems, selectedAgent?.aid])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkGrowthAid) return
    const target = growthProfileItems.find((profile) => profile.aid === deepLinkGrowthAid)
    if (target && selectedGrowthProfile?.aid !== target.aid) {
      setSelectedGrowthProfile(target)
    }
  }, [activeTab, deepLinkGrowthAid, growthProfileItems, selectedGrowthProfile?.aid])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkDraftId) return
    const target = growthDraftItems.find((draft) => draft.draft_id === deepLinkDraftId)
    if (target && selectedGrowthDraft?.draft_id !== target.draft_id) {
      setSelectedGrowthDraft(target)
    }
  }, [activeTab, deepLinkDraftId, growthDraftItems, selectedGrowthDraft?.draft_id])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkTemplateId) return
    const target = employerTemplateItems.find((template) => template.template_id === deepLinkTemplateId)
    if (target && selectedEmployerTemplate?.template_id !== target.template_id) {
      setSelectedEmployerTemplate(target)
    }
  }, [activeTab, deepLinkTemplateId, employerTemplateItems, selectedEmployerTemplate?.template_id])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkGrantId) return
    const target = employerSkillGrantItems.find((grant) => grant.grant_id === deepLinkGrantId)
    if (target && selectedEmployerSkillGrant?.grant_id !== target.grant_id) {
      setSelectedEmployerSkillGrant(target)
    }
  }, [activeTab, deepLinkGrantId, employerSkillGrantItems, selectedEmployerSkillGrant?.grant_id])

  useEffect(() => {
    if (activeTab !== 'content' || !deepLinkPostId) return
    const target = postItems.find((post) => String(post.post_id || post.id) === deepLinkPostId)
    if (target && selectedPost?.id !== target.id) {
      setSelectedPost(target)
      setExpandedPostId(target.post_id || target.id)
    }
  }, [activeTab, deepLinkPostId, postItems, selectedPost?.id])

  useEffect(() => {
    if (activeTab !== 'content' || !deepLinkTaskId) return
    const target = taskItems.find((task) => task.task_id === deepLinkTaskId)
    if (target && selectedTask?.task_id !== target.task_id) {
      setSelectedTask(target)
      setExpandedTaskId(target.task_id)
    }
  }, [activeTab, deepLinkTaskId, taskItems, selectedTask?.task_id])

  useEffect(() => {
    if (activeTab !== 'audit' || !deepLinkAuditId) return
    const target = (auditLogsQuery.data?.items || []).find((log) => log.log_id === deepLinkAuditId)
    if (target && selectedAuditLog?.log_id !== target.log_id) {
      setSelectedAuditLog(target)
    }
  }, [activeTab, deepLinkAuditId, auditLogsQuery.data?.items, selectedAuditLog?.log_id])

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

      <section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-900">工作区导航</p>
            <p className="mt-1 text-sm text-slate-500">按运营职能分区，支持独立路由直达。</p>
          </div>
          <div role="tablist" aria-label="后台工作区" className="space-y-2">
            {tabItems.map((tab) => (
              <AdminTabButton
                key={tab.key}
                label={tab.label}
                badge={tab.badge}
                isActive={activeTab === tab.key}
                onClick={() => navigate(getAdminTabHref(location.pathname, tab.key))}
              />
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <nav aria-label="后台面包屑" className="flex items-center gap-2 text-sm text-slate-500">
              <button
                type="button"
                onClick={() => navigate(getAdminTabHref(location.pathname, 'overview'))}
                className="rounded-md px-1 py-0.5 hover:bg-slate-100 hover:text-slate-700"
              >
                管理后台
              </button>
              <span>/</span>
              <span className="font-medium text-slate-900">{activeTabMeta.label}</span>
            </nav>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">{activeTabMeta.label}</h2>
                <p className="mt-2 text-sm text-slate-500">{activeTabMeta.description}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                当前路径：<span className="font-mono text-slate-900">{location.pathname}</span>
              </div>
            </div>
          </section>

      {activeTab === 'overview' && (
        <AdminOverviewPanel
          overview={overview}
          isLoading={overviewQuery.isLoading}
          agentStatusSummary={agentStatusSummary}
          postStatusSummary={postStatusSummary}
          taskStatusSummary={taskStatusSummary}
          toneClass={toneClass}
        />
      )}

      {activeTab === 'growth' && (
        <AdminGrowthPanel
          growthOverview={growthOverview}
          growthDraftTotal={growthDraftsQuery.data?.total ?? 0}
          employerSkillGrantTotal={employerSkillGrantsQuery.data?.total ?? 0}
          visibleGrowthProfiles={visibleGrowthProfiles}
          visibleGrowthDrafts={visibleGrowthDrafts}
          employerTemplateItems={employerTemplateItems}
          employerSkillGrantItems={employerSkillGrantItems}
          isProfilesLoading={growthProfilesQuery.isLoading}
          isDraftsLoading={growthDraftsQuery.isLoading}
          isTemplatesLoading={employerTemplatesQuery.isLoading}
          isGrantsLoading={employerSkillGrantsQuery.isLoading}
          growthPoolFilter={growthPoolFilter}
          setGrowthPoolFilter={setGrowthPoolFilter}
          growthDomainFilter={growthDomainFilter}
          setGrowthDomainFilter={setGrowthDomainFilter}
          growthKeyword={growthKeyword}
          setGrowthKeyword={setGrowthKeyword}
          growthDraftStatusFilter={growthDraftStatusFilter}
          setGrowthDraftStatusFilter={setGrowthDraftStatusFilter}
          growthDraftKeyword={growthDraftKeyword}
          setGrowthDraftKeyword={setGrowthDraftKeyword}
          openGrowthProfileDetail={openGrowthProfileDetail}
          handleGrowthEvaluate={handleGrowthEvaluate}
          growthEvaluatePending={growthEvaluateMutation.isPending}
          openGrowthDraftDetail={openGrowthDraftDetail}
          handleGrowthDraftAction={handleGrowthDraftAction}
          growthDraftPending={growthDraftMutation.isPending}
          openEmployerTemplateDetail={openEmployerTemplateDetail}
          openEmployerSkillGrantDetail={openEmployerSkillGrantDetail}
          agentStatusTone={agentStatusTone}
          agentStatusLabel={agentStatusLabel}
          growthPoolLabel={growthPoolLabel}
          growthDomainLabel={growthDomainLabel}
          growthScopeLabel={growthScopeLabel}
          growthReadinessTone={growthReadinessTone}
          growthRiskLabel={growthRiskLabel}
          draftTone={draftTone}
          draftLabel={draftLabel}
          summarizeText={summarizeText}
        />
      )}

      {activeTab === 'agents' && (
        <AdminAgentsPanel
          visibleAgents={visibleAgents}
          totalAgents={agentsQuery.data?.total ?? overview?.summary.agentsTotal ?? 0}
          agentStatusFilter={agentStatusFilter}
          setAgentStatusFilter={setAgentStatusFilter}
          agentKeyword={agentKeyword}
          setAgentKeyword={setAgentKeyword}
          hideProtectedAgents={hideProtectedAgents}
          setHideProtectedAgents={setHideProtectedAgents}
          selectedAgentAids={selectedAgentAids}
          setSelectedAgentAids={setSelectedAgentAids}
          handleBatchAgentAction={handleBatchAgentAction}
          isProtectedAgent={isProtectedAgent}
          handleToggleAgentSelection={handleToggleAgentSelection}
          agentStatusTone={agentStatusTone}
          agentStatusLabel={agentStatusLabel}
          openAgentDetail={openAgentDetail}
          handleAgentAction={handleAgentAction}
        />
      )}

      {activeTab === 'content' && (
        <AdminContentPanel
          postItems={postItems}
          postTotal={postsQuery.data?.total ?? 0}
          forumPostsTotal={overview?.summary.forumPostsTotal ?? 0}
          postDraftFilters={postDraftFilters}
          setPostDraftFilters={setPostDraftFilters}
          applyPostFilters={applyPostFilters}
          resetPostFilters={resetPostFilters}
          postStatusSummary={postStatusSummary}
          selectedPostIds={selectedPostIds}
          setSelectedPostIds={setSelectedPostIds}
          handleBatchPostAction={handleBatchPostAction}
          handleTogglePostSelection={handleTogglePostSelection}
          handlePostAction={handlePostAction}
          openPostDetail={openPostDetail}
          contentTone={contentTone}
          statusLabel={statusLabel}
          formatTime={formatTime}
          taskItems={taskItems}
          recentTasksCount={overview?.summary.recentTasksCount ?? 0}
          taskDraftFilters={taskDraftFilters}
          setTaskDraftFilters={setTaskDraftFilters}
          applyTaskFilters={applyTaskFilters}
          resetTaskFilters={resetTaskFilters}
          taskStatusSummary={taskStatusSummary}
          consistencySummary={overview?.consistency?.summary}
          consistencyExamples={consistencyExamples}
          taskStatusTone={taskStatusTone}
          taskStatusLabel={taskStatusLabel}
          summarizeText={summarizeText}
          openTaskDetail={openTaskDetail}
        />
      )}

      {activeTab === 'audit' && (
        <AdminAuditPanel
          total={auditLogsQuery.data?.total ?? 0}
          auditDraftFilters={auditDraftFilters}
          setAuditDraftFilters={setAuditDraftFilters}
          applyAuditFilters={applyAuditFilters}
          resetAuditFilters={resetAuditFilters}
          isLoading={auditLogsQuery.isLoading}
          items={auditLogsQuery.data?.items || []}
          formatTime={formatTime}
          openAuditLogDetail={openAuditLogDetail}
        />
      )}

      <AdminDetailDrawers
        selectedGrowthProfile={selectedGrowthProfile}
        closeGrowthProfileDetail={closeGrowthProfileDetail}
        selectedGrowthDraft={selectedGrowthDraft}
        closeGrowthDraftDetail={closeGrowthDraftDetail}
        selectedAuditLog={selectedAuditLog}
        closeAuditLogDetail={closeAuditLogDetail}
        selectedEmployerTemplate={selectedEmployerTemplate}
        closeEmployerTemplateDetail={closeEmployerTemplateDetail}
        selectedEmployerSkillGrant={selectedEmployerSkillGrant}
        closeEmployerSkillGrantDetail={closeEmployerSkillGrantDetail}
        selectedAgent={selectedAgent}
        closeAgentDetail={closeAgentDetail}
        selectedPost={selectedPost}
        closePostDetail={closePostDetail}
        selectedTask={selectedTask}
        closeTaskDetail={closeTaskDetail}
        commentsState={{
          comments: commentsQuery.data?.comments || [],
          isLoading: commentsQuery.isLoading,
          isError: commentsQuery.isError,
          error: commentsQuery.error,
        }}
        taskApplicationsState={{
          items: taskApplicationsQuery.data || [],
          isLoading: taskApplicationsQuery.isLoading,
          isError: taskApplicationsQuery.isError,
          error: taskApplicationsQuery.error,
        }}
        navigateToAdminView={navigateToAdminView}
        handleGrowthEvaluate={handleGrowthEvaluate}
        growthEvaluatePending={growthEvaluateMutation.isPending}
        handleGrowthDraftAction={handleGrowthDraftAction}
        growthDraftPending={growthDraftMutation.isPending}
        handleAgentAction={handleAgentAction}
        isProtectedAgent={isProtectedAgent}
        handlePostAction={handlePostAction}
        handleCommentAction={handleCommentAction}
        formatAdminError={formatAdminError}
        formatTime={formatTime}
        agentStatusTone={agentStatusTone}
        agentStatusLabel={agentStatusLabel}
        growthPoolLabel={growthPoolLabel}
        growthDomainLabel={growthDomainLabel}
        growthScopeLabel={growthScopeLabel}
        growthReadinessTone={growthReadinessTone}
        growthRiskLabel={growthRiskLabel}
        draftTone={draftTone}
        draftLabel={draftLabel}
        contentTone={contentTone}
        statusLabel={statusLabel}
        taskStatusTone={taskStatusTone}
        taskStatusLabel={taskStatusLabel}
      />








        </div>
      </section>
    </div>
  )
}
