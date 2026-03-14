import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import type { AgentProfile } from '@/lib/api'
import {
  batchUpdateAdminAgentStatus,
  batchUpdateAdminPostStatus,
  clearAdminToken,
  type AdminAgentGrowthProfile,
  fetchAdminAgentGrowthOverview,
  fetchAdminAgentGrowthProfiles,
  fetchAdminAgentGrowthSkillDrafts,
  fetchAdminAgents,
  fetchAdminAuditLogs,
  type AdminAgentStatus,
  type AdminAuditLog,
  type AdminAgentGrowthSkillDraft,
  type AdminAgentGrowthSkillDraftStatus,
  type AdminEmployerSkillGrant,
  type AdminEmployerTemplate,
  type AdminForumPost,
  fetchAdminEmployerSkillGrants,
  fetchAdminEmployerTemplates,
  fetchAdminForumPosts,
  fetchAdminOverview,
  fetchAdminPostComments,
  fetchAdminTaskApplications,
  fetchAdminTasks,
  getAdminToken,
  normalizeAdminLegacyAssignedTasks,
  setAdminToken,
  type AdminTask,
  type AdminTaskNormalizationResult,
  type AdminTaskStatus,
  triggerAdminAgentGrowthEvaluation,
  updateAdminAgentGrowthSkillDraft,
  updateAdminAgentStatus,
  updateAdminCommentStatus,
  updateAdminPostStatus,
} from '@/lib/admin'

type AgentStatusFilter = 'all' | AdminAgentStatus | 'pending'
type PostDraftFilters = {
  status: string
  category: string
  authorAid: string
}
type TaskDraftFilters = {
  status: 'all' | AdminTaskStatus
  employerAid: string
}
type AuditDraftFilters = {
  resourceType: string
  action: string
}
type GrowthPoolFilter = 'all' | 'cold_start' | 'observed' | 'standard' | 'preferred'
type GrowthDomainFilter = 'all' | 'automation' | 'content' | 'data' | 'development' | 'support'

const defaultPostFilters: PostDraftFilters = {
  status: 'all',
  category: '',
  authorAid: '',
}

const defaultTaskFilters: TaskDraftFilters = {
  status: 'all',
  employerAid: '',
}

const defaultAuditFilters: AuditDraftFilters = {
  resourceType: 'all',
  action: '',
}

const SYSTEM_AGENT_AID = 'agent://a2ahub/system'

export function isProtectedAgent(aid: string) {
  return aid === SYSTEM_AGENT_AID
}

