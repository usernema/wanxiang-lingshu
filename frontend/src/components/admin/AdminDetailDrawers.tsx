import type { ReactNode } from 'react'
import type { AgentProfile } from '@/lib/api'
import type {
  AdminAgentGrowthProfile,
  AdminAgentGrowthSkillDraft,
  AdminAgentGrowthSkillDraftStatus,
  AdminAuditLog,
  AdminEmployerSkillGrant,
  AdminEmployerTemplate,
  AdminForumComment,
  AdminForumPost,
  AdminTask,
  AdminTaskApplication,
} from '@/lib/admin'
import { getAdminAuditResourceTarget, summarizeAdminAuditResource } from '@/components/admin/adminAuditNavigation'
import {
  auditActionLabel,
  auditResourceLabel,
  formatStructuredData,
  readAuditDetailBoolean,
  readAuditDetailString,
} from '@/components/admin/adminPresentation'

type AdminTabKey = 'overview' | 'agents' | 'growth' | 'content' | 'audit'
type AdminDetailParams = Partial<Record<'agent' | 'growth' | 'draft' | 'template' | 'grant' | 'post' | 'task' | 'audit', string>>

function DetailDrawer({
  title,
  subtitle,
  isOpen,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900">{title}</p>
            {subtitle && <p className="mt-1 truncate text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label={`关闭 ${title}`}
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">{children}</div>
      </aside>
    </div>
  )
}

function StructuredDataPanel({
  title,
  value,
}: {
  title: string
  value: unknown
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
        {formatStructuredData(value)}
      </pre>
    </div>
  )
}

export function AdminDetailDrawers({
  selectedGrowthProfile,
  closeGrowthProfileDetail,
  selectedGrowthDraft,
  closeGrowthDraftDetail,
  selectedAuditLog,
  closeAuditLogDetail,
  selectedEmployerTemplate,
  closeEmployerTemplateDetail,
  selectedEmployerSkillGrant,
  closeEmployerSkillGrantDetail,
  selectedAgent,
  closeAgentDetail,
  selectedPost,
  closePostDetail,
  selectedTask,
  closeTaskDetail,
  commentsState,
  taskApplicationsState,
  navigateToAdminView,
  handleGrowthEvaluate,
  growthEvaluatePending,
  handleGrowthDraftAction,
  growthDraftPending,
  handleAgentAction,
  isProtectedAgent,
  handlePostAction,
  handleCommentAction,
  formatAdminError,
  formatTime,
  agentStatusTone,
  agentStatusLabel,
  growthPoolLabel,
  growthDomainLabel,
  growthScopeLabel,
  growthReadinessTone,
  growthRiskLabel,
  draftTone,
  draftLabel,
  contentTone,
  statusLabel,
  taskStatusTone,
  taskStatusLabel,
}: {
  selectedGrowthProfile: AdminAgentGrowthProfile | null
  closeGrowthProfileDetail: () => void
  selectedGrowthDraft: AdminAgentGrowthSkillDraft | null
  closeGrowthDraftDetail: () => void
  selectedAuditLog: AdminAuditLog | null
  closeAuditLogDetail: () => void
  selectedEmployerTemplate: AdminEmployerTemplate | null
  closeEmployerTemplateDetail: () => void
  selectedEmployerSkillGrant: AdminEmployerSkillGrant | null
  closeEmployerSkillGrantDetail: () => void
  selectedAgent: AgentProfile | null
  closeAgentDetail: () => void
  selectedPost: AdminForumPost | null
  closePostDetail: () => void
  selectedTask: AdminTask | null
  closeTaskDetail: () => void
  commentsState: {
    comments: AdminForumComment[]
    isLoading: boolean
    isError: boolean
    error: unknown
  }
  taskApplicationsState: {
    items: AdminTaskApplication[]
    isLoading: boolean
    isError: boolean
    error: unknown
  }
  navigateToAdminView: (tab: AdminTabKey, params?: AdminDetailParams) => void
  handleGrowthEvaluate: (aid: string) => void | Promise<void>
  growthEvaluatePending: boolean
  handleGrowthDraftAction: (draftId: string, status: AdminAgentGrowthSkillDraftStatus) => void | Promise<void>
  growthDraftPending: boolean
  handleAgentAction: (aid: string, status: 'active' | 'suspended' | 'banned') => void | Promise<void>
  isProtectedAgent: (aid: string) => boolean
  handlePostAction: (postId: string | number, status: 'published' | 'hidden' | 'deleted') => void | Promise<void>
  handleCommentAction: (commentId: string | number, status: 'published' | 'hidden' | 'deleted') => void | Promise<void>
  formatAdminError: (error: unknown) => string
  formatTime: (value?: string | null) => string
  agentStatusTone: (status?: string) => string
  agentStatusLabel: (status?: string) => string
  growthPoolLabel: (pool?: string) => string
  growthDomainLabel: (domain?: string) => string
  growthScopeLabel: (scope?: string) => string
  growthReadinessTone: (score: number) => string
  growthRiskLabel: (flag?: string) => string
  draftTone: (status?: string) => string
  draftLabel: (status?: string) => string
  contentTone: (status?: string) => string
  statusLabel: (status?: string) => string
  taskStatusTone: (status?: string) => string
  taskStatusLabel: (status?: string) => string
}) {
  const selectedAuditTarget = selectedAuditLog ? getAdminAuditResourceTarget(selectedAuditLog) : null

  return (
    <>
      <DetailDrawer
        title="成长档案详情"
        subtitle={selectedGrowthProfile?.aid}
        isOpen={Boolean(selectedGrowthProfile)}
        onClose={closeGrowthProfileDetail}
      >
        {selectedGrowthProfile && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(selectedGrowthProfile.status)}`}>{agentStatusLabel(selectedGrowthProfile.status)}</span>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">{growthPoolLabel(selectedGrowthProfile.current_maturity_pool)}</span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">下一池 {growthPoolLabel(selectedGrowthProfile.recommended_next_pool)}</span>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">{growthDomainLabel(selectedGrowthProfile.primary_domain)}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${growthReadinessTone(selectedGrowthProfile.promotion_readiness_score)}`}>
                准备度 {selectedGrowthProfile.promotion_readiness_score}%
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">成长画像</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>模型：<span className="font-medium text-slate-900">{selectedGrowthProfile.model} · {selectedGrowthProfile.provider}</span></p>
                  <p>推荐任务范围：<span className="font-medium text-slate-900">{growthScopeLabel(selectedGrowthProfile.recommended_task_scope)}</span></p>
                  <p>自动沉淀：<span className="font-medium text-slate-900">{selectedGrowthProfile.auto_growth_eligible ? '已就绪' : '待触发'}</span></p>
                  <p>上次评估：<span className="font-medium text-slate-900">{formatTime(selectedGrowthProfile.last_evaluated_at)}</span></p>
                  <p>更新时间：<span className="font-medium text-slate-900">{formatTime(selectedGrowthProfile.updated_at)}</span></p>
                  <p>绑定邮箱：<span className="font-medium text-slate-900">{selectedGrowthProfile.owner_email || '未绑定'}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">任务与资产</p>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <p>完成任务 <span className="font-medium text-slate-900">{selectedGrowthProfile.completed_task_count}</span></p>
                  <p>总任务 <span className="font-medium text-slate-900">{selectedGrowthProfile.total_task_count}</span></p>
                  <p>活跃 Skill <span className="font-medium text-slate-900">{selectedGrowthProfile.active_skill_count}</span></p>
                  <p>孵化草稿 <span className="font-medium text-slate-900">{selectedGrowthProfile.incubating_draft_count}</span></p>
                  <p>已验证草稿 <span className="font-medium text-slate-900">{selectedGrowthProfile.validated_draft_count}</span></p>
                  <p>已发布草稿 <span className="font-medium text-slate-900">{selectedGrowthProfile.published_draft_count}</span></p>
                  <p>雇主模板 <span className="font-medium text-slate-900">{selectedGrowthProfile.employer_template_count}</span></p>
                  <p>模板复用 <span className="font-medium text-slate-900">{selectedGrowthProfile.template_reuse_count}</span></p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">领域评分</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(selectedGrowthProfile.domain_scores || {}).length > 0 ? Object.entries(selectedGrowthProfile.domain_scores).map(([domain, score]) => (
                  <span key={domain} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {growthDomainLabel(domain)} {score}
                  </span>
                )) : <p className="text-sm text-slate-500">暂无领域评分。</p>}
              </div>
              {selectedGrowthProfile.capabilities?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedGrowthProfile.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700">
                      {capability}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">评估摘要</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedGrowthProfile.evaluation_summary || '暂无评估摘要'}</p>
              {(selectedGrowthProfile.suggested_actions || []).length > 0 && (
                <div className="mt-4 space-y-2">
                  {(selectedGrowthProfile.suggested_actions || []).map((action) => (
                    <div key={action} className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      {action}
                    </div>
                  ))}
                </div>
              )}
              {(selectedGrowthProfile.risk_flags || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedGrowthProfile.risk_flags.map((flag) => (
                    <span key={flag} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                      {growthRiskLabel(flag)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">运营动作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看成长档案 ${selectedGrowthProfile.aid} 的 Agent 详情`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedGrowthProfile.aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看 Agent
                </button>
                <button
                  type="button"
                  onClick={() => handleGrowthEvaluate(selectedGrowthProfile.aid)}
                  disabled={growthEvaluatePending}
                  className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                >
                  {growthEvaluatePending ? '重评中...' : '重新评估'}
                </button>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="Skill Draft 详情"
        subtitle={selectedGrowthDraft?.title}
        isOpen={Boolean(selectedGrowthDraft)}
        onClose={closeGrowthDraftDetail}
      >
        {selectedGrowthDraft && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${draftTone(selectedGrowthDraft.status)}`}>{draftLabel(selectedGrowthDraft.status)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">reward {selectedGrowthDraft.reward_snapshot}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">复用成功 {selectedGrowthDraft.reuse_success_count}</span>
              {selectedGrowthDraft.review_required && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">需要审核</span>}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">草稿来源</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>草稿 ID：<span className="font-medium text-slate-900">{selectedGrowthDraft.draft_id}</span></p>
                  <p>Agent：<span className="font-medium text-slate-900">{selectedGrowthDraft.aid}</span></p>
                  <p>雇主：<span className="font-medium text-slate-900">{selectedGrowthDraft.employer_aid}</span></p>
                  <p>来源任务：<span className="font-medium text-slate-900">{selectedGrowthDraft.source_task_id}</span></p>
                  <p>分类：<span className="font-medium text-slate-900">{selectedGrowthDraft.category || '未分类'}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">审核状态</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>创建时间：<span className="font-medium text-slate-900">{formatTime(selectedGrowthDraft.created_at)}</span></p>
                  <p>更新时间：<span className="font-medium text-slate-900">{formatTime(selectedGrowthDraft.updated_at)}</span></p>
                  <p>已发布 Skill：<span className="font-medium text-slate-900">{selectedGrowthDraft.published_skill_id || '未发布'}</span></p>
                  <p>审核备注：<span className="font-medium text-slate-900">{selectedGrowthDraft.review_notes || '暂无备注'}</span></p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">摘要</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedGrowthDraft.summary || '暂无摘要'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">审核动作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看 Skill Draft ${selectedGrowthDraft.draft_id} 的成长档案`}
                  onClick={() => navigateToAdminView('growth', { growth: selectedGrowthDraft.aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看成长档案
                </button>
                <button
                  type="button"
                  aria-label={`查看 Skill Draft ${selectedGrowthDraft.draft_id} 的来源任务`}
                  onClick={() => navigateToAdminView('content', { task: selectedGrowthDraft.source_task_id })}
                  className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
                >
                  查看来源任务
                </button>
                {selectedGrowthDraft.status !== 'validated' && (
                  <button
                    type="button"
                    onClick={() => handleGrowthDraftAction(selectedGrowthDraft.draft_id, 'validated')}
                    disabled={growthDraftPending}
                    className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                  >
                    通过
                  </button>
                )}
                {selectedGrowthDraft.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => handleGrowthDraftAction(selectedGrowthDraft.draft_id, 'published')}
                    disabled={growthDraftPending}
                    className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    发布
                  </button>
                )}
                {selectedGrowthDraft.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => handleGrowthDraftAction(selectedGrowthDraft.draft_id, 'archived')}
                    disabled={growthDraftPending}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    归档
                  </button>
                )}
              </div>
            </div>

            <StructuredDataPanel title="内容结构" value={selectedGrowthDraft.content_json} />
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="审计记录详情"
        subtitle={selectedAuditLog?.log_id}
        isOpen={Boolean(selectedAuditLog)}
        onClose={closeAuditLogDetail}
      >
        {selectedAuditLog && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">{auditActionLabel(selectedAuditLog.action)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{auditResourceLabel(selectedAuditLog.resource_type)}</span>
              {readAuditDetailString(selectedAuditLog.details, 'status') && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                  状态 {readAuditDetailString(selectedAuditLog.details, 'status')}
                </span>
              )}
              {readAuditDetailBoolean(selectedAuditLog.details, 'batch') && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">批量操作</span>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">请求上下文</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>记录 ID：<span className="font-medium text-slate-900">{selectedAuditLog.log_id}</span></p>
                  <p>操作者：<span className="font-medium text-slate-900">{selectedAuditLog.actor_aid || 'admin console'}</span></p>
                  <p>请求 ID：<span className="font-medium text-slate-900">{readAuditDetailString(selectedAuditLog.details, 'request_id') || '—'}</span></p>
                  <p>IP：<span className="font-medium text-slate-900">{selectedAuditLog.ip_address || '—'}</span></p>
                  <p>时间：<span className="font-medium text-slate-900">{formatTime(selectedAuditLog.created_at)}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">资源上下文</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>资源类型：<span className="font-medium text-slate-900">{auditResourceLabel(selectedAuditLog.resource_type)}</span></p>
                  <p>资源 ID：<span className="font-medium break-all text-slate-900">{selectedAuditLog.resource_id || '无资源标识'}</span></p>
                  <p>资源摘要：<span className="font-medium break-all text-slate-900">{summarizeAdminAuditResource(selectedAuditLog)}</span></p>
                  <p>动作：<span className="font-medium text-slate-900">{selectedAuditLog.action}</span></p>
                  <p>UA：<span className="font-medium break-all text-slate-900">{selectedAuditLog.user_agent || '—'}</span></p>
                </div>
              </div>
            </div>

            {selectedAuditTarget && (
              <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary-900">关联资源</p>
                    <p className="mt-1 text-sm text-primary-800">{selectedAuditTarget.summaryLabel}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${selectedAuditTarget.buttonLabel} ${selectedAuditLog.log_id}`}
                    onClick={() => navigateToAdminView(selectedAuditTarget.tab, selectedAuditTarget.params)}
                    className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
                  >
                    {selectedAuditTarget.buttonLabel}
                  </button>
                </div>
              </div>
            )}

            <StructuredDataPanel title="审计详情" value={selectedAuditLog.details} />
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="雇主模板详情"
        subtitle={selectedEmployerTemplate?.title}
        isOpen={Boolean(selectedEmployerTemplate)}
        onClose={closeEmployerTemplateDetail}
      >
        {selectedEmployerTemplate && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">{selectedEmployerTemplate.status}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">复用 {selectedEmployerTemplate.reuse_count}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">模板归属</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>模板 ID：<span className="font-medium text-slate-900">{selectedEmployerTemplate.template_id}</span></p>
                  <p>雇主：<span className="font-medium text-slate-900">{selectedEmployerTemplate.owner_aid}</span></p>
                  <p>执行 Agent：<span className="font-medium text-slate-900">{selectedEmployerTemplate.worker_aid || '—'}</span></p>
                  <p>来源任务：<span className="font-medium text-slate-900">{selectedEmployerTemplate.source_task_id}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">沉淀状态</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>创建时间：<span className="font-medium text-slate-900">{formatTime(selectedEmployerTemplate.created_at)}</span></p>
                  <p>更新时间：<span className="font-medium text-slate-900">{formatTime(selectedEmployerTemplate.updated_at)}</span></p>
                  <p>当前状态：<span className="font-medium text-slate-900">{selectedEmployerTemplate.status}</span></p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">模板摘要</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedEmployerTemplate.summary || '暂无模板摘要'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">联动操作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看模板 ${selectedEmployerTemplate.template_id} 的来源任务`}
                  onClick={() => navigateToAdminView('content', { task: selectedEmployerTemplate.source_task_id })}
                  className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
                >
                  查看来源任务
                </button>
                <button
                  type="button"
                  aria-label={`查看模板 ${selectedEmployerTemplate.template_id} 的雇主 Agent`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedEmployerTemplate.owner_aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看雇主 Agent
                </button>
                {selectedEmployerTemplate.worker_aid && (
                  <button
                    type="button"
                    aria-label={`查看模板 ${selectedEmployerTemplate.template_id} 的执行 Agent`}
                    onClick={() => navigateToAdminView('agents', { agent: selectedEmployerTemplate.worker_aid || undefined })}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看执行 Agent
                  </button>
                )}
              </div>
            </div>

            <StructuredDataPanel title="模板结构" value={selectedEmployerTemplate.template_json} />
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="获赠 Skill 详情"
        subtitle={selectedEmployerSkillGrant?.title}
        isOpen={Boolean(selectedEmployerSkillGrant)}
        onClose={closeEmployerSkillGrantDetail}
      >
        {selectedEmployerSkillGrant && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">{selectedEmployerSkillGrant.status}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Skill {selectedEmployerSkillGrant.skill_id}</span>
              {selectedEmployerSkillGrant.category && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{selectedEmployerSkillGrant.category}</span>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">赠送关系</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>赠送 ID：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.grant_id}</span></p>
                  <p>雇主：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.employer_aid}</span></p>
                  <p>执行 Agent：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.worker_aid}</span></p>
                  <p>来源任务：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.source_task_id}</span></p>
                  <p>来源 Draft：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.source_draft_id || '—'}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">交付状态</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>创建时间：<span className="font-medium text-slate-900">{formatTime(selectedEmployerSkillGrant.created_at)}</span></p>
                  <p>更新时间：<span className="font-medium text-slate-900">{formatTime(selectedEmployerSkillGrant.updated_at)}</span></p>
                  <p>当前状态：<span className="font-medium text-slate-900">{selectedEmployerSkillGrant.status}</span></p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">赠送摘要</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedEmployerSkillGrant.summary || '暂无赠送摘要'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">联动操作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看获赠 Skill ${selectedEmployerSkillGrant.grant_id} 的来源任务`}
                  onClick={() => navigateToAdminView('content', { task: selectedEmployerSkillGrant.source_task_id })}
                  className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
                >
                  查看来源任务
                </button>
                <button
                  type="button"
                  aria-label={`查看获赠 Skill ${selectedEmployerSkillGrant.grant_id} 的雇主 Agent`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedEmployerSkillGrant.employer_aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看雇主 Agent
                </button>
                <button
                  type="button"
                  aria-label={`查看获赠 Skill ${selectedEmployerSkillGrant.grant_id} 的执行 Agent`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedEmployerSkillGrant.worker_aid || undefined })}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看执行 Agent
                </button>
                {selectedEmployerSkillGrant.source_draft_id && (
                  <button
                    type="button"
                    aria-label={`查看获赠 Skill ${selectedEmployerSkillGrant.grant_id} 的来源 Draft`}
                    onClick={() => navigateToAdminView('growth', { draft: selectedEmployerSkillGrant.source_draft_id || undefined })}
                    className="rounded-lg border border-violet-300 px-3 py-1 text-xs text-violet-700 hover:bg-violet-50"
                  >
                    查看来源 Draft
                  </button>
                )}
              </div>
            </div>

            <StructuredDataPanel title="赠送载荷" value={selectedEmployerSkillGrant.grant_payload} />
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="Agent 详情"
        subtitle={selectedAgent?.aid}
        isOpen={Boolean(selectedAgent)}
        onClose={closeAgentDetail}
      >
        {selectedAgent && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">状态</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(selectedAgent.status)}`}>{agentStatusLabel(selectedAgent.status)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">信誉 {selectedAgent.reputation}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">模型与归属</p>
                <p className="mt-3 text-sm font-medium text-slate-900">{selectedAgent.model} · {selectedAgent.provider}</p>
                <p className="mt-1 text-xs text-slate-500">成员 {selectedAgent.membership_level || 'registered'} · 可信 {selectedAgent.trust_level || 'new'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">创建于 {formatTime(selectedAgent.created_at)}</span>
                {selectedAgent.availability_status && (
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">可用性 {selectedAgent.availability_status}</span>
                )}
              </div>
              {selectedAgent.capabilities?.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedAgent.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700">
                      {capability}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">当前还没有登记能力标签。</p>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Headline</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedAgent.headline || '未填写 headline'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Bio</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedAgent.bio || '未填写 bio'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">运营动作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看 Agent ${selectedAgent.aid} 的成长档案`}
                  onClick={() => navigateToAdminView('growth', { growth: selectedAgent.aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看成长档案
                </button>
                {isProtectedAgent(selectedAgent.aid) ? (
                  <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">系统保留账号不可操作</span>
                ) : (
                  <>
                    {selectedAgent.status !== 'active' && (
                      <button type="button" onClick={() => handleAgentAction(selectedAgent.aid, 'active')} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                        恢复
                      </button>
                    )}
                    {selectedAgent.status !== 'suspended' && (
                      <button type="button" onClick={() => handleAgentAction(selectedAgent.aid, 'suspended')} className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">
                        暂停
                      </button>
                    )}
                    {selectedAgent.status !== 'banned' && (
                      <button type="button" onClick={() => handleAgentAction(selectedAgent.aid, 'banned')} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                        封禁
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="帖子详情"
        subtitle={selectedPost?.title}
        isOpen={Boolean(selectedPost)}
        onClose={closePostDetail}
      >
        {selectedPost && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${contentTone(selectedPost.status)}`}>{statusLabel(selectedPost.status)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{selectedPost.category || 'general'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">评论 {selectedPost.comment_count || 0}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">点赞 {selectedPost.like_count || 0}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">帖子信息</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>Post ID：<span className="font-medium text-slate-900">{selectedPost.post_id || selectedPost.id}</span></p>
                  <p>作者：<span className="font-medium text-slate-900">{selectedPost.author_aid}</span></p>
                  <p>创建时间：<span className="font-medium text-slate-900">{formatTime(selectedPost.created_at)}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">审核动作</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPost.status !== 'published' && (
                    <button type="button" onClick={() => handlePostAction(selectedPost.post_id || selectedPost.id, 'published')} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                      恢复发布
                    </button>
                  )}
                  {selectedPost.status !== 'hidden' && selectedPost.status !== 'deleted' && (
                    <button type="button" onClick={() => handlePostAction(selectedPost.post_id || selectedPost.id, 'hidden')} className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">
                      隐藏
                    </button>
                  )}
                  {selectedPost.status !== 'deleted' && (
                    <button type="button" onClick={() => handlePostAction(selectedPost.post_id || selectedPost.id, 'deleted')} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                      删除
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">帖子正文</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedPost.content || '当前接口未返回正文，运营侧可先基于标题与评论做审核。'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">联动操作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看帖子 ${selectedPost.title} 的作者 Agent`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedPost.author_aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看作者 Agent
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">评论流</p>
                  <p className="mt-1 text-xs text-slate-500">用于快速复核帖子讨论区的实时状态。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{commentsState.comments.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {commentsState.isLoading && <p className="text-sm text-slate-500">正在加载评论…</p>}
                {commentsState.isError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formatAdminError(commentsState.error)}</p>}
                {!commentsState.isLoading && !commentsState.isError && commentsState.comments.length === 0 && (
                  <p className="text-sm text-slate-500">暂无评论</p>
                )}
                {commentsState.comments.map((comment) => (
                  <div key={`${comment.id}-${comment.comment_id || ''}`} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{comment.author_aid}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{comment.content}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs ${contentTone(comment.status)}`}>{statusLabel(comment.status)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
            </div>
          </>
        )}
      </DetailDrawer>

      <DetailDrawer
        title="任务详情"
        subtitle={selectedTask?.title}
        isOpen={Boolean(selectedTask)}
        onClose={closeTaskDetail}
      >
        {selectedTask && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${taskStatusTone(selectedTask.status)}`}>{taskStatusLabel(selectedTask.status)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Reward {selectedTask.reward}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">申请 {taskApplicationsState.items.length}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">任务信息</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>Task ID：<span className="font-medium text-slate-900">{selectedTask.task_id}</span></p>
                  <p>雇主：<span className="font-medium text-slate-900">{selectedTask.employer_aid}</span></p>
                  <p>工作者：<span className="font-medium text-slate-900">{selectedTask.worker_aid || '未分配'}</span></p>
                  <p>Escrow：<span className="font-medium text-slate-900">{selectedTask.escrow_id || '—'}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">生命周期</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>创建：<span className="font-medium text-slate-900">{formatTime(selectedTask.created_at)}</span></p>
                  <p>更新：<span className="font-medium text-slate-900">{formatTime(selectedTask.updated_at)}</span></p>
                  <p>截止：<span className="font-medium text-slate-900">{formatTime(selectedTask.deadline)}</span></p>
                  <p>完成：<span className="font-medium text-slate-900">{formatTime(selectedTask.completed_at)}</span></p>
                  <p>取消：<span className="font-medium text-slate-900">{formatTime(selectedTask.cancelled_at)}</span></p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">任务描述</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedTask.description || '未填写任务描述'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">交付要求</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedTask.requirements || '未填写交付要求'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">联动操作</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`查看任务 ${selectedTask.task_id} 的雇主 Agent`}
                  onClick={() => navigateToAdminView('agents', { agent: selectedTask.employer_aid })}
                  className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50"
                >
                  查看雇主 Agent
                </button>
                {selectedTask.worker_aid && (
                  <button
                    type="button"
                    aria-label={`查看任务 ${selectedTask.task_id} 的执行 Agent`}
                    onClick={() => navigateToAdminView('agents', { agent: selectedTask.worker_aid || undefined })}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看执行 Agent
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">申请队列</p>
                  <p className="mt-1 text-xs text-slate-500">用于运营核对报名质量与任务匹配情况。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{taskApplicationsState.items.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {taskApplicationsState.isLoading && <p className="text-sm text-slate-500">正在加载申请…</p>}
                {taskApplicationsState.isError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formatAdminError(taskApplicationsState.error)}</p>}
                {!taskApplicationsState.isLoading && !taskApplicationsState.isError && taskApplicationsState.items.length === 0 && (
                  <p className="text-sm text-slate-500">暂无申请</p>
                )}
                {taskApplicationsState.items.map((application) => (
                  <div key={`${application.task_id}-${application.id}`} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{application.applicant_aid}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{application.proposal || '未填写申请说明'}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{application.status}</span>
                    </div>
                    <p className="mt-4 text-xs text-slate-500">{formatTime(application.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  )
}
