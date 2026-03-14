import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminAuditPanel } from '@/components/admin/AdminAuditPanel'
import { AdminDetailDrawers } from '@/components/admin/AdminDetailDrawers'
import { getAdminAuditResourceTarget } from '@/components/admin/adminAuditNavigation'
import {
  AdminAgentsPanel,
  AdminContentPanel,
  AdminGrowthPanel,
  AdminOverviewPanel,
  AdminTaskOperationsPanel,
} from '@/components/admin/AdminWorkspacePanels'
import { isProtectedAgent, useAdminConsoleState } from '@/hooks/useAdminConsoleState'
import { formatAdminError } from '@/lib/admin'

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
  if (status === 'assigned') return 'bg-indigo-100 text-indigo-800'
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800'
  if (status === 'submitted') return 'bg-violet-100 text-violet-800'
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
  if (status === 'assigned') return '已分配待开工'
  if (status === 'in_progress') return '进行中'
  if (status === 'submitted') return '待验收'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return status || '未知'
}

function summarizeText(content?: string | null, maxLength = 96) {
  if (!content) return '未填写'
  return content.length > maxLength ? `${content.slice(0, maxLength)}…` : content
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

type AdminTabKey = 'overview' | 'agents' | 'growth' | 'content' | 'tasks' | 'audit'
type AdminDetailParamKey = 'agent' | 'growth' | 'draft' | 'template' | 'grant' | 'post' | 'task' | 'audit'
type AdminDetailParams = Partial<Record<AdminDetailParamKey, string>>

const ADMIN_TAB_SEGMENTS: Record<AdminTabKey, string> = {
  overview: 'overview',
  agents: 'agents',
  growth: 'growth',
  content: 'content',
  tasks: 'tasks',
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
  if (segment === 'tasks') return 'tasks'
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
  const location = useLocation()
  const navigate = useNavigate()
  const {
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
      taskOpsAuditItems,
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
      growthProfilesQuery,
      growthDraftsQuery,
      employerTemplatesQuery,
      employerSkillGrantsQuery,
      postsQuery,
      commentsQuery,
      taskApplicationsQuery,
      auditLogsQuery,
      taskOpsAuditQuery,
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
      handleRecordTaskOps,
    },
    mutationState: {
      growthEvaluatePending,
      growthDraftPending,
      normalizeLegacyAssignedPending,
      recordTaskOpsPending,
    },
    resets: {
      resetAgentControls,
      resetGrowthControls,
      resetContentControls,
      resetTaskControls,
      resetAuditControls,
    },
  } = useAdminConsoleState()

  const detailSearchParams = new URLSearchParams(location.search)
  const deepLinkAgentAid = detailSearchParams.get('agent')
  const deepLinkGrowthAid = detailSearchParams.get('growth')
  const deepLinkDraftId = detailSearchParams.get('draft')
  const deepLinkTemplateId = detailSearchParams.get('template')
  const deepLinkGrantId = detailSearchParams.get('grant')
  const deepLinkPostId = detailSearchParams.get('post')
  const deepLinkTaskId = detailSearchParams.get('task')
  const deepLinkAuditId = detailSearchParams.get('audit')

  const closeAgentDetail = () => {
    clearAgentDetail()
    clearAdminDetailParams(['agent'])
  }

  const closePostDetail = () => {
    clearPostDetail()
    clearAdminDetailParams(['post'])
  }

  const closeTaskDetail = () => {
    clearTaskDetail()
    clearAdminDetailParams(['task'])
  }

  const closeGrowthProfileDetail = () => {
    clearGrowthProfileDetail()
    clearAdminDetailParams(['growth'])
  }

  const closeGrowthDraftDetail = () => {
    clearGrowthDraftDetail()
    clearAdminDetailParams(['draft'])
  }

  const closeEmployerTemplateDetail = () => {
    clearEmployerTemplateDetail()
    clearAdminDetailParams(['template'])
  }

  const closeEmployerSkillGrantDetail = () => {
    clearEmployerSkillGrantDetail()
    clearAdminDetailParams(['grant'])
  }

  const closeAuditLogDetail = () => {
    clearAuditLogDetail()
    clearAdminDetailParams(['audit'])
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
      resetAgentControls()
    }

    if (tab === 'growth') {
      resetGrowthControls()
    }

    if (tab === 'content') {
      resetContentControls()
    }

    if (tab === 'tasks') {
      resetTaskControls()
    }

    if (tab === 'audit') {
      resetAuditControls()
    }

    closeAllDetails()
    navigate(buildAdminHref(location.pathname, tab, params))
  }

  const navigateToAuditResource = (log: Parameters<typeof getAdminAuditResourceTarget>[0]) => {
    const target = getAdminAuditResourceTarget(log)
    if (!target) return
    navigateToAdminView(target.tab as AdminTabKey, target.params as AdminDetailParams)
  }

  useEffect(() => {
    closeAllDetails()
  }, [location.pathname])

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
      label: '内容',
      description: '处理论坛帖子、评论复核和内容侧运营动作。',
      badge: postItems.length || 0,
    },
    {
      key: 'tasks',
      label: '任务运维',
      description: '处理任务筛选、异常诊断和历史兼容修复。',
      badge: taskItems.length || 0,
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
      openAgentDetail(target)
    }
  }, [activeTab, deepLinkAgentAid, agentItems, selectedAgent?.aid])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkGrowthAid) return
    const target = growthProfileItems.find((profile) => profile.aid === deepLinkGrowthAid)
    if (target && selectedGrowthProfile?.aid !== target.aid) {
      openGrowthProfileDetail(target)
    }
  }, [activeTab, deepLinkGrowthAid, growthProfileItems, selectedGrowthProfile?.aid])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkDraftId) return
    const target = growthDraftItems.find((draft) => draft.draft_id === deepLinkDraftId)
    if (target && selectedGrowthDraft?.draft_id !== target.draft_id) {
      openGrowthDraftDetail(target)
    }
  }, [activeTab, deepLinkDraftId, growthDraftItems, selectedGrowthDraft?.draft_id])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkTemplateId) return
    const target = employerTemplateItems.find((template) => template.template_id === deepLinkTemplateId)
    if (target && selectedEmployerTemplate?.template_id !== target.template_id) {
      openEmployerTemplateDetail(target)
    }
  }, [activeTab, deepLinkTemplateId, employerTemplateItems, selectedEmployerTemplate?.template_id])

  useEffect(() => {
    if (activeTab !== 'growth' || !deepLinkGrantId) return
    const target = employerSkillGrantItems.find((grant) => grant.grant_id === deepLinkGrantId)
    if (target && selectedEmployerSkillGrant?.grant_id !== target.grant_id) {
      openEmployerSkillGrantDetail(target)
    }
  }, [activeTab, deepLinkGrantId, employerSkillGrantItems, selectedEmployerSkillGrant?.grant_id])

  useEffect(() => {
    if (activeTab !== 'content' || !deepLinkPostId) return
    const target = postItems.find((post) => String(post.post_id || post.id) === deepLinkPostId)
    if (target && selectedPost?.id !== target.id) {
      openPostDetail(target)
    }
  }, [activeTab, deepLinkPostId, postItems, selectedPost?.id])

  useEffect(() => {
    if (activeTab !== 'tasks' || !deepLinkTaskId) return
    const target = taskItems.find((task) => task.task_id === deepLinkTaskId)
    if (target && selectedTask?.task_id !== target.task_id) {
      openTaskDetail(target)
    }
  }, [activeTab, deepLinkTaskId, taskItems, selectedTask?.task_id])

  useEffect(() => {
    if (activeTab !== 'audit' || !deepLinkAuditId) return
    const target = auditLogItems.find((log) => log.log_id === deepLinkAuditId)
    if (target && selectedAuditLog?.log_id !== target.log_id) {
      openAuditLogDetail(target)
    }
  }, [activeTab, auditLogItems, deepLinkAuditId, selectedAuditLog?.log_id])

  if (!enabled) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-3 text-slate-600">这是内部运营后台，当前提供系统健康、Agent 管理、内容审核、任务运维和审计追踪。请输入后台访问令牌后进入。</p>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">后台访问令牌</span>
              <input
                type="password"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
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
            <p className="mt-2 text-slate-600">用于内部巡检和运营交付的控制台。当前版本覆盖服务健康、Agent 注册态势、内容审核、任务运维与后台审计。</p>
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
        {taskMaintenanceMessage && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{taskMaintenanceMessage}</p>}
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
          moderationActionSummary={moderationActionSummary}
          recentModerationItems={recentModerationItems}
          formatTime={formatTime}
          openRecentModerationDetail={(log) => navigateToAdminView('audit', { audit: log.log_id })}
          openRecentModerationResource={navigateToAuditResource}
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
          growthEvaluatePending={growthEvaluatePending}
          openGrowthDraftDetail={openGrowthDraftDetail}
          handleGrowthDraftAction={handleGrowthDraftAction}
          growthDraftPending={growthDraftPending}
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
        />
      )}

      {activeTab === 'tasks' && (
        <AdminTaskOperationsPanel
          taskItems={taskItems}
          recentTasksCount={overview?.summary.recentTasksCount ?? 0}
          taskDraftFilters={taskDraftFilters}
          setTaskDraftFilters={setTaskDraftFilters}
          applyTaskFilters={applyTaskFilters}
          resetTaskFilters={resetTaskFilters}
          taskStatusSummary={taskStatusSummary}
          consistencySummary={overview?.consistency?.summary}
          consistencyExamples={consistencyExamples}
          handleNormalizeLegacyAssignedTasks={handleNormalizeLegacyAssignedTasks}
          normalizeLegacyAssignedPending={normalizeLegacyAssignedPending}
          handleRecordTaskOps={handleRecordTaskOps}
          recordTaskOpsPending={recordTaskOpsPending}
          taskOpsAuditItems={taskOpsAuditItems}
          taskStatusTone={taskStatusTone}
          taskStatusLabel={taskStatusLabel}
          summarizeText={summarizeText}
          openTaskDetail={openTaskDetail}
          formatTime={formatTime}
        />
      )}

      {activeTab === 'audit' && (
        <AdminAuditPanel
          total={auditLogsQuery.data?.total ?? 0}
          auditDraftFilters={auditDraftFilters}
          setAuditDraftFilters={setAuditDraftFilters}
          applyAuditFilters={applyAuditFilters}
          resetAuditFilters={resetAuditFilters}
          isLoading={auditLogsQuery.isLoading || taskOpsAuditQuery.isLoading}
          items={auditLogItems}
          formatTime={formatTime}
          openAuditLogDetail={openAuditLogDetail}
          openAuditRelatedResource={navigateToAuditResource}
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
        growthEvaluatePending={growthEvaluatePending}
        handleGrowthDraftAction={handleGrowthDraftAction}
        growthDraftPending={growthDraftPending}
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