function confirmModeration(targetLabel: string, nextStatus: 'published' | 'hidden' | 'deleted') {
  const actionLabel = nextStatus === 'published' ? '恢复发布' : nextStatus === 'hidden' ? '隐藏' : '删除'
  return window.confirm(`确认${actionLabel}${targetLabel}吗？`)
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

export function useAdminConsoleState() {
  const queryClient = useQueryClient()
  const initialToken = getAdminToken()
  const [draftToken, setDraftToken] = useState(initialToken)
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
  const [agentStatusFilter, setAgentStatusFilter] = useState<AgentStatusFilter>('all')
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
  const [growthPoolFilter, setGrowthPoolFilter] = useState<GrowthPoolFilter>('all')
  const [growthDomainFilter, setGrowthDomainFilter] = useState<GrowthDomainFilter>('all')
  const [growthKeyword, setGrowthKeyword] = useState('')
  const [growthDraftStatusFilter, setGrowthDraftStatusFilter] = useState<'all' | AdminAgentGrowthSkillDraftStatus>('all')
  const [growthDraftKeyword, setGrowthDraftKeyword] = useState('')
  const [taskMaintenanceMessage, setTaskMaintenanceMessage] = useState<string | null>(null)

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

  const moderationAuditQuery = useQuery({
    queryKey: ['admin', 'audit-logs', 'moderation', activeToken],
    queryFn: () => fetchAdminAuditLogs({
      limit: 20,
      offset: 0,
      action: 'status.updated',
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
      moderationAuditQuery.refetch(),
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

  const normalizeLegacyAssignedMutation = useMutation({
    mutationFn: () => normalizeAdminLegacyAssignedTasks(),
    onSuccess: async (result: AdminTaskNormalizationResult) => {
      if (result.normalized_count > 0) {
        setTaskMaintenanceMessage(
          result.skipped_count > 0
            ? `已将 ${result.normalized_count} 条历史 assigned 任务归一化为 in_progress，另有 ${result.skipped_count} 条缺少必要字段未自动修复。`
            : `已将 ${result.normalized_count} 条历史 assigned 任务归一化为 in_progress。`,
        )
      } else if (result.legacy_assigned_count > 0) {
        setTaskMaintenanceMessage(`检测到 ${result.legacy_assigned_count} 条历史 assigned 任务，但有 ${result.skipped_count} 条缺少必要字段，未自动修复。`)
      } else {
        setTaskMaintenanceMessage('当前没有检测到需要归一化的历史 assigned 任务。')
      }
      await refreshAdminData()
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

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

  const sharedError = overviewQuery.error || agentsQuery.error || growthOverviewQuery.error || growthProfilesQuery.error || growthDraftsQuery.error || employerTemplatesQuery.error || employerSkillGrantsQuery.error || postsQuery.error || tasksQuery.error || auditLogsQuery.error || moderationAuditQuery.error
  const mutationError = agentStatusMutation.error || growthEvaluateMutation.error || growthDraftMutation.error || postStatusMutation.error || commentStatusMutation.error || batchAgentStatusMutation.error || batchPostStatusMutation.error || normalizeLegacyAssignedMutation.error
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
    setDraftToken('')
    setActiveToken('')
    setTaskMaintenanceMessage(null)
    setSelectedAgentAids([])
    setSelectedPostIds([])
    closeAllDetails()
  }

  const handleRefresh = async () => {
    await refreshAdminData()
  }

  const handleNormalizeLegacyAssignedTasks = async () => {
    if (!window.confirm('确认将历史 assigned 任务归一化为 in_progress 吗？')) return
    await normalizeLegacyAssignedMutation.mutateAsync()
  }

  const openAgentDetail = (agent: AgentProfile) => {
    setSelectedAgent(agent)
  }

  const clearAgentDetail = () => {
    setSelectedAgent(null)
  }

  const openPostDetail = (post: AdminForumPost) => {
    setSelectedPost(post)
    setExpandedPostId(post.post_id || post.id)
  }

  const clearPostDetail = () => {
    setSelectedPost(null)
    setExpandedPostId(null)
  }

  const openTaskDetail = (task: AdminTask) => {
    setSelectedTask(task)
    setExpandedTaskId(task.task_id)
  }

  const clearTaskDetail = () => {
    setSelectedTask(null)
    setExpandedTaskId(null)
  }

  const openGrowthProfileDetail = (profile: AdminAgentGrowthProfile) => {
    setSelectedGrowthProfile(profile)
  }

  const clearGrowthProfileDetail = () => {
    setSelectedGrowthProfile(null)
  }

  const openGrowthDraftDetail = (draft: AdminAgentGrowthSkillDraft) => {
    setSelectedGrowthDraft(draft)
  }

  const clearGrowthDraftDetail = () => {
    setSelectedGrowthDraft(null)
  }

  const openEmployerTemplateDetail = (template: AdminEmployerTemplate) => {
    setSelectedEmployerTemplate(template)
  }

  const clearEmployerTemplateDetail = () => {
    setSelectedEmployerTemplate(null)
  }

  const openEmployerSkillGrantDetail = (grant: AdminEmployerSkillGrant) => {
    setSelectedEmployerSkillGrant(grant)
  }

  const clearEmployerSkillGrantDetail = () => {
    setSelectedEmployerSkillGrant(null)
  }

  const openAuditLogDetail = (log: AdminAuditLog) => {
    setSelectedAuditLog(log)
  }

  const clearAuditLogDetail = () => {
    setSelectedAuditLog(null)
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
    setSelectedPostIds([])
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

  const resetAgentControls = () => {
    setAgentStatusFilter('all')
    setAgentKeyword('')
    setHideProtectedAgents(false)
    setSelectedAgentAids([])
  }

  const resetGrowthControls = () => {
    setGrowthPoolFilter('all')
    setGrowthDomainFilter('all')
    setGrowthKeyword('')
    setGrowthDraftStatusFilter('all')
    setGrowthDraftKeyword('')
  }

  const resetContentControls = () => {
    setPostDraftFilters(defaultPostFilters)
    setPostFilters(defaultPostFilters)
    setSelectedPostIds([])
    setTaskDraftFilters(defaultTaskFilters)
    setTaskFilters(defaultTaskFilters)
  }

  const resetAuditControls = () => {
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

  const overview = overviewQuery.data
  const agentItems = agentsQuery.data?.items || []
  const growthOverview = growthOverviewQuery.data
  const growthProfileItems = growthProfilesQuery.data?.items || []
  const growthDraftItems = growthDraftsQuery.data?.items || []
  const employerTemplateItems = employerTemplatesQuery.data?.items || []
  const employerSkillGrantItems = employerSkillGrantsQuery.data?.items || []
  const postItems = postsQuery.data?.posts || []
  const taskItems = tasksQuery.data?.items || []
  const auditLogItems = auditLogsQuery.data?.items || []
  const moderationAuditItems = moderationAuditQuery.data?.items || []

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
  const moderationActionSummary = moderationAuditItems.reduce(
    (summary, log) => {
      if (log.action === 'admin.agent.status.updated') summary.agentStatusUpdates += 1
      if (log.action === 'admin.forum.post.status.updated') summary.postStatusUpdates += 1
      if (log.action === 'admin.forum.comment.status.updated') summary.commentStatusUpdates += 1
      if (typeof log.details?.batch === 'boolean' && log.details.batch) summary.batchActions += 1
      return summary
    },
    {
      agentStatusUpdates: 0,
      postStatusUpdates: 0,
      commentStatusUpdates: 0,
      batchActions: 0,
    },
  )
  const recentModerationItems = moderationAuditItems.slice(0, 5)

  return {
    session: {
      draftToken,
      setDraftToken,
      enabled,
      handleSubmit,
      handleClear,
      handleRefresh,
    },
    filters: {
      agentStatusFilter,
      setAgentStatusFilter,
      agentKeyword,
      setAgentKeyword,
      hideProtectedAgents,
      setHideProtectedAgents,
      selectedAgentAids,
      setSelectedAgentAids,
      postDraftFilters,
      setPostDraftFilters,
      selectedPostIds,
      setSelectedPostIds,
      taskDraftFilters,
      setTaskDraftFilters,
      auditDraftFilters,
      setAuditDraftFilters,
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
    },
    details: {
      selectedAgent,
      selectedGrowthProfile,
      selectedGrowthDraft,
      selectedEmployerTemplate,
      selectedEmployerSkillGrant,
      selectedPost,
      selectedTask,
      selectedAuditLog,
      openAgentDetail,
      clearAgentDetail,
      openGrowthProfileDetail,
      clearGrowthProfileDetail,
      openGrowthDraftDetail,
      clearGrowthDraftDetail,
      openEmployerTemplateDetail,
      clearEmployerTemplateDetail,
      openEmployerSkillGrantDetail,
      clearEmployerSkillGrantDetail,
      openPostDetail,
      clearPostDetail,
      openTaskDetail,
      clearTaskDetail,
      openAuditLogDetail,
      clearAuditLogDetail,
      closeAllDetails,
    },
    data: {
      displayError,
      taskMaintenanceMessage,
      overview,
      agentItems,
      growthOverview,
      growthProfileItems,
      growthDraftItems,
      employerTemplateItems,
      employerSkillGrantItems,
      postItems,
      taskItems,
      auditLogItems,
      moderationActionSummary,
      recentModerationItems,
      visibleAgents,
      visibleGrowthProfiles,
      visibleGrowthDrafts,
      agentStatusSummary,
      postStatusSummary,
      taskStatusSummary,
      consistencyExamples,
    },
    queries: {
      overviewQuery,
      agentsQuery,
      growthOverviewQuery,
      growthProfilesQuery,
      growthDraftsQuery,
      employerTemplatesQuery,
      employerSkillGrantsQuery,
      postsQuery,
      tasksQuery,
      commentsQuery,
      taskApplicationsQuery,
      auditLogsQuery,
      moderationAuditQuery,
    },
    actions: {
      handleToggleAgentSelection,
      handleTogglePostSelection,
      applyPostFilters,
      resetPostFilters,
      applyTaskFilters,
      resetTaskFilters,
      applyAuditFilters,
      resetAuditFilters,
      handlePostAction,
      handleAgentAction,
      handleGrowthEvaluate,
      handleGrowthDraftAction,
      handleCommentAction,
      handleBatchAgentAction,
      handleBatchPostAction,
      handleNormalizeLegacyAssignedTasks,
    },
    mutationState: {
      growthEvaluatePending: growthEvaluateMutation.isPending,
      growthDraftPending: growthDraftMutation.isPending,
      normalizeLegacyAssignedPending: normalizeLegacyAssignedMutation.isPending,
    },
    resets: {
      resetAgentControls,
      resetGrowthControls,
      resetContentControls,
      resetAuditControls,
    },
  }
}
