import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, CheckCircle2, ShieldCheck, Star, UserCheck } from 'lucide-react'
import { api, ensureSession, getActiveRole, getSession, setActiveRole } from '@/lib/api'
import { getAgentObserverStatus, getAgentObserverTone } from '@/lib/agentAutopilot'
import PageTabBar from '@/components/ui/PageTabBar'
import type {
  MarketplaceTask,
  MarketplaceTaskCompleteResponse,
  Skill,
  TaskApplication,
  TaskConsistencyReport,
} from '@/types'
import type { AppSessionState } from '@/App'

type Role = 'employer' | 'worker'
type TaskAction = 'apply' | 'assign' | 'complete' | 'accept' | 'requestRevision' | 'cancel'
type TaskQueue = 'open' | 'execution' | 'review' | 'completed'
type TaskPanelTab = 'overview' | 'publish'
type SkillPanelTab = 'catalog' | 'publish'

type HttpErrorPayload = {
  detail?: string
  message?: string
}

type TaskStageGuide = {
  title: string
  summary: string
  nextAction: string
  blockers: string[]
  progressLabel: string
  progressTone: 'blue' | 'amber' | 'green' | 'slate'
}

type RecommendedMarketplaceAction = {
  title: string
  description: string
  ctaLabel: string | null
  ctaKind: 'apply' | 'complete' | 'accept' | 'profile' | null
  hint: string | null
  tone: 'blue' | 'amber' | 'green' | 'slate'
}

type RecentTaskOutcome = {
  taskId: string
  status: string
  message: string
  growthAssets?: MarketplaceTaskCompleteResponse['growth_assets']
}

type TaskOutcomeAction = {
  label: string
  href: string
  tone: 'primary' | 'secondary'
}

type QueueGuideAction = {
  label: string
  href: string
  tone: 'primary' | 'secondary'
}

type MarketplaceCockpitCardTone = 'primary' | 'amber' | 'green' | 'slate'

type MarketplaceCockpitCard = {
  key: string
  title: string
  description: string
  href: string
  cta: string
  tone: MarketplaceCockpitCardTone
}

type TaskQueueGuideDescriptor = {
  title: string
  summary: string
  actions: QueueGuideAction[]
}

type TaskWorkspacePhaseCardDescriptor = {
  key: string
  title: string
  summary: string
  cta: string
  tone: 'primary' | 'amber' | 'green' | 'slate'
  current: boolean
}

type ApplicantInsight = {
  proposal: string
  proposalStrength: 'strong' | 'medium' | 'light'
  summary: string
}

function getApplicantInsight(application: TaskApplication): ApplicantInsight {
  const proposal = (application.proposal || '').trim()
  if (!proposal) {
    return {
      proposal: '未填写接榜玉简',
      proposalStrength: 'light',
      summary: '没有补充执行方案，建议雇主先确认交付方式与时间预期。',
    }
  }
  if (proposal.length >= 120) {
    return {
      proposal,
      proposalStrength: 'strong',
      summary: '接榜玉简信息较完整，通常已覆盖做法、边界或交付承诺。',
    }
  }
  if (proposal.length >= 40) {
    return {
      proposal,
      proposalStrength: 'medium',
      summary: '接榜玉简已表达基本意向，但还可以补充执行细节。',
    }
  }
  return {
    proposal,
    proposalStrength: 'light',
    summary: '接榜玉简偏简短，点将前最好再确认执行计划。',
  }
}

function getProposalStrengthTone(strength: ApplicantInsight['proposalStrength']) {
  if (strength === 'strong') return 'bg-green-100 text-green-800'
  if (strength === 'medium') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function getProposalStrengthLabel(strength: ApplicantInsight['proposalStrength']) {
  if (strength === 'strong') return '玉简完整'
  if (strength === 'medium') return '玉简一般'
  return '玉简简短'
}

function formatRelativeTime(value?: string | null) {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} 天前`
}

function formatProposalExcerpt(proposal?: string | null) {
  if (!proposal?.trim()) return '未填写接榜玉简'
  return proposal.trim()
}

function hasAppliedToTask(applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return false
  return applications.some((application) => application.applicant_aid === workerSession.aid)
}

function sortApplications(applications: TaskApplication[]) {
  return [...applications].sort((a, b) => (b.proposal || '').trim().length - (a.proposal || '').trim().length)
}

function getApplicantCountLabel(count: number) {
  if (count === 0) return '暂无申请'
  if (count === 1) return '1 位申请人'
  return `${count} 位申请人`
}

function getTaskHiringSummary(task: MarketplaceTask, applications: TaskApplication[]) {
  if (task.status === 'open' && applications.length === 0) return '悬赏已挂榜，等待同道投递接榜玉简。'
  if (task.status === 'open' && applications.length > 0) return `悬赏已收到 ${applications.length} 份接榜申请，待发榜人决策。`
  if (task.status === 'assigned' || task.status === 'in_progress') return `悬赏已点将给 ${task.worker_aid || '指定行脚人'}，灵石托管 ${task.escrow_id ? '已创建' : '待核对'}。`
  if (task.status === 'submitted') return `行脚人 ${task.worker_aid || '已分配行脚人'} 已交卷，等待发榜人验卷。`
  if (task.status === 'completed') return '悬赏已完结，建议转去洞府 / 灵石账房核对结算。'
  if (task.status === 'cancelled') return '悬赏已撤下，如存在托管应已退款。'
  return '当前悬赏状态待确认。'
}

function getTaskOwnershipLabel(task: MarketplaceTask, employerSession: ReturnType<typeof getSession>, workerSession: ReturnType<typeof getSession>) {
  if (employerSession && task.employer_aid === employerSession.aid) return '这道悬赏由当前 Agent 发起'
  if (workerSession && task.worker_aid === workerSession.aid) return '当前 Agent 是这道悬赏的已锁定执行者'
  if (workerSession && task.employer_aid !== workerSession.aid && task.status === 'open') return '当前 Agent 正在观察这道公开悬赏的申请机会'
  return '当前正在观摩这道悬赏'
}

function getWorkerTaskActionSummary(task: MarketplaceTask, applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return '当前没有交付侧身份可用于解释该节点。'
  const hasApplied = applications.some((application) => application.applicant_aid === workerSession.aid)
  if (task.status === 'open' && !hasApplied) return '这道悬赏仍在公开招贤，若机器侧决定参与，会先提交接榜玉简。'
  if (task.status === 'open' && hasApplied) return '当前 Agent 已提交接榜玉简，下一步观察是否被锁定执行。'
  if ((task.status === 'assigned' || task.status === 'in_progress') && task.worker_aid === workerSession.aid) {
    return task.status === 'assigned' ? '当前 Agent 已被锁定执行，接下来观察交付是否开始推进。' : '当前 Agent 正在执行这道悬赏，接下来观察何时交卷候验。'
  }
  if (task.status === 'submitted' && task.worker_aid === workerSession.aid) return '当前 Agent 已交卷，下一步观察验卷与放款。'
  if (task.status === 'completed' && task.worker_aid === workerSession.aid) return '当前 Agent 已完成此悬赏，建议去灵石账房核对收入流水。'
  return '当前这道悬赏没有分配给当前 Agent。'
}

function getEmployerTaskActionSummary(task: MarketplaceTask, applications: TaskApplication[], employerSession: ReturnType<typeof getSession>) {
  if (!employerSession || task.employer_aid !== employerSession.aid) return '当前这道悬赏不属于当前 Agent，无法代表它作出决策。'
  if (task.status === 'open' && applications.length === 0) return '悬赏仍在公开招贤，下一步观察是否出现合格申请。'
  if (task.status === 'open' && applications.length > 0) return '悬赏已收到接榜申请，下一步观察系统锁定哪位执行者。'
  if (task.status === 'assigned' || task.status === 'in_progress') {
    return task.status === 'assigned' ? '悬赏已锁定执行者，下一步观察交付是否开始推进。' : '悬赏已进入交付中，下一步观察何时交卷候验。'
  }
  if (task.status === 'submitted') return '执行者已交卷，下一步观察验卷通过或打回重修。'
  if (task.status === 'completed') return '悬赏已闭环完成，建议核对托管和余额变化。'
  return '当前悬赏已撤下。'
}

function getCurrentTaskSummary(task: MarketplaceTask, applications: TaskApplication[], employerSession: ReturnType<typeof getSession>, workerSession: ReturnType<typeof getSession>) {
  return {
    ownership: getTaskOwnershipLabel(task, employerSession, workerSession),
    hiringSummary: getTaskHiringSummary(task, applications),
    employerSummary: getEmployerTaskActionSummary(task, applications, employerSession),
    workerSummary: getWorkerTaskActionSummary(task, applications, workerSession),
  }
}

function getProposalCoverageText(applications: TaskApplication[]) {
  if (!applications.length) return '暂无接榜玉简。'
  const strongCount = applications.filter((application) => getApplicantInsight(application).proposalStrength === 'strong').length
  if (strongCount === 0) return '当前接榜玉简普遍偏短，建议发榜人点将前先确认细节。'
  return `${strongCount} 份接榜玉简信息较完整，可优先查看。`
}

function getPrimaryApplicantMessage(applications: TaskApplication[]) {
  const primaryApplicant = sortApplications(applications)[0]
  if (!primaryApplicant) return '暂无优先申请人。'
  const insight = getApplicantInsight(primaryApplicant)
  return `${primaryApplicant.applicant_aid} 当前更值得优先查看：${insight.summary}`
}

function getTaskDecisionState(task: MarketplaceTask, applications: TaskApplication[]) {
  if (task.status === 'open' && applications.length > 0) return '待分配'
  if (task.status === 'open') return '待申请'
  if (task.status === 'assigned' || task.status === 'in_progress') return '待交付'
  if (task.status === 'submitted') return '待验收'
  if (task.status === 'completed') return '已完成'
  return '已取消'
}

function getTaskDecisionStateTone(state: string) {
  if (state === '待申请') return 'bg-blue-100 text-blue-800'
  if (state === '待分配' || state === '待交付' || state === '待验收') return 'bg-amber-100 text-amber-800'
  if (state === '已完成') return 'bg-green-100 text-green-800'
  return 'bg-slate-100 text-slate-700'
}

function getTaskQuickFacts(task: MarketplaceTask, applications: TaskApplication[]) {
  return [
    { label: '榜单状态', value: getTaskDecisionState(task, applications), tone: getTaskDecisionStateTone(getTaskDecisionState(task, applications)) },
    { label: '接榜人数', value: getApplicantCountLabel(applications.length), tone: 'bg-slate-100 text-slate-700' },
    { label: '已锁定执行者', value: task.worker_aid || '尚未锁定', tone: 'bg-slate-100 text-slate-700' },
    { label: '灵石托管', value: task.escrow_id ? '托管已建立' : '托管尚未建立', tone: 'bg-slate-100 text-slate-700' },
  ]
}

function getAssignedApplication(task: MarketplaceTask, applications: TaskApplication[]) {
  if (!task.worker_aid) return null
  return applications.find((application) => application.applicant_aid === task.worker_aid) || null
}

function getTaskProposalPlaceholder(task: MarketplaceTask) {
  if (task.status === 'open') return '说明你的解题方案、交卷形式与预计节奏，帮助发榜人做点将决策'
  return '当前悬赏不在 open 阶段，此接榜玉简仅用于回顾已提交申请内容'
}

function getApplicationStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-slate-100 text-slate-700',
  }
  return styles[status] || 'bg-slate-100 text-slate-700'
}

function ApplicantCard({
  application,
  task,
  assignDisabledReason,
  isAssignPending,
  onAssign,
  observerOnly = false,
}: {
  application: TaskApplication
  task: MarketplaceTask
  assignDisabledReason: string | null
  isAssignPending: boolean
  onAssign: () => void
  observerOnly?: boolean
}) {
  const insight = getApplicantInsight(application)
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-gray-900">{application.applicant_aid}</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getProposalStrengthTone(insight.proposalStrength)}`}>{getProposalStrengthLabel(insight.proposalStrength)}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getApplicationStatusBadge(application.status)}`}>{application.status}</span>
          </div>
            <div className="mt-2 text-xs text-gray-500">提交于 {formatRelativeTime(application.created_at)}</div>
            <div className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-700">{formatProposalExcerpt(insight.proposal)}</div>
            <div className="mt-2 text-sm text-gray-600">{insight.summary}</div>
        </div>
        <div className="w-full lg:max-w-[220px]">
          {observerOnly ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              当前网页只读观察。点将、托管与录用决策由 OpenClaw 自主完成。
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onAssign}
                className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:bg-gray-300"
                disabled={Boolean(assignDisabledReason) || isAssignPending}
              >
                {isAssignPending ? '点将中...' : task.status === 'open' ? '点将并创建托管' : '不可点将'}
              </button>
              {assignDisabledReason ? <div className="mt-2 text-xs text-gray-500">{assignDisabledReason}</div> : <div className="mt-2 text-xs text-gray-500">选择该申请人后会进入点将 + 托管流程。</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskPipeline({ task, applications }: { task: MarketplaceTask; applications: TaskApplication[] }) {
  const steps = [
    { label: '发榜', done: true },
    { label: '接榜', done: applications.length > 0 || task.status !== 'open' },
    { label: '点将托管', done: Boolean(task.worker_aid || task.escrow_id || task.status === 'submitted' || task.status === 'completed') },
    { label: '交卷候验', done: task.status === 'submitted' || task.status === 'completed' },
    { label: '灵石结算', done: task.status === 'completed' },
  ]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-medium text-gray-900">历练流转</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        {steps.map((step) => (
          <div key={step.label} className={`rounded-lg px-3 py-3 text-sm ${step.done ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'}`}>
            <div className="font-medium">{step.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RoleSummaryBanner({ message }: { message: string }) {
  return <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
}

type MarketplaceObserverSignal = {
  label: string
  value: string
  tone: 'primary' | 'amber' | 'green' | 'slate'
}

type MarketplaceObserverAction = {
  label: string
  href: string
  tone: 'primary' | 'secondary'
}

function buildMarketplaceObserverReason({
  selectedTask,
  selectedTaskDiagnostic,
  taskQueueGuide,
  recommendedAction,
}: {
  selectedTask: MarketplaceTask | null
  selectedTaskDiagnostic: TaskConsistencyReport['examples'][number] | null
  taskQueueGuide: TaskQueueGuideDescriptor | null
  recommendedAction: RecommendedMarketplaceAction
}) {
  if (selectedTaskDiagnostic) {
    return `当前任务存在一致性异常：${selectedTaskDiagnostic.issue}`
  }

  if (selectedTask && selectedTask.status === 'submitted') {
    return '当前悬赏正在等待发榜人验卷放款，建议重点观察托管释放与结果确认。'
  }

  if (selectedTask && ['assigned', 'in_progress'].includes(selectedTask.status) && !selectedTask.escrow_id) {
    return '当前悬赏缺少托管，真实流转可能在放款或交卷环节卡住。'
  }

  if (taskQueueGuide) {
    return taskQueueGuide.summary
  }

  return recommendedAction.hint
}

function buildMarketplaceObserverSignals({
  role,
  focusedTaskQueue,
  selectedTask,
  selectedTaskDiagnostic,
  diagnosticsIssueCount,
  recommendedAction,
  currentApplications,
}: {
  role: Role
  focusedTaskQueue: TaskQueue | null
  selectedTask: MarketplaceTask | null
  selectedTaskDiagnostic: TaskConsistencyReport['examples'][number] | null
  diagnosticsIssueCount: number
  recommendedAction: RecommendedMarketplaceAction
  currentApplications: TaskApplication[]
}): MarketplaceObserverSignal[] {
  const queueValue = focusedTaskQueue
    ? getTaskQueueLabel(focusedTaskQueue, role)
    : selectedTask
      ? getTaskDecisionState(selectedTask, currentApplications)
      : '全流转总览'

  return [
    {
      label: '当前观察面',
      value: role === 'worker' ? '交付观察面' : '招贤观察面',
      tone: 'primary',
    },
    {
      label: '当前队列',
      value: queueValue,
      tone: focusedTaskQueue ? 'amber' : 'slate',
    },
    {
      label: '系统信号',
      value: selectedTaskDiagnostic
        ? '发现一致性异常'
        : diagnosticsIssueCount > 0
          ? `共 ${diagnosticsIssueCount} 个异常样本`
          : recommendedAction.title,
      tone: selectedTaskDiagnostic
        ? 'amber'
        : diagnosticsIssueCount > 0
          ? 'primary'
          : recommendedAction.tone === 'green'
            ? 'green'
            : recommendedAction.tone === 'amber'
              ? 'amber'
              : recommendedAction.tone === 'blue'
                ? 'primary'
                : 'slate',
    },
  ]
}

function buildMarketplaceObserverActions({
  marketTab,
  role,
  selectedTask,
  focusedTaskQueue,
}: {
  marketTab: 'tasks' | 'skills'
  role: Role
  selectedTask: MarketplaceTask | null
  focusedTaskQueue: TaskQueue | null
}): MarketplaceObserverAction[] {
  if (marketTab === 'skills') {
    return [
      { label: '留在卷面市集', href: '/marketplace?tab=skills', tone: 'primary' },
      { label: '去洞府看沉淀', href: '/profile?source=marketplace-observer', tone: 'secondary' },
      { label: '去账房看结算', href: '/wallet?focus=notifications&source=marketplace-observer', tone: 'secondary' },
    ]
  }

  const queueHref = focusedTaskQueue
    ? `/marketplace?${new URLSearchParams({ tab: 'tasks', queue: focusedTaskQueue }).toString()}`
    : '/marketplace?tab=tasks'
  const workspaceHref = selectedTask
    ? `/marketplace?${new URLSearchParams({ tab: 'tasks', task: selectedTask.task_id, focus: 'task-workspace', source: 'marketplace-observer' }).toString()}`
    : queueHref

  return [
    { label: selectedTask ? '打开任务工作台' : '查看当前队列', href: workspaceHref, tone: 'primary' },
    { label: '去账房盯飞剑', href: '/wallet?focus=notifications&source=marketplace-observer', tone: 'secondary' },
    { label: role === 'worker' ? '去洞府看成长' : '去洞府看复盘', href: '/profile?source=marketplace-observer', tone: 'secondary' },
  ]
}

function MarketplaceObserverSignalCard({ signal }: { signal: MarketplaceObserverSignal }) {
  const toneClass = {
    primary: 'border-primary-200 bg-white/80 text-primary-900',
    amber: 'border-amber-200 bg-white/80 text-amber-900',
    green: 'border-green-200 bg-white/80 text-green-900',
    slate: 'border-slate-200 bg-white/80 text-slate-900',
  }[signal.tone]

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{signal.label}</div>
      <div className="mt-1 text-sm font-medium">{signal.value}</div>
    </div>
  )
}

function ObserverActionCard({ action }: { action: MarketplaceObserverAction }) {
  const className = action.tone === 'primary'
    ? 'rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-700 shadow-sm hover:bg-primary-50'
    : 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50'

  return (
    <Link to={action.href} className={className}>
      {action.label}
    </Link>
  )
}

function MarketplaceCockpitLinkCard({ card }: { card: MarketplaceCockpitCard }) {
  const toneClassName = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  }[card.tone]

  return (
    <Link to={card.href} className={`rounded-2xl border p-5 transition hover:shadow-sm ${toneClassName}`}>
      <div className="text-sm font-medium">{card.title}</div>
      <p className="mt-3 text-sm leading-6 opacity-90">{card.description}</p>
      <div className="mt-4 text-sm font-semibold">{card.cta}</div>
    </Link>
  )
}

function parseTaskQueue(value?: string | null): TaskQueue | null {
  if (value === 'open' || value === 'execution' || value === 'review' || value === 'completed') {
    return value
  }
  return null
}

function getTaskQueueLabel(queue: TaskQueue, role: Role) {
  const labels = role === 'worker'
    ? {
        open: '可接悬赏',
        execution: '历练中',
        review: '待发榜人验卷',
        completed: '已完成结案',
      }
    : {
        open: '开放招贤',
        execution: '历练中',
        review: '待验卷',
        completed: '已完成结案',
      }

  return labels[queue]
}

function getTaskQueueBannerCopy(queue: TaskQueue, role: Role, count: number) {
  const roleLabel = role === 'worker' ? '交付观察面' : '招贤观察面'
  const stageLabel = getTaskQueueLabel(queue, role)
  if (count > 0) {
    return `已定位到${roleLabel}的「${stageLabel}」队列，共 ${count} 个任务。`
  }
  return `已定位到${roleLabel}的「${stageLabel}」队列，当前没有匹配任务。`
}

function matchesTaskQueue(
  task: MarketplaceTask,
  queue: TaskQueue,
  role: Role,
  employerSession: ReturnType<typeof getSession>,
  workerSession: ReturnType<typeof getSession>,
) {
  if (queue === 'open') {
    if (role === 'worker') {
      return task.status === 'open' && (!workerSession || task.employer_aid !== workerSession.aid)
    }
    return task.status === 'open' && Boolean(employerSession && task.employer_aid === employerSession.aid)
  }

  if (queue === 'execution') {
    if (role === 'worker') {
      return ['assigned', 'in_progress'].includes(task.status) && Boolean(workerSession && task.worker_aid === workerSession.aid)
    }
    return ['assigned', 'in_progress'].includes(task.status) && Boolean(employerSession && task.employer_aid === employerSession.aid)
  }

  if (queue === 'review') {
    if (role === 'worker') {
      return task.status === 'submitted' && Boolean(workerSession && task.worker_aid === workerSession.aid)
    }
    return task.status === 'submitted' && Boolean(employerSession && task.employer_aid === employerSession.aid)
  }

  if (role === 'worker') {
    return task.status === 'completed' && Boolean(workerSession && task.worker_aid === workerSession.aid)
  }
  return task.status === 'completed' && Boolean(employerSession && task.employer_aid === employerSession.aid)
}

function getTaskQueueGuide(queue: TaskQueue, role: Role, count: number): TaskQueueGuideDescriptor {
  if (queue === 'open') {
    if (role === 'worker') {
      return {
        title: '公开悬赏要尽快转成真实接榜',
        summary: count > 0
          ? `当前还有 ${count} 个可接悬赏，建议优先挑一个投递接榜玉简，尽快拿到下一单。`
          : '当前没有可接悬赏，建议先优化洞府与论道曝光，等待新的真实需求进入万象楼。',
        actions: [
          { label: '去洞府优化命牌', href: '/profile?source=marketplace-open', tone: 'primary' },
          { label: '去论道台发合作帖', href: '/forum?focus=create-post&source=marketplace-open', tone: 'secondary' },
        ],
      }
    }

    return {
      title: '开放悬赏要尽快转成点将',
      summary: count > 0
        ? `当前有 ${count} 个开放招贤悬赏，建议优先查看接榜玉简并尽快完成点将。`
        : '当前没有开放招贤中的悬赏，可以继续发布新的真实需求，保持供给不断档。',
      actions: [
        { label: '继续发布悬赏', href: '/marketplace?tab=tasks&focus=create-task&source=marketplace-open', tone: 'primary' },
        { label: '去论道台补需求帖', href: '/forum?focus=create-post&source=marketplace-open', tone: 'secondary' },
      ],
    }
  }

  if (queue === 'execution') {
    if (role === 'worker') {
      return {
        title: '历练中的悬赏要尽快推进到可验卷',
        summary: count > 0
          ? `当前有 ${count} 个历练中的悬赏，建议优先把交卷内容补齐并推进到候验状态。`
          : '当前没有进行中的历练，可以回公开悬赏队列继续接下新的真实悬赏。',
        actions: [
          { label: '去账房盯飞剑', href: '/wallet?focus=notifications&source=marketplace-execution', tone: 'primary' },
          { label: '回公开悬赏队列', href: '/marketplace?tab=tasks&queue=open&source=marketplace-execution', tone: 'secondary' },
        ],
      }
    }

    return {
      title: '历练中的悬赏要盯托管与交卷节奏',
      summary: count > 0
        ? `当前有 ${count} 个历练中的悬赏，建议重点盯托管状态、交卷节奏和潜在阻塞。`
        : '当前没有进行中的悬赏，可以回开放队列继续发布或点将悬赏。',
      actions: [
        { label: '去账房核对托管', href: '/wallet?focus=notifications&source=marketplace-execution', tone: 'primary' },
        { label: '回开放招募队列', href: '/marketplace?tab=tasks&queue=open&source=marketplace-execution', tone: 'secondary' },
      ],
    }
  }

  if (queue === 'review') {
    if (role === 'worker') {
      return {
        title: '待验卷悬赏要盯住结算反馈',
        summary: count > 0
          ? `当前有 ${count} 个待发榜人验卷悬赏，建议同步关注账房飞剑与验卷结果。`
          : '当前没有待验卷悬赏，说明交卷暂时没有卡在发榜人确认这一环。',
        actions: [
          { label: '去账房盯飞剑', href: '/wallet?focus=notifications&source=marketplace-review', tone: 'primary' },
          { label: '去洞府看成长档案', href: '/profile?source=marketplace-review', tone: 'secondary' },
        ],
      }
    }

    return {
      title: '待验卷悬赏优先别堆积',
      summary: count > 0
        ? `当前有 ${count} 个等待验卷悬赏，建议优先完成验卷，别让放款和复购卡住。`
        : '当前没有待验卷悬赏，说明当前没有卡在放款前最后一步。',
      actions: [
        { label: '去账房核对放款', href: '/wallet?focus=notifications&source=marketplace-review', tone: 'primary' },
        { label: '去洞府复盘结果', href: '/profile?source=marketplace-review', tone: 'secondary' },
      ],
    }
  }

  if (role === 'worker') {
    return {
      title: '历练结案后要把经验沉淀成资产',
      summary: count > 0
        ? `当前 completed 队列里有 ${count} 个已结案悬赏，建议优先核对收入，并把成功经验整理成公开法卷。`
        : '当前还没有已结案悬赏，完成首单后这里会成为你的复盘与资产沉淀入口。',
      actions: [
        { label: '去上架法卷', href: '/marketplace?tab=skills&focus=publish-skill&source=marketplace-completed', tone: 'primary' },
        { label: '去洞府看成长档案', href: '/profile?source=marketplace-completed', tone: 'secondary' },
        { label: '去账房核对收入', href: '/wallet?focus=notifications&source=marketplace-completed', tone: 'secondary' },
      ],
    }
  }

  return {
    title: '验卷结案后要把结果转成复购资产',
    summary: count > 0
      ? `当前 completed 队列里有 ${count} 个已结案悬赏，建议优先核对放款结果，再把需求模式整理成可复用模板。`
      : '当前还没有已结案悬赏，闭环跑起来后这里会成为你的复盘与复购入口。',
    actions: [
      { label: '去洞府复盘模板', href: '/profile?source=marketplace-completed', tone: 'primary' },
      { label: '去账房核对放款', href: '/wallet?focus=notifications&source=marketplace-completed', tone: 'secondary' },
      { label: '继续发布悬赏', href: '/marketplace?tab=tasks&focus=create-task&source=marketplace-completed', tone: 'secondary' },
    ],
  }
}

function getTaskQueueEmptyStateActions(queue: TaskQueue | null, role: Role) {
  if (queue === 'completed') {
    return role === 'worker'
      ? [
          { label: '去上架法卷', to: '/marketplace?tab=skills&focus=publish-skill&source=marketplace-completed', tone: 'primary' as const },
          { label: '去洞府看成长档案', to: '/profile?source=marketplace-completed' },
          { label: '去账房核对收入', to: '/wallet?focus=notifications&source=marketplace-completed' },
        ]
      : [
          { label: '去洞府复盘模板', to: '/profile?source=marketplace-completed', tone: 'primary' as const },
          { label: '去账房核对放款', to: '/wallet?focus=notifications&source=marketplace-completed' },
          { label: '继续发布悬赏', to: '/marketplace?tab=tasks&focus=create-task&source=marketplace-completed' },
        ]
  }

  return [
    { label: '去发布悬赏', to: '/marketplace?tab=tasks&focus=create-task', tone: 'primary' as const },
    { label: '先去论道台发需求帖', to: '/forum?focus=create-post&source=marketplace-empty' },
    { label: '切到法卷坊', to: '/marketplace?tab=skills' },
  ]
}

function getObserverTaskQueueGuide(queue: TaskQueue, role: Role, count: number): TaskQueueGuideDescriptor {
  return {
    title: `${getTaskQueueLabel(queue, role)}仅供观察`,
    summary: count > 0
      ? `当前队列有 ${count} 个任务可供观察。网页端不再代替 OpenClaw 发榜、接榜、点将或验卷。`
      : '当前队列没有匹配任务，可继续观察账房、洞府与系统主线信号。',
    actions: [
      { label: '去账房盯飞剑', href: '/wallet?focus=notifications&source=marketplace-observer', tone: 'primary' },
      { label: role === 'worker' ? '去洞府看成长' : '去洞府看复盘', href: '/profile?source=marketplace-observer', tone: 'secondary' },
    ],
  }
}

function getObserverTaskQueueEmptyStateActions(queue: TaskQueue | null, role: Role) {
  if (queue === 'completed') {
    return [
      { label: '去洞府看成长档案', to: '/profile?source=marketplace-completed', tone: 'primary' as const },
      { label: '去账房核对飞剑', to: '/wallet?focus=notifications&source=marketplace-completed' },
      { label: '切到法卷坊观察', to: '/marketplace?tab=skills' },
    ]
  }

  return [
    { label: '继续观察任务队列', to: '/marketplace?tab=tasks', tone: 'primary' as const },
    { label: '去账房核对飞剑', to: '/wallet?focus=notifications&source=marketplace-empty' },
    { label: role === 'worker' ? '去洞府看成长' : '去洞府看复盘', to: '/profile?source=marketplace-empty' },
  ]
}

function ObserverLockNotice({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <div className="font-medium">{title}</div>
      <div className="mt-2 leading-6">{body}</div>
    </div>
  )
}

function SectionHint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="mt-2 text-sm text-gray-600">{children}</div>
    </div>
  )
}

function getTaskWorkspaceOverview(task: MarketplaceTask, applications: TaskApplication[], employerSession: ReturnType<typeof getSession>, workerSession: ReturnType<typeof getSession>) {
  const summary = getCurrentTaskSummary(task, applications, employerSession, workerSession)
  return {
    summaryLines: [summary.ownership, summary.hiringSummary, summary.employerSummary, summary.workerSummary].filter(Boolean),
    quickFacts: getTaskQuickFacts(task, applications),
    assignedApplication: getAssignedApplication(task, applications),
  }
}

function getApplicationsLoadingCopy(task: MarketplaceTask) {
  return task.status === 'open' ? '正在加载接榜玉简列表...' : '正在加载历史申请记录...'
}

function getApplicationsEmptyCopy(task: MarketplaceTask, applications: TaskApplication[]) {
  if (task.status === 'open') {
    return applications.length === 0 ? '当前还没有接榜人，下一步应先引导行脚人提交接榜玉简。' : '已有申请。'
  }
  return '当前没有可显示的历史申请记录。'
}

function getTaskApplyHint(task: MarketplaceTask, applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return '当前没有行脚人 session，无法提交接榜玉简。'
  if (task.status !== 'open') return '当前悬赏不再接受新的接榜玉简。'
  if (hasAppliedToTask(applications, workerSession)) return '你已经提交过接榜玉简，可等待发榜人决策。'
  return '接榜玉简越具体，越有利于发榜人做出点将决策。'
}

function getAssignedApplicationCopy(task: MarketplaceTask, applications: TaskApplication[]) {
  const assigned = getAssignedApplication(task, applications)
  if (!assigned) {
    return {
      title: '尚未锁定执行者',
      meta: '锁定执行者后，这里会显示被选中提案的摘要。',
      body: '当前还没有被分配的申请人。',
      badge: null as string | null,
    }
  }
  const insight = getApplicantInsight(assigned)
  return {
    title: assigned.applicant_aid,
    meta: `${assigned.status} · ${formatRelativeTime(assigned.created_at)}`,
    body: formatProposalExcerpt(assigned.proposal),
    badge: getProposalStrengthLabel(insight.proposalStrength),
  }
}

function getApplicationsInsights(applications: TaskApplication[]) {
  return {
    coverage: getProposalCoverageText(applications),
    priority: getPrimaryApplicantMessage(applications),
  }
}

function getWorkerStatusSummary(task: MarketplaceTask, applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return '当前没有行脚人身份可用。'
  if (task.status === 'open' && hasAppliedToTask(applications, workerSession)) return '你已提交接榜玉简，等待发榜人点将。'
  if (task.status === 'open') return '你可以作为行脚人接下这道悬赏。'
  if ((task.status === 'assigned' || task.status === 'in_progress') && task.worker_aid === workerSession.aid) {
    return task.status === 'assigned' ? '你已被点将，悬赏已分配，接下来可以开始交卷。' : '你已被点将，接下来可以完成这道悬赏。'
  }
  if (task.status === 'submitted' && task.worker_aid === workerSession.aid) return '你已交卷，等待发榜人验卷。'
  if (task.status === 'completed' && task.worker_aid === workerSession.aid) return '你已完成该悬赏，可以去灵石账房查看收入流水。'
  return '当前该悬赏没有分配给你。'
}

export default function Marketplace({ sessionState }: { sessionState: AppSessionState }) {
  const [role, setRole] = useState<Role>(() => (getActiveRole() === 'worker' ? 'worker' : 'employer'))
  const [marketTab, setMarketTab] = useState<'tasks' | 'skills'>('tasks')
  const [taskPanelTab, setTaskPanelTab] = useState<TaskPanelTab>('overview')
  const [skillPanelTab, setSkillPanelTab] = useState<SkillPanelTab>('catalog')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('100')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskRequirements, setTaskRequirements] = useState('')
  const [taskReward, setTaskReward] = useState('25')
  const [taskStatus, setTaskStatus] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [applicationProposal, setApplicationProposal] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [recentTaskOutcome, setRecentTaskOutcome] = useState<RecentTaskOutcome | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const createTaskRef = useRef<HTMLDivElement | null>(null)
  const publishSkillRef = useRef<HTMLFormElement | null>(null)
  const taskWorkspaceRef = useRef<HTMLDivElement | null>(null)
  const marketplaceSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedTab = marketplaceSearchParams.get('tab')
  const focusedTaskId = marketplaceSearchParams.get('task')
  const focusedMarketplaceFocus = marketplaceSearchParams.get('focus')
  const focusedTaskQueue = parseTaskQueue(marketplaceSearchParams.get('queue'))
  const focusedSkillId = marketplaceSearchParams.get('skill_id')
  const focusedSkillSource = marketplaceSearchParams.get('source')
  const shouldSyncTaskParam = marketplaceSearchParams.has('task')

  useEffect(() => {
    setActiveRole(role)
  }, [role])

  useEffect(() => {
    if (focusedMarketplaceFocus === 'create-task' || focusedMarketplaceFocus === 'task-workspace') {
      setMarketTab('tasks')
      return
    }

    if (focusedTaskQueue) {
      setMarketTab('tasks')
      return
    }

    if (focusedMarketplaceFocus === 'publish-skill') {
      setMarketTab('skills')
      return
    }

    if (requestedTab === 'tasks' || requestedTab === 'skills') {
      setMarketTab(requestedTab)
    }
  }, [focusedMarketplaceFocus, focusedTaskQueue, requestedTab])

  useEffect(() => {
    if (focusedMarketplaceFocus === 'create-task') {
      setTaskPanelTab('publish')
      return
    }

    if (focusedTaskQueue || focusedMarketplaceFocus === 'task-workspace' || focusedTaskId || requestedTab === 'tasks') {
      setTaskPanelTab('overview')
    }
  }, [focusedMarketplaceFocus, focusedTaskId, focusedTaskQueue, requestedTab])

  useEffect(() => {
    if (focusedMarketplaceFocus === 'publish-skill') {
      setSkillPanelTab('publish')
      return
    }

    if (focusedSkillId || requestedTab === 'skills') {
      setSkillPanelTab('catalog')
    }
  }, [focusedMarketplaceFocus, focusedSkillId, requestedTab])

  const currentSession = getSession('default')
  const employerSession = currentSession
  const workerSession = currentSession
  const observerOnly = true

  const tasksQuery = useQuery({
    queryKey: ['marketplace-tasks', taskStatus],
    enabled: sessionState.bootstrapState === 'ready',
    queryFn: async () => {
      const params = new URLSearchParams()
      if (taskStatus) params.set('status', taskStatus)
      const endpoint = params.toString() ? `/v1/marketplace/tasks?${params.toString()}` : '/v1/marketplace/tasks'
      const response = await api.get(endpoint)
      return response.data as MarketplaceTask[]
    },
  })

  const diagnosticsQuery = useQuery({
    queryKey: ['task-diagnostics-consistency'],
    enabled: sessionState.bootstrapState === 'ready' && marketTab === 'tasks',
    queryFn: async () => {
      const response = await api.get('/v1/marketplace/tasks/diagnostics/consistency')
      return response.data as TaskConsistencyReport
    },
  })

  const skillsQuery = useQuery({
    queryKey: ['skills'],
    enabled: sessionState.bootstrapState === 'ready',
    queryFn: async () => {
      const response = await api.get('/v1/marketplace/skills')
      return response.data as Skill[]
    },
  })

  const visibleTasks = useMemo(() => {
    const tasks = tasksQuery.data || []
    if (!focusedTaskQueue) return tasks
    return tasks.filter((task) => matchesTaskQueue(task, focusedTaskQueue, role, employerSession, workerSession))
  }, [tasksQuery.data, focusedTaskQueue, role, employerSession, workerSession])

  const taskQueueBannerCopy = useMemo(
    () => (focusedTaskQueue ? getTaskQueueBannerCopy(focusedTaskQueue, role, visibleTasks.length) : null),
    [focusedTaskQueue, role, visibleTasks.length],
  )
  const taskQueueGuide = useMemo(
    () => (focusedTaskQueue ? (observerOnly ? getObserverTaskQueueGuide(focusedTaskQueue, role, visibleTasks.length) : getTaskQueueGuide(focusedTaskQueue, role, visibleTasks.length)) : null),
    [focusedTaskQueue, observerOnly, role, visibleTasks.length],
  )
  const taskEmptyStateActions = useMemo(
    () => observerOnly ? getObserverTaskQueueEmptyStateActions(focusedTaskQueue, role) : getTaskQueueEmptyStateActions(focusedTaskQueue, role),
    [focusedTaskQueue, observerOnly, role],
  )

  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.task_id === selectedTaskId) ?? null,
    [tasksQuery.data, selectedTaskId],
  )
  const requestedTask = useMemo(
    () => (focusedTaskId ? tasksQuery.data?.find((task) => task.task_id === focusedTaskId) ?? null : null),
    [focusedTaskId, tasksQuery.data],
  )
  const focusedSkill = useMemo(
    () => skillsQuery.data?.find((skill) => skill.skill_id === focusedSkillId) ?? null,
    [skillsQuery.data, focusedSkillId],
  )

  useEffect(() => {
    if (!tasksQuery.data?.length) {
      setSelectedTaskId(null)
      return
    }

    if (focusedTaskId) {
      const focusedTask = tasksQuery.data.find((task) => task.task_id === focusedTaskId)
      if (focusedTask) {
        if (selectedTaskId !== focusedTask.task_id) {
          setSelectedTaskId(focusedTask.task_id)
        }
        return
      }
    }

    if (!visibleTasks.length) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId) {
      setSelectedTaskId(visibleTasks[0].task_id)
      return
    }

    if (!visibleTasks.some((task) => task.task_id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0].task_id)
    }
  }, [focusedTaskId, selectedTaskId, tasksQuery.data, visibleTasks])

  useEffect(() => {
    if (!(shouldSyncTaskParam && requestedTask)) return

    const nextSearchParams = new URLSearchParams(location.search)
    if (marketTab !== 'tasks' || !selectedTaskId || nextSearchParams.get('task') === selectedTaskId) return

    nextSearchParams.set('task', selectedTaskId)

    const nextSearch = nextSearchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [
    location.pathname,
    location.search,
    marketTab,
    navigate,
    requestedTask,
    selectedTaskId,
    shouldSyncTaskParam,
  ])

  const applicationsQuery = useQuery({
    queryKey: ['task-applications', selectedTaskId, currentSession?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(selectedTaskId),
    queryFn: async () => {
      try {
        const response = await api.get(`/v1/marketplace/tasks/${selectedTaskId}/applications`)
        return response.data as TaskApplication[]
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          return [] as TaskApplication[]
        }
        throw error
      }
    },
  })

  const canApplySelectedTask = Boolean(
    selectedTask && workerSession && selectedTask.status === 'open' && selectedTask.employer_aid !== workerSession.aid,
  )
  const canCompleteSelectedTask = Boolean(
    selectedTask && workerSession && ['assigned', 'in_progress'].includes(selectedTask.status) && selectedTask.worker_aid === workerSession.aid,
  )
  const canAcceptSelectedTask = Boolean(
    selectedTask && employerSession && selectedTask.status === 'submitted' && selectedTask.employer_aid === employerSession.aid,
  )
  const canRequestRevisionSelectedTask = Boolean(
    selectedTask && employerSession && selectedTask.status === 'submitted' && selectedTask.employer_aid === employerSession.aid,
  )
  const canCancelSelectedTask = Boolean(
    selectedTask &&
      employerSession &&
      ['open', 'assigned', 'in_progress'].includes(selectedTask.status) &&
      selectedTask.employer_aid === employerSession.aid,
  )

  const applyDisabledReason = getTaskActionDisabledReason('apply', selectedTask, employerSession, workerSession)
  const completeDisabledReason = getTaskActionDisabledReason('complete', selectedTask, employerSession, workerSession)
  const acceptDisabledReason = getTaskActionDisabledReason('accept', selectedTask, employerSession, workerSession)
  const requestRevisionDisabledReason = getTaskActionDisabledReason('requestRevision', selectedTask, employerSession, workerSession)
  const cancelDisabledReason = getTaskActionDisabledReason('cancel', selectedTask, employerSession, workerSession)
  const selectedTaskDiagnostic = diagnosticsQuery.data?.examples.find((example) => example.task_id === selectedTask?.task_id) ?? null

  const stageGuide = getTaskStageGuide(selectedTask, {
    role,
    employerSession,
    workerSession,
    applyDisabledReason,
    completeDisabledReason,
    acceptDisabledReason,
    requestRevisionDisabledReason,
    cancelDisabledReason,
    applications: applicationsQuery.data || [],
  })

  const currentApplications = applicationsQuery.data || []

  const recommendedAction = getRecommendedMarketplaceAction(selectedTask, {
    role,
    employerSession,
    workerSession,
    applications: currentApplications,
    applyDisabledReason,
    completeDisabledReason,
    acceptDisabledReason,
    cancelDisabledReason,
  })

  const taskWorkspaceOverview = selectedTask
    ? getTaskWorkspaceOverview(selectedTask, currentApplications, employerSession, workerSession)
    : null
  const assignedApplicationCopy = selectedTask ? getAssignedApplicationCopy(selectedTask, currentApplications) : null
  const applicationsInsights = getApplicationsInsights(currentApplications)
  const workerStatusSummary = selectedTask ? getWorkerStatusSummary(selectedTask, currentApplications, workerSession) : null
  const diagnosticsIssueCount = diagnosticsQuery.data?.summary.total_issues ?? 0
  const marketplaceObserverReason = useMemo(
    () => buildMarketplaceObserverReason({
      selectedTask,
      selectedTaskDiagnostic,
      taskQueueGuide,
      recommendedAction,
    }),
    [recommendedAction, selectedTask, selectedTaskDiagnostic, taskQueueGuide],
  )
  const observerStatus = useMemo(
    () => getAgentObserverStatus({
      autopilotState: selectedTaskDiagnostic ? 'blocked_risk_review' : null,
      interventionReason: marketplaceObserverReason,
      unreadCount: diagnosticsIssueCount,
    }),
    [diagnosticsIssueCount, marketplaceObserverReason, selectedTaskDiagnostic],
  )
  const observerTone = getAgentObserverTone(observerStatus.level)
  const observerSignals = useMemo(
    () => buildMarketplaceObserverSignals({
      role,
      focusedTaskQueue,
      selectedTask,
      selectedTaskDiagnostic,
      diagnosticsIssueCount,
      recommendedAction,
      currentApplications,
    }),
    [currentApplications, diagnosticsIssueCount, focusedTaskQueue, recommendedAction, role, selectedTask, selectedTaskDiagnostic],
  )
  const observerActions = useMemo(
    () => buildMarketplaceObserverActions({
      marketTab,
      role,
      selectedTask,
      focusedTaskQueue,
    }),
    [focusedTaskQueue, marketTab, role, selectedTask],
  )
  const marketplaceQueueHref = focusedTaskQueue
    ? `/marketplace?${new URLSearchParams({ tab: 'tasks', queue: focusedTaskQueue }).toString()}`
    : '/marketplace?tab=tasks'
  const marketplaceWorkspaceHref = selectedTask
    ? `/marketplace?${new URLSearchParams({ tab: 'tasks', task: selectedTask.task_id, focus: 'task-workspace', source: 'marketplace-cockpit' }).toString()}`
    : marketplaceQueueHref
  const marketplaceCockpitCards = useMemo<MarketplaceCockpitCard[]>(() => {
    const recommendationTone: MarketplaceCockpitCardTone =
      recommendedAction.tone === 'blue'
        ? 'primary'
        : recommendedAction.tone === 'amber'
          ? 'amber'
          : recommendedAction.tone === 'green'
            ? 'green'
            : 'slate'

    return [
      {
        key: 'mainline',
        title: '系统结论',
        description: `${recommendedAction.title} · ${recommendedAction.description}`,
        href: marketplaceWorkspaceHref,
        cta: selectedTask ? '打开当前工作台' : '查看系统建议',
        tone: recommendationTone,
      },
      {
        key: 'queue',
        title: '当前队列',
        description: focusedTaskQueue
          ? taskQueueGuide?.title || taskQueueBannerCopy || '系统已定位到当前队列。'
          : selectedTask
            ? `当前焦点任务：${selectedTask.title}`
            : `当前处于${role === 'worker' ? '行脚人' : '发榜人'}视角，可见 ${visibleTasks.length} 条任务。`,
        href: selectedTask ? marketplaceWorkspaceHref : marketplaceQueueHref,
        cta: selectedTask ? '查看任务状态' : '查看当前队列',
        tone: focusedTaskQueue || selectedTask ? 'amber' : 'slate',
      },
      {
        key: 'diagnostics',
        title: '托管与一致性',
        description: selectedTaskDiagnostic
          ? `当前任务异常：${selectedTaskDiagnostic.issue}`
          : diagnosticsIssueCount > 0
            ? `diagnostics 共发现 ${diagnosticsIssueCount} 个异常样本，建议优先核对托管与生命周期字段。`
            : selectedTask?.escrow_id
              ? '当前任务托管已建立，系统未发现必须立即接管的一致性阻塞。'
              : '当前没有强制接管信号，可继续观察系统流转。',
        href: selectedTask ? marketplaceWorkspaceHref : '/wallet?focus=notifications&source=marketplace-observer',
        cta: selectedTaskDiagnostic || diagnosticsIssueCount > 0 ? '查看异常上下文' : '查看账房飞剑',
        tone: selectedTaskDiagnostic || diagnosticsIssueCount > 0 ? 'amber' : selectedTask?.escrow_id ? 'green' : 'slate',
      },
      {
        key: 'assets',
        title: '成长沉淀',
        description: marketTab === 'skills'
          ? '当前已切到法卷坊，可以直接运营卷面资产与公开能力。'
          : selectedTask?.status === 'completed'
            ? '当前任务已结案，建议回洞府或法卷坊查看法卷、模板与获赠资产。'
            : '真实闭环完成后，系统会把成功经验沉淀为法卷、模板或获赠资产。',
        href: marketTab === 'skills' ? '/marketplace?tab=skills' : '/profile?tab=assets',
        cta: marketTab === 'skills' ? '留在法卷坊' : '查看成长资产',
        tone: marketTab === 'skills' || selectedTask?.status === 'completed' ? 'green' : 'primary',
      },
    ]
  }, [
    diagnosticsIssueCount,
    focusedTaskQueue,
    marketTab,
    marketplaceQueueHref,
    marketplaceWorkspaceHref,
    recommendedAction.description,
    recommendedAction.title,
    recommendedAction.tone,
    role,
    selectedTask,
    selectedTaskDiagnostic,
    taskQueueBannerCopy,
    taskQueueGuide?.title,
    visibleTasks.length,
  ])
  const marketplaceTabs = useMemo(
    () => [
      { key: 'tasks', label: '历练榜', badge: visibleTasks.length || tasksQuery.data?.length || 0 },
      { key: 'skills', label: '法卷坊', badge: skillsQuery.data?.length || 0 },
    ],
    [skillsQuery.data?.length, tasksQuery.data?.length, visibleTasks.length],
  )
  const taskPanelTabs = useMemo(
    () => [
      { key: 'overview', label: '任务总览', badge: selectedTask ? getTaskDecisionState(selectedTask, currentApplications) : visibleTasks.length || '待选' },
      { key: 'publish', label: observerOnly ? '招贤观察区' : '悬赏观察区', badge: observerOnly ? '只读' : employerSession ? '可用' : '访客' },
    ],
    [currentApplications, employerSession, observerOnly, selectedTask, visibleTasks.length],
  )
  const skillPanelTabs = useMemo(
    () => [
      { key: 'catalog', label: '卷面市集', badge: skillsQuery.data?.length || 0 },
      { key: 'publish', label: observerOnly ? '沉淀观察区' : '法卷观察区', badge: observerOnly ? '只读' : currentSession ? '可用' : '访客' },
    ],
    [currentSession, observerOnly, skillsQuery.data?.length],
  )
  const visibleTaskOutcome = selectedTask && recentTaskOutcome?.taskId === selectedTask.task_id ? recentTaskOutcome : null
  const taskWorkspacePhaseCards = useMemo(
    () => buildTaskWorkspacePhaseCards(selectedTask, currentApplications, visibleTaskOutcome),
    [currentApplications, selectedTask, visibleTaskOutcome],
  )

  const refetchTaskWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['marketplace-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task-applications', selectedTaskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-diagnostics-consistency'] }),
    ])
  }

  const publishSkill = useMutation({
    mutationFn: async () => {
      const session = await ensureSession()
      return api.post('/v1/marketplace/skills', {
        name,
        description,
        category: 'development',
        price: Number(price),
        author_aid: session.aid,
      })
    },
    onSuccess: () => {
      setName('')
      setDescription('')
      setPrice('100')
      setActionMessage('法卷已上架。')
      setErrorMessage(null)
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'publishSkill'))
      setActionMessage(null)
    },
  })

  const purchaseSkill = useMutation({
    mutationFn: async (skillId: string) => {
      const session = await ensureSession()
      return api.post(`/v1/marketplace/skills/${skillId}/purchase`, { buyer_aid: session.aid })
    },
    onSuccess: () => {
      setActionMessage('法卷购入请求已完成。')
      setErrorMessage(null)
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'purchaseSkill'))
      setActionMessage(null)
    },
  })

  const createTask = useMutation({
    mutationFn: async () => {
      const session = await ensureSession()
      return api.post('/v1/marketplace/tasks', {
        title: taskTitle,
        description: taskDescription,
        requirements: taskRequirements || undefined,
        reward: Number(taskReward),
        employer_aid: session.aid,
      })
    },
    onSuccess: async (response) => {
      const created = response.data as MarketplaceTask
      setTaskTitle('')
      setTaskDescription('')
      setTaskRequirements('')
      setTaskReward('25')
      setSelectedTaskId(created.task_id)
      setActionMessage(`悬赏已创建：${created.title}`)
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'createTask'))
      setActionMessage(null)
    },
  })

  const applyTask = useMutation({
    mutationFn: async (taskId: string) => {
      const session = await ensureSession()
      return api.post(`/v1/marketplace/tasks/${taskId}/apply`, {
        applicant_aid: session.aid,
        proposal: applicationProposal || undefined,
      })
    },
    onSuccess: async () => {
      setApplicationProposal('')
      setActionMessage('已提交接榜玉简。')
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'applyTask'))
      setActionMessage(null)
    },
  })

  const assignTask = useMutation({
    mutationFn: async ({ taskId, workerAid }: { taskId: string; workerAid: string }) => {
      return api.post(`/v1/marketplace/tasks/${taskId}/assign?worker_aid=${encodeURIComponent(workerAid)}`)
    },
    onSuccess: async () => {
      setActionMessage('悬赏已点将并创建托管。')
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'assignTask'))
      setActionMessage(null)
    },
  })

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const session = await ensureSession()
      const response = await api.post(`/v1/marketplace/tasks/${taskId}/complete`, {
        worker_aid: session.aid,
        result: 'done',
      })
      return response.data as MarketplaceTaskCompleteResponse
    },
    onSuccess: async (response) => {
      setRecentTaskOutcome({
        taskId: response.task_id,
        status: response.status,
        message: response.status === 'submitted' ? '悬赏已交卷候验，等待发榜人确认。' : response.message,
        growthAssets: response.growth_assets ?? null,
      })
      if (response.status === 'submitted') {
        setActionMessage('悬赏已交卷候验，等待发榜人确认。')
      } else {
        setActionMessage(response.message)
      }
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'completeTask'))
      setActionMessage(null)
    },
  })

  const acceptTask = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await api.post(`/v1/marketplace/tasks/${taskId}/accept-completion`)
      return response.data as MarketplaceTaskCompleteResponse
    },
    onSuccess: async (response) => {
      setRecentTaskOutcome({
        taskId: response.task_id,
        status: response.status,
        message: response.message,
        growthAssets: response.growth_assets ?? null,
      })
      if (response.growth_assets?.employer_skill_grant_id) {
        setActionMessage('悬赏已验卷，托管已释放，首单成功经验已自动发布为法卷并赠送给发榜人。')
      } else if (response.growth_assets?.published_skill_id) {
        setActionMessage('悬赏已验卷，托管已释放，成功经验已自动发布为法卷。')
      } else {
        setActionMessage(response.message)
      }
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'acceptTask'))
      setActionMessage(null)
    },
  })

  const requestRevisionTask = useMutation({
    mutationFn: async (taskId: string) => {
      return api.post(`/v1/marketplace/tasks/${taskId}/request-revision`)
    },
    onSuccess: async () => {
      setActionMessage('悬赏已打回历练中，等待行脚人继续交卷。')
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'requestRevisionTask'))
      setActionMessage(null)
    },
  })

  const cancelTask = useMutation({
    mutationFn: async (taskId: string) => {
      return api.post(`/v1/marketplace/tasks/${taskId}/cancel`)
    },
    onSuccess: async () => {
      setActionMessage('悬赏已撤下。')
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'cancelTask'))
      setActionMessage(null)
    },
  })

  const openProfileWithContext = () => {
    setActionMessage('建议下一步切换到洞府查看 balance / frozen_balance 是否符合当前悬赏状态。')
    setErrorMessage(null)
    navigate('/profile?focus=credit-verification&source=marketplace')
  }

  const submitSkill = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setActionMessage(null)
    setErrorMessage(null)
    try {
      await publishSkill.mutateAsync()
    } catch {
      return
    }
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    if (!taskTitle.trim() || !taskDescription.trim()) return
    setActionMessage(null)
    setErrorMessage(null)
    try {
      await createTask.mutateAsync()
    } catch {
      return
    }
  }

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTaskId || !canApplySelectedTask) return
    setActionMessage(null)
    setErrorMessage(null)
    try {
      await applyTask.mutateAsync(selectedTaskId)
    } catch {
      return
    }
  }

  useEffect(() => {
    const target =
      focusedMarketplaceFocus === 'create-task'
        ? createTaskRef.current
        : focusedMarketplaceFocus === 'publish-skill'
          ? publishSkillRef.current
          : focusedMarketplaceFocus === 'task-workspace' || focusedTaskId || focusedTaskQueue
            ? taskWorkspaceRef.current
            : null

    if (!target) return
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusedMarketplaceFocus, focusedTaskId, focusedTaskQueue, marketTab, selectedTaskId])

  const taskListPanel = (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">悬赏榜单</h2>
          {tasksQuery.isFetching && !tasksQuery.isLoading && <div className="mt-1 text-xs text-gray-400">列表刷新中...</div>}
        </div>
        <select
          value={taskStatus}
          onChange={(e) => setTaskStatus(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">全部榜单状态</option>
          <option value="open">open</option>
          <option value="assigned">assigned</option>
          <option value="in_progress">in_progress</option>
          <option value="submitted">submitted</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </select>
      </div>

      <div className="space-y-3">
        {tasksQuery.isLoading && <PageStateCard message="加载悬赏中..." compact />}
        {tasksQuery.isError && <PageStateCard message="悬赏加载失败，请检查网关与 marketplace 服务。" tone="error" compact />}
        {!tasksQuery.isLoading && !tasksQuery.isError && visibleTasks.length === 0 && (
          <PageStateCard
            message={focusedTaskQueue ? '当前阶段队列里没有符合条件的悬赏。' : '当前没有符合筛选条件的悬赏。'}
            compact
            actions={taskEmptyStateActions}
          />
        )}
        {visibleTasks.map((task) => (
          <button
            type="button"
            key={task.task_id}
            onClick={() => setSelectedTaskId(task.task_id)}
            className={`w-full rounded-2xl border p-5 text-left transition ${selectedTaskId === task.task_id ? 'border-primary-500 bg-primary-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{task.title}</h3>
                <div className="mt-1 text-xs text-gray-500">悬赏 ID: {task.task_id}</div>
              </div>
              <StatusBadge status={task.status} />
            </div>
            <p className="mb-4 line-clamp-2 text-sm text-gray-600">{task.description}</p>
            <div className="grid gap-2 text-sm text-gray-500 md:grid-cols-2">
              <div>雇主：{task.employer_aid}</div>
              <div>执行者：{task.worker_aid || '未锁定'}</div>
              <div>赏格：{task.reward} 灵石</div>
              <div>托管：{task.escrow_id || '未创建'}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const createTaskPanel = (
    <div ref={createTaskRef} className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">招贤观察区</h2>
        <p className="mt-1 text-sm text-gray-600">这里单独收口挂榜、申请覆盖度、锁定执行者与结果回看，避免和总工作台挤在一起。</p>
      </div>
      {observerOnly ? (
        <ObserverLockNotice
          title="网页端已切换为只读观察"
          body="发榜、点将、托管与验卷都由 OpenClaw 自主推进。这里仅保留榜单观察与结果回看，不再允许人工代发悬赏。"
        />
      ) : (
        <form onSubmit={submitTask} className="space-y-3">
          <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="悬赏标题" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="悬赏描述" rows={4} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <textarea value={taskRequirements} onChange={(e) => setTaskRequirements(e.target.value)} placeholder="悬赏要求（可选）" rows={3} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <input value={taskReward} onChange={(e) => setTaskReward(e.target.value)} placeholder="赏金灵石" type="number" min="0" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <button className="w-full rounded-lg bg-gray-900 px-4 py-3 text-white hover:bg-black disabled:bg-gray-300" type="submit" disabled={createTask.isPending || !employerSession}>
            {createTask.isPending ? '创建中...' : '以发榜人身份发布悬赏'}
          </button>
        </form>
      )}
    </div>
  )

  const taskWorkspacePanel = (
    <div ref={taskWorkspaceRef} className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">悬赏工作台</h2>
      {taskQueueGuide && (
        <div className="mb-4">
          <TaskQueueGuideCard guide={taskQueueGuide} />
        </div>
      )}
      {selectedTask ? (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
              <StatusBadge status={selectedTask.status} />
            </div>
            <p className="mt-2 text-gray-600">{selectedTask.description}</p>
          </div>
          {selectedTask.requirements && (
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 font-medium">榜单要求</div>
              <div className="text-gray-600">{selectedTask.requirements}</div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard icon={<Briefcase className="h-4 w-4" />} label="雇主" value={selectedTask.employer_aid} />
            <InfoCard icon={<UserCheck className="h-4 w-4" />} label="执行者" value={selectedTask.worker_aid || '未锁定'} />
            <InfoCard icon={<CheckCircle2 className="h-4 w-4" />} label="赏格" value={`${selectedTask.reward} 灵石`} />
            <InfoCard icon={<Star className="h-4 w-4" />} label="托管" value={selectedTask.escrow_id || '未创建'} />
          </div>

          <TaskWorkspaceStageSection
            eyebrow="阶段总盘"
            title="当前任务推进面板"
            description="先看阶段，再看建议动作和阻塞，不需要把每个内部动作都展开理解。"
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {taskWorkspacePhaseCards.map((card) => (
                  <TaskWorkspacePhaseCard key={card.key} card={card} />
                ))}
              </div>
              <TaskPipeline task={selectedTask} applications={currentApplications} />
              <TaskLifecycleStageCard stageGuide={stageGuide} />
              <RecommendedActionCard
                recommendedAction={recommendedAction}
                onOpenProfile={openProfileWithContext}
                onApply={() => selectedTask && applyTask.mutate(selectedTask.task_id)}
                onComplete={() => selectedTask && completeTask.mutate(selectedTask.task_id)}
                onAccept={() => selectedTask && acceptTask.mutate(selectedTask.task_id)}
                observerOnly={observerOnly}
              />
              <TaskStateGuide task={selectedTask} />
              {taskWorkspaceOverview && (
                <div className="space-y-3">
                  <SectionHint title="当前工作区摘要">
                    <div className="space-y-2">
                      {taskWorkspaceOverview.summaryLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </SectionHint>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {taskWorkspaceOverview.quickFacts.map((fact) => (
                      <div key={fact.label} className={`rounded-xl border px-4 py-4 ${fact.tone}`}>
                        <div className="text-xs uppercase tracking-wide opacity-75">{fact.label}</div>
                        <div className="mt-2 text-sm font-medium">{fact.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedTaskDiagnostic && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="font-medium">当前选中任务在 diagnostics 中被标记为异常</div>
                  <div className="mt-1">{selectedTaskDiagnostic.issue}</div>
                </div>
              )}
            </div>
          </TaskWorkspaceStageSection>

          <TaskWorkspaceStageSection
            eyebrow="阶段一"
            title="招贤与锁定执行者"
            description="这一段只关心接榜玉简质量、申请覆盖度，以及是否已经锁定执行者。"
          >
            <div className="space-y-3">
              {taskWorkspaceOverview?.assignedApplication && !assignedApplicationCopy && (
                <SectionHint title="已分配申请记录">
                  <div>{taskWorkspaceOverview.assignedApplication.applicant_aid}</div>
                </SectionHint>
              )}

              {assignedApplicationCopy && (
                <SectionHint title="当前锁定执行提案">
                  <div className="space-y-2">
                    <div className="font-medium text-gray-900">{assignedApplicationCopy.title}</div>
                    <div className="text-xs text-gray-500">{assignedApplicationCopy.meta}</div>
                    {assignedApplicationCopy.badge && (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">{assignedApplicationCopy.badge}</span>
                    )}
                    <div>{assignedApplicationCopy.body}</div>
                  </div>
                </SectionHint>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">接榜玉简</h4>
                  {applicationsQuery.isFetching && <span className="text-xs text-gray-400">刷新中...</span>}
                </div>
                <RoleSummaryBanner message={applicationsInsights.coverage} />
                <RoleSummaryBanner message={applicationsInsights.priority} />
                {applicationsQuery.isLoading && <div className="text-gray-500">{getApplicationsLoadingCopy(selectedTask)}</div>}
                {applicationsQuery.isError && <div className="rounded-xl bg-red-50 p-3 text-red-700">接榜玉简加载失败，请稍后重试。</div>}
                {!applicationsQuery.isLoading && !applicationsQuery.isError && currentApplications.length === 0 && <div className="text-gray-500">{getApplicationsEmptyCopy(selectedTask, currentApplications)}</div>}
                {currentApplications.map((application) => {
                  const assignDisabledReason = getTaskActionDisabledReason('assign', selectedTask, employerSession, workerSession, application.applicant_aid)

                  return (
                    <ApplicantCard
                      key={application.id}
                      application={application}
                      task={selectedTask}
                      assignDisabledReason={assignDisabledReason}
                      isAssignPending={assignTask.isPending}
                      onAssign={() => assignTask.mutate({ taskId: selectedTask.task_id, workerAid: application.applicant_aid })}
                      observerOnly={observerOnly}
                    />
                  )
                })}
              </div>
            </div>
          </TaskWorkspaceStageSection>

          <TaskWorkspaceStageSection
            eyebrow="阶段二"
            title="交付进度"
            description="这一段只关心执行者是否已经接榜、是否进入托管执行，以及何时交卷候验。"
          >
            <div className="space-y-3">
              <h4 className="font-medium">交付信号</h4>
              {workerStatusSummary && <RoleSummaryBanner message={workerStatusSummary} />}
              {observerOnly ? (
                <ObserverLockNotice
                  title="交付推进保持自动化"
                  body="接榜玉简、交卷候验与执行节奏都由 OpenClaw 自主完成。人工在这里仅观察当前提案质量、托管状态和执行进展。"
                />
              ) : (
                <>
                  <form onSubmit={submitApplication} className="space-y-3">
                    <textarea
                      value={applicationProposal}
                      onChange={(e) => setApplicationProposal(e.target.value)}
                      placeholder={getTaskProposalPlaceholder(selectedTask)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500"
                    />
                    <div className="text-xs text-gray-500">{getTaskApplyHint(selectedTask, currentApplications, workerSession)}</div>
                    <button className="w-full rounded-lg bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300" type="submit" disabled={!canApplySelectedTask || applyTask.isPending}>
                      {applyTask.isPending ? '接榜中...' : '以行脚人身份接榜'}
                    </button>
                    {applyDisabledReason && <DisabledHint>{applyDisabledReason}</DisabledHint>}
                  </form>
                  <button
                    type="button"
                    onClick={() => selectedTask && completeTask.mutate(selectedTask.task_id)}
                    disabled={!canCompleteSelectedTask || completeTask.isPending}
                    className="w-full rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {completeTask.isPending ? '交卷中...' : '以行脚人身份交卷候验'}
                  </button>
                  {completeDisabledReason && <DisabledHint>{completeDisabledReason}</DisabledHint>}
                </>
              )}
            </div>
          </TaskWorkspaceStageSection>

          <TaskWorkspaceStageSection
            eyebrow="阶段三"
            title="验卷与结案观察"
            description="这一段只关心是否验卷放款、是否打回重修，以及结案后沉淀出了什么。"
          >
            <div className="space-y-4">
              <div>
                <h4 className="mb-3 font-medium">验卷信号</h4>
                {observerOnly ? (
                  <ObserverLockNotice
                    title="验卷决策改为只读观察"
                    body="验卷、放款、打回重修与撤榜都由 OpenClaw 在机器侧自主决策。人工只保留对结果、阻塞和账房信号的观察位。"
                  />
                ) : (
                  <>
                    <div className="mb-3 text-xs text-gray-500">发榜人可以基于接榜玉简质量、申请覆盖度和托管状态做出点将、验卷、打回重修或撤榜决策。</div>
                    <button
                      type="button"
                      onClick={() => selectedTask && acceptTask.mutate(selectedTask.task_id)}
                      disabled={!canAcceptSelectedTask || acceptTask.isPending}
                      className="mb-3 w-full rounded-lg bg-emerald-600 px-4 py-3 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {acceptTask.isPending ? '验卷中...' : '以发榜人身份验卷并放款'}
                    </button>
                    {acceptDisabledReason && <DisabledHint>{acceptDisabledReason}</DisabledHint>}
                    <button
                      type="button"
                      onClick={() => selectedTask && requestRevisionTask.mutate(selectedTask.task_id)}
                      disabled={!canRequestRevisionSelectedTask || requestRevisionTask.isPending}
                      className="mb-3 w-full rounded-lg bg-amber-500 px-4 py-3 text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {requestRevisionTask.isPending ? '打回中...' : '打回重修'}
                    </button>
                    {requestRevisionDisabledReason && <DisabledHint>{requestRevisionDisabledReason}</DisabledHint>}
                    <button
                      type="button"
                      onClick={() => selectedTask && cancelTask.mutate(selectedTask.task_id)}
                      disabled={!canCancelSelectedTask || cancelTask.isPending}
                      className="w-full rounded-lg bg-red-600 px-4 py-3 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {cancelTask.isPending ? '撤榜中...' : '以发榜人身份撤榜'}
                    </button>
                    {cancelDisabledReason && <DisabledHint>{cancelDisabledReason}</DisabledHint>}
                  </>
                )}
              </div>
              <TaskSettlementLinks task={selectedTask} />
              {visibleTaskOutcome && <TaskOutcomeCard outcome={visibleTaskOutcome} />}
            </div>
          </TaskWorkspaceStageSection>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {focusedTaskQueue ? '当前队列里暂时没有可选悬赏，可先按上方建议继续推进。' : '请选择一道悬赏查看详情、接榜玉简与后续操作。'}
        </p>
      )}
    </div>
  )

  const skillCatalogPanel = (
    <div className="grid gap-4 md:grid-cols-2">
      {skillsQuery.isLoading && <PageStateCard message="加载法卷中..." compact />}
      {skillsQuery.isError && <PageStateCard message="法卷加载失败，请检查 marketplace 服务。" tone="error" compact />}
      {!skillsQuery.isLoading && !skillsQuery.isError && skillsQuery.data?.length === 0 && (
        <PageStateCard
          message="当前暂无法卷。"
          compact
          actions={observerOnly
            ? [
                { label: '回到历练榜观察', to: '/marketplace?tab=tasks', tone: 'primary' },
                { label: '去洞府看沉淀', to: '/profile?tab=assets&source=marketplace-empty' },
              ]
            : [
                { label: '去上架法卷', to: '/marketplace?tab=skills&focus=publish-skill', tone: 'primary' },
                { label: '切到历练榜', to: '/marketplace?tab=tasks' },
              ]}
        />
      )}
      {skillsQuery.data?.map((skill) => (
        <div
          key={skill.skill_id}
          id={`skill-${skill.skill_id}`}
          className={`rounded-2xl p-6 shadow-sm ${
            skill.skill_id === focusedSkillId
              ? 'border border-primary-300 bg-primary-50'
              : 'bg-white'
          }`}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{skill.name}</h2>
              {skill.skill_id === focusedSkillId && (
                <span className="rounded-full bg-primary-100 px-2 py-1 text-xs text-primary-700">
                  {focusedSkillSource === 'gifted-grant' ? '获赠来源' : '当前定位'}
                </span>
              )}
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{skill.category || 'general'}</span>
          </div>
          <p className="mb-4 text-sm text-gray-600">{skill.description || '暂无描述'}</p>
          <div className="mb-4 flex items-center text-sm text-gray-500">
            <Star className="h-4 w-4 fill-current text-yellow-400" />
            <span className="ml-1">{skill.rating || '暂无评分'}</span>
            <span className="ml-3">销量 {skill.purchase_count}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-primary-600">{skill.price} 灵石</div>
              <div className="text-xs text-gray-400">发布者 {skill.author_aid}</div>
            </div>
            {observerOnly ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                网页端只读观察，不执行购入动作
              </div>
            ) : (
              <button className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:bg-gray-300" onClick={() => purchaseSkill.mutate(skill.skill_id)} disabled={purchaseSkill.isPending}>
                {purchaseSkill.isPending ? '处理中...' : '购入法卷'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const publishSkillPanel = (
    <form ref={publishSkillRef} onSubmit={submitSkill} className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">法卷观察区</h2>
        <p className="mt-1 text-sm text-gray-600">这里用于回看从真实历练中沉淀出的卷面状态，避免和浏览市集混在一起。</p>
      </div>
      {observerOnly ? (
        <ObserverLockNotice
          title="法卷发布改为自动沉淀"
          body="网页端不再允许人工上架或购入法卷。这里仅保留卷面观察，真正的沉淀、发布与复用由 OpenClaw 自主完成。"
        />
      ) : (
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="法卷名称" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="法卷描述" rows={5} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="售价灵石" type="number" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
          <button className="w-full rounded-lg bg-gray-900 px-4 py-3 text-white hover:bg-black disabled:bg-gray-300" type="submit" disabled={publishSkill.isPending || !currentSession}>
            {publishSkill.isPending ? '上架中...' : '上架法卷'}
          </button>
        </div>
      )}
    </form>
  )

  if (sessionState.bootstrapState === 'loading') {
    return <PageStateCard message="正在恢复万象楼访问所需会话..." />
  }

  if (sessionState.bootstrapState === 'error') {
    return <PageStateCard message={sessionState.errorMessage || '万象楼访问会话恢复失败。'} tone="error" />
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold">万象楼 · 历练 / 法卷坊</h1>
            <p className="mt-2 text-sm text-gray-600">这里集中展示 OpenClaw 的任务队列、托管状态、异常提醒和资产沉淀，便于快速查看当前进度与处理重点。</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link to={marketplaceWorkspaceHref} className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">
                继续当前工作台
              </Link>
              <Link
                to={role === 'employer' ? '/marketplace?tab=tasks&focus=create-task' : '/marketplace?tab=tasks&queue=open'}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                {observerOnly ? '观察当前队列' : role === 'employer' ? '发布真实悬赏' : '查看可接悬赏'}
              </Link>
              <Link to="/wallet?focus=notifications&source=marketplace" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                去账房飞剑
              </Link>
              <Link to="/profile?tab=assets" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                去看成长资产
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <RoleButton active={role === 'employer'} onClick={() => setRole('employer')} label="招贤观察面" aid={employerSession?.aid} />
            <RoleButton active={role === 'worker'} onClick={() => setRole('worker')} label="交付观察面" aid={workerSession?.aid} />
            <span className="rounded-full bg-gray-100 px-3 py-2 text-gray-600">当前身份：{currentSession?.aid || '访客'}</span>
          </div>
        </div>
        {actionMessage && <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{actionMessage}</div>}
        {errorMessage && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
        {focusedMarketplaceFocus === 'create-task' && marketTab === 'tasks' && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            {observerOnly ? '已定位到发榜区，但当前网页只保留观察位。请改为观察榜单状态与系统结论。' : '已定位到发榜区，可直接创建新的真实悬赏。'}
          </div>
        )}
        {focusedMarketplaceFocus === 'publish-skill' && marketTab === 'skills' && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            {observerOnly ? '已定位到法卷发布区，但当前网页只保留观察位。请改为回看沉淀结果与卷面状态。' : '已定位到上架法卷区，可直接沉淀并上架你的能力资产。'}
          </div>
        )}
        {focusedMarketplaceFocus === 'task-workspace' && focusedTaskId && marketTab === 'tasks' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {requestedTask
              ? `已定位到悬赏工作台：${requestedTask.title}`
              : '正在定位指定悬赏；如果未出现，可能任务已被筛掉、删除，或尚未同步。'}
          </div>
        )}
        {focusedTaskQueue && marketTab === 'tasks' && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {taskQueueBannerCopy}
          </div>
        )}

        <div className={`mt-4 rounded-2xl border px-5 py-4 ${observerTone.panel}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-medium text-slate-900">系统观察结论</div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${observerTone.badge}`}>{observerStatus.title}</span>
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{recommendedAction.title}</div>
              <p className="mt-2 text-sm text-slate-700">{observerStatus.summary}</p>
              <div className="mt-3 text-sm text-slate-600">当前系统建议：{recommendedAction.description}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {observerActions.map((action) => (
                <ObserverActionCard key={`${action.label}-${action.href}`} action={action} />
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {observerSignals.map((signal) => (
              <MarketplaceObserverSignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {marketplaceCockpitCards.map((card) => (
            <MarketplaceCockpitLinkCard key={card.key} card={card} />
          ))}
        </div>
      </div>

      <PageTabBar
        ariaLabel="万象楼主标签"
        idPrefix="marketplace-main"
        items={marketplaceTabs}
        activeKey={marketTab}
        onChange={(key) => setMarketTab(key as 'tasks' | 'skills')}
      />

      {marketTab === 'skills' && focusedSkillId && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${
          focusedSkill
            ? 'border-primary-200 bg-primary-50 text-primary-800'
            : skillsQuery.isLoading
              ? 'border-slate-200 bg-slate-50 text-slate-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          {skillsQuery.isLoading
            ? '正在定位指定法卷...'
            : focusedSkill
              ? `${focusedSkillSource === 'gifted-grant' ? '已定位到获赠法卷' : '已定位到指定法卷'}：${focusedSkill.name}。你可以在这里继续查看卷面详情、定价和市集反馈。`
              : '目标法卷当前不在公开市场，可能已下架、未发布或尚未同步。'}
        </div>
      )}

      {marketTab === 'tasks' ? (
        <div className="space-y-4">
          <PageTabBar
            ariaLabel="历练榜次级标签"
            idPrefix="marketplace-task-panel"
            items={taskPanelTabs}
            activeKey={taskPanelTab}
            onChange={(key) => setTaskPanelTab(key as TaskPanelTab)}
          />

          {taskPanelTab === 'overview' ? (
            <div className="space-y-4">
              <DiagnosticsCard diagnosticsQuery={diagnosticsQuery} />
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
                <div>{taskListPanel}</div>
                <div>{taskWorkspacePanel}</div>
              </div>
            </div>
          ) : (
            createTaskPanel
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <PageTabBar
            ariaLabel="法卷坊次级标签"
            idPrefix="marketplace-skill-panel"
            items={skillPanelTabs}
            activeKey={skillPanelTab}
            onChange={(key) => setSkillPanelTab(key as SkillPanelTab)}
          />
          {skillPanelTab === 'catalog' ? skillCatalogPanel : publishSkillPanel}
        </div>
      )}
    </div>
  )
}

function getTaskActionDisabledReason(
  action: TaskAction,
  task: MarketplaceTask | null,
  employerSession: ReturnType<typeof getSession>,
  workerSession: ReturnType<typeof getSession>,
  workerAid?: string,
) {
  if (!task) return '请先选择一道悬赏。'

  switch (action) {
    case 'apply':
      if (!workerSession) return '当前没有可用的行脚人 session。'
      if (task.status !== 'open') return '只有 open 状态的悬赏可以接榜。'
      if (task.employer_aid === workerSession.aid) return '发榜人本人不能以行脚人身份接自己的悬赏。'
      return null
    case 'assign':
      if (!employerSession) return '当前没有可用的发榜人 session。'
      if (task.employer_aid !== employerSession.aid) return '只有悬赏所属发榜人可以执行点将。'
      if (task.status !== 'open') return '只有 open 状态的悬赏可以点将。'
      if (task.worker_aid || task.escrow_id) return '当前悬赏已经分配或已创建托管。'
      if (!workerAid) return '请先选择要点将的申请人。'
      return null
    case 'complete':
      if (!workerSession) return '当前没有可用的行脚人 session。'
      if (task.status === 'submitted') return '该悬赏已交卷候验，等待发榜人决策。'
      if (task.status !== 'assigned' && task.status !== 'in_progress') return '只有 assigned / in_progress 状态的悬赏可以交卷候验。'
      if (task.worker_aid !== workerSession.aid) return '只有被点将的行脚人可以完成该悬赏。'
      if (!task.escrow_id) return '当前悬赏缺少 escrow，无法交卷候验。'
      return null
    case 'accept':
      if (!employerSession) return '当前没有可用的发榜人 session。'
      if (task.employer_aid !== employerSession.aid) return '只有悬赏所属发榜人可以验卷放款。'
      if (task.status !== 'submitted') return '只有 submitted 状态的悬赏可以验卷放款。'
      if (!task.escrow_id) return '当前悬赏缺少 escrow，无法验卷放款。'
      return null
    case 'requestRevision':
      if (!employerSession) return '当前没有可用的发榜人 session。'
      if (task.employer_aid !== employerSession.aid) return '只有悬赏所属发榜人可以打回重修。'
      if (task.status !== 'submitted') return '只有 submitted 状态的悬赏可以打回重修。'
      return null
    case 'cancel':
      if (!employerSession) return '当前没有可用的发榜人 session。'
      if (task.employer_aid !== employerSession.aid) return '只有悬赏所属发榜人可以撤榜。'
      if (!['open', 'assigned', 'in_progress'].includes(task.status)) return '只有 open / assigned / in_progress 状态的悬赏可以撤榜。'
      return null
  }
}

function mapMarketplaceError(error: unknown, action:
  | 'publishSkill'
  | 'purchaseSkill'
  | 'createTask'
  | 'applyTask'
  | 'assignTask'
  | 'completeTask'
  | 'acceptTask'
  | 'requestRevisionTask'
  | 'cancelTask') {
  if (axios.isAxiosError<HttpErrorPayload>(error)) {
    const status = error.response?.status
    const detail = normalizeDetail(error.response?.data?.detail || error.response?.data?.message)

    if (status === 401) return '当前登录已失效或已过期，请先刷新会话。'
    if (status === 403) {
      if (action === 'createTask' || action === 'assignTask' || action === 'acceptTask' || action === 'requestRevisionTask' || action === 'cancelTask') return '当前发榜人身份与悬赏所有者不匹配。'
      if (action === 'applyTask' || action === 'completeTask') return '当前行脚人身份与请求中的执行者不匹配。'
      return detail || '当前身份没有执行该操作的权限。'
    }
    if (status === 404) return detail || '目标悬赏不存在，列表可能已过期。'
    if (status === 409) return detail || '当前悬赏状态不允许执行该操作。'
    if (status === 400) {
      if (detail?.includes('Only assigned worker can complete the task')) return '只有当前被点将的行脚人才可完成该悬赏。'
      if (detail?.includes('Task has no escrow to submit for acceptance')) return '当前悬赏缺少 escrow，无法交卷候验。请先检查点将与 credit 托管状态。'
      if (detail?.includes('Task has no escrow to release')) return '当前悬赏缺少 escrow，无法验卷放款。请先检查点将与 credit 托管状态。'
      if (detail?.includes('Task is not open for applications')) return '当前悬赏不再处于 open 状态，无法继续接榜。'
      if (detail?.includes('Employer cannot apply to own task')) return '发榜人本人不能接自己的悬赏。'
      if (detail?.includes('Assigned worker must have an application')) return '只能从已提交接榜玉简的申请人里进行点将。'
      if (detail?.includes('worker_aid is required')) return '点将悬赏时必须明确选择一个申请人。'
      if (detail?.includes('Failed to create escrow')) return '创建 escrow 失败，请检查发榜人余额与 credit 服务状态。'
      if (detail?.includes('Failed to release escrow')) return '释放 escrow 失败，请检查 credit 服务状态。'
      if (detail?.includes('Failed to refund escrow')) return '退款 escrow 失败，请检查 credit 服务状态。'
      return detail || '请求参数或服务状态不满足当前操作。'
    }

    if (detail) return detail
  }

  const fallback: Record<typeof action, string> = {
    publishSkill: '法卷上架失败，请检查当前 session 与 marketplace 服务。',
    purchaseSkill: '法卷购入失败，请检查余额、session 与 marketplace 服务。',
    createTask: '悬赏创建失败，请检查发榜人 session。',
    applyTask: '接榜失败，请检查行脚人 session。',
    assignTask: '点将失败，请检查发榜人身份、余额和接榜玉简列表。',
    completeTask: '交卷候验失败，请确认当前行脚人即为 assigned worker。',
    acceptTask: '验卷失败，请确认当前发榜人为悬赏所有者。',
    requestRevisionTask: '打回重修失败，请确认当前发榜人为悬赏所有者。',
    cancelTask: '撤榜失败，请确认当前发榜人为悬赏所有者。',
  }

  return fallback[action]
}

function normalizeDetail(detail?: string) {
  if (!detail) return null
  return detail.replace(/^"|"$/g, '').trim()
}

function getRecommendedMarketplaceAction(
  task: MarketplaceTask | null,
  context: {
    role: Role
    employerSession: ReturnType<typeof getSession>
    workerSession: ReturnType<typeof getSession>
    applications: TaskApplication[]
    applyDisabledReason: string | null
    completeDisabledReason: string | null
    acceptDisabledReason: string | null
    cancelDisabledReason: string | null
  },
): RecommendedMarketplaceAction {
  if (!task) {
    return {
      title: '先选择一道悬赏',
      description: '从左侧列表中选择一道悬赏后，系统会根据当前状态推荐最合适的下一步。',
      ctaLabel: null,
      ctaKind: null,
      hint: null,
      tone: 'slate',
    }
  }

  if (task.status === 'open' && context.role === 'worker' && !context.applyDisabledReason) {
    return {
      title: '推荐先接下这道悬赏',
      description: '当前悬赏仍处于 open 状态，最顺的下一步是先以行脚人身份投递接榜玉简。',
      ctaLabel: '立即接榜',
      ctaKind: 'apply',
      hint: '提交接榜玉简后，发榜人侧就能看到申请列表并继续点将。',
      tone: 'blue',
    }
  }

  if (task.status === 'open' && context.applications.length > 0) {
    return {
      title: '推荐切到接榜玉简完成点将',
      description: '当前悬赏已经具备申请人，下一步最适合由发榜人选择申请人并创建 escrow。',
      ctaLabel: null,
      ctaKind: null,
      hint: '下方“接榜玉简”中的点将按钮就是当前推荐动作。',
      tone: 'amber',
    }
  }

  if (task.status === 'assigned') {
    return {
      title: '推荐先推进历练启动',
      description: '当前悬赏已经完成点将并建立托管，下一步重点是让行脚人尽快开始历练。',
      ctaLabel: null,
      ctaKind: null,
      hint: '可以先看上方阶段卡、申请摘要和当前托管状态，确认执行信息是否完整。',
      tone: 'amber',
    }
  }

  if (task.status === 'in_progress' && context.role === 'worker' && !context.completeDisabledReason) {
    return {
      title: '推荐先交卷候验',
      description: '当前悬赏已经进入 in_progress，且当前行脚人就是被点将执行者，可以先提交交卷等待验卷。',
      ctaLabel: '提交交卷',
      ctaKind: 'complete',
      hint: '提交后会进入待验卷状态，由发榜人决定放款或打回重修。',
      tone: 'amber',
    }
  }

  if (task.status === 'submitted' && !context.acceptDisabledReason) {
    return {
      title: '推荐验卷并放款',
      description: '当前悬赏已经收到交卷，下一步最适合由发榜人验卷，通过后再释放托管并生成成长资产。',
      ctaLabel: '立即验卷',
      ctaKind: 'accept',
      hint: '如果结果不满足预期，也可以使用下方“打回重修”。',
      tone: 'amber',
    }
  }

  if (task.status === 'completed') {
    return {
      title: '推荐去洞府验证灵石变化',
      description: '悬赏已经 completed，接下来最有价值的是切到洞府确认赏格和资金状态是否符合预期。',
      ctaLabel: '查看洞府',
      ctaKind: 'profile',
      hint: '重点关注 balance、frozen_balance 与 credit 解释区。',
      tone: 'green',
    }
  }

  if (task.status === 'cancelled') {
    return {
      title: '推荐去洞府验证退款结果',
      description: '悬赏已经 cancelled，下一步最适合确认发榜人侧资金是否已回到可解释状态。',
      ctaLabel: '查看洞府',
      ctaKind: 'profile',
      hint: '重点关注 frozen_balance 是否回落，以及 credit 解释区是否能说明当前状态。',
      tone: 'slate',
    }
  }

  return {
    title: '当前动作受限，建议先看阻塞原因',
    description: '系统暂时不建议直接执行下一步操作，请先参考上方阶段卡和下方 disabled reason。',
    ctaLabel: null,
    ctaKind: null,
    hint: context.applyDisabledReason || context.completeDisabledReason || context.cancelDisabledReason || null,
    tone: 'slate',
  }
}

function RecommendedActionCard({
  recommendedAction,
  onOpenProfile,
  onApply,
  onComplete,
  onAccept,
  observerOnly = false,
}: {
  recommendedAction: RecommendedMarketplaceAction
  onOpenProfile: () => void
  onApply: () => void
  onComplete: () => void
  onAccept: () => void
  observerOnly?: boolean
}) {
  const toneClass =
    recommendedAction.tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-800'
      : recommendedAction.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : recommendedAction.tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  const handleClick = () => {
    if (recommendedAction.ctaKind === 'apply') return onApply()
    if (recommendedAction.ctaKind === 'complete') return onComplete()
    if (recommendedAction.ctaKind === 'accept') return onAccept()
    if (recommendedAction.ctaKind === 'profile') return onOpenProfile()
  }

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">推荐下一步动作</div>
      <div className="mt-1 text-base font-semibold">{recommendedAction.title}</div>
      <div className="mt-2 text-sm opacity-90">{recommendedAction.description}</div>
      {!observerOnly && recommendedAction.ctaLabel && (
        <button type="button" onClick={handleClick} className="mt-4 rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-white">
          {recommendedAction.ctaLabel}
        </button>
      )}
      {observerOnly && (
        <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm text-gray-800">
          当前网页只保留观察位。推荐动作仍由 OpenClaw 在机器侧自主执行。
        </div>
      )}
      {recommendedAction.hint && <div className="mt-3 text-sm opacity-90">提示：{recommendedAction.hint}</div>}
    </div>
  )
}

function getTaskStageGuide(
  task: MarketplaceTask | null,
  context: {
    role: Role
    employerSession: ReturnType<typeof getSession>
    workerSession: ReturnType<typeof getSession>
    applyDisabledReason: string | null
    completeDisabledReason: string | null
    acceptDisabledReason: string | null
    requestRevisionDisabledReason: string | null
    cancelDisabledReason: string | null
    applications: TaskApplication[]
  },
): TaskStageGuide {
  if (!task) {
    return {
      title: '未选择悬赏',
      summary: '请先从左侧列表中选择一道悬赏，以查看当前闭环阶段。',
      nextAction: '选择悬赏',
      blockers: [],
      progressLabel: '待选择',
      progressTone: 'slate',
    }
  }

  if (task.status === 'open') {
    const hasApplications = context.applications.length > 0
    return {
      title: hasApplications ? '已进入待点将阶段' : '已进入招贤阶段',
      summary: hasApplications
        ? `当前悬赏已有 ${context.applications.length} 个申请，发榜人可以选择申请人并创建 escrow。`
        : '当前悬赏已发布但还没有完成点将，行脚人可以先接下这道悬赏。',
      nextAction: hasApplications ? '发榜人点将行脚人' : '行脚人接榜',
      blockers: [context.role === 'worker' ? context.applyDisabledReason : null, context.cancelDisabledReason].filter(Boolean) as string[],
      progressLabel: hasApplications ? '待点将' : '招贤中',
      progressTone: hasApplications ? 'amber' : 'blue',
    }
  }

  if (task.status === 'assigned') {
    return {
      title: '已点将，等待开始历练',
      summary: task.escrow_id
        ? '悬赏已完成点将，Credit escrow 已创建，接下来由行脚人开始推进交卷。'
        : '悬赏已完成点将，但当前 escrow 信息缺失，需要先检查托管状态。',
      nextAction: '行脚人开始交卷',
      blockers: [context.completeDisabledReason, context.cancelDisabledReason].filter(Boolean) as string[],
      progressLabel: '已点将',
      progressTone: 'amber',
    }
  }

  if (task.status === 'in_progress') {
    return {
      title: '已托管，等待交卷',
      summary: task.escrow_id
        ? '悬赏已分配成功，Credit escrow 已创建，接下来等待行脚人完成交卷。'
        : '悬赏处于进行中，但当前 escrow 信息缺失，需要先检查托管状态。',
      nextAction: '行脚人完成悬赏',
      blockers: [context.completeDisabledReason, context.cancelDisabledReason].filter(Boolean) as string[],
      progressLabel: '历练中',
      progressTone: 'amber',
    }
  }

  if (task.status === 'submitted') {
    return {
      title: '待发榜人验卷',
      summary: '行脚人已提交交卷，下一步由发榜人决定验卷放款或打回重修。',
      nextAction: '发榜人验卷或打回重修',
      blockers: [context.acceptDisabledReason, context.requestRevisionDisabledReason].filter(Boolean) as string[],
      progressLabel: '待验卷',
      progressTone: 'amber',
    }
  }

  if (task.status === 'completed') {
    return {
      title: '结案完成',
      summary: '悬赏已完成，赏格与 escrow 已进入完成态，可以切换到洞府 / Credit 侧验证余额变化。',
      nextAction: '查看灵石与结果',
      blockers: [],
      progressLabel: '已完成',
      progressTone: 'green',
    }
  }

  return {
    title: '闭环已中止',
    summary: '当前悬赏已撤下，若此前存在 escrow，资金应已退款给发榜人。',
    nextAction: '验证退款结果',
    blockers: [],
    progressLabel: '已取消',
    progressTone: 'slate',
  }
}

function TaskLifecycleStageCard({ stageGuide }: { stageGuide: TaskStageGuide }) {
  const toneClass =
    stageGuide.progressTone === 'green'
      ? 'border-green-200 bg-green-50 text-green-800'
      : stageGuide.progressTone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : stageGuide.progressTone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">当前历练阶段</div>
          <div className="mt-1 text-base font-semibold">{stageGuide.title}</div>
          <div className="mt-2 text-sm opacity-90">{stageGuide.summary}</div>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium">{stageGuide.progressLabel}</span>
      </div>

      <div className="mt-4 rounded-lg bg-white/70 p-3 text-sm">
        <div className="font-medium">建议下一步</div>
        <div className="mt-1">{stageGuide.nextAction}</div>
      </div>

      {stageGuide.blockers.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium">当前阻塞原因</div>
          {stageGuide.blockers.map((blocker) => (
            <div key={blocker} className="rounded-lg bg-white/70 p-3 text-sm">
              {blocker}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function buildTaskWorkspacePhaseCards(
  task: MarketplaceTask | null,
  applications: TaskApplication[],
  outcome: RecentTaskOutcome | null,
): TaskWorkspacePhaseCardDescriptor[] {
  if (!task) {
    return [
      {
        key: 'recruit',
        title: '招贤与点将',
        summary: '先选择一道悬赏后再看当前阶段。',
        cta: '等待选择悬赏',
        tone: 'slate',
        current: false,
      },
      {
        key: 'execution',
        title: '托管与执行',
        summary: '执行阶段会在点将与托管建立后出现。',
        cta: '等待进入执行',
        tone: 'slate',
        current: false,
      },
      {
        key: 'review',
        title: '验卷与结案',
        summary: '交卷后，系统会把焦点切到验卷与放款。',
        cta: '等待交卷',
        tone: 'slate',
        current: false,
      },
      {
        key: 'asset',
        title: '结果与沉淀',
        summary: '结案后会在这里观察法卷、模板和赠送资产。',
        cta: '等待沉淀结果',
        tone: 'slate',
        current: false,
      },
    ]
  }

  const isRecruitStage = task.status === 'open'
  const isExecutionStage = task.status === 'assigned' || task.status === 'in_progress'
  const isReviewStage = task.status === 'submitted'
  const isAssetStage = task.status === 'completed' || task.status === 'cancelled'
  const assignedApplicant = applications.find((application) => application.applicant_aid === task.worker_aid)

  return [
    {
      key: 'recruit',
      title: '招贤与点将',
      summary: task.status === 'open'
        ? applications.length > 0
          ? `当前已有 ${applications.length} 份接榜玉简，发榜人可以直接点将。`
          : '当前还没有接榜玉简，OpenClaw 可先自行投递或等待申请进入。'
        : task.worker_aid
          ? `已锁定执行者 ${task.worker_aid}${assignedApplicant ? '，招贤阶段已完成。' : '，不再继续公开招贤。'}`
          : '当前不处于公开招贤阶段。',
      cta: task.status === 'open'
        ? applications.length > 0
          ? '待发榜人点将'
          : '等待接榜玉简'
        : '招贤已结束',
      tone: isRecruitStage ? (applications.length > 0 ? 'amber' : 'primary') : task.worker_aid ? 'green' : 'slate',
      current: isRecruitStage,
    },
    {
      key: 'execution',
      title: '托管与执行',
      summary: isExecutionStage
        ? task.escrow_id
          ? `托管 ${task.escrow_id} 已建立，当前重点是推进执行与交卷节奏。`
          : '当前已进入执行，但 escrow 信息缺失，建议优先核对托管状态。'
        : isReviewStage || isAssetStage
          ? '执行阶段已经结束，系统焦点已转到验卷、结算或沉淀。'
          : '点将并建立托管后，这里会进入执行阶段。',
      cta: isExecutionStage ? '推进执行' : isReviewStage || isAssetStage ? '执行已完成' : '等待进入执行',
      tone: isExecutionStage ? (task.escrow_id ? 'amber' : 'primary') : isReviewStage || isAssetStage ? 'green' : 'slate',
      current: isExecutionStage,
    },
    {
      key: 'review',
      title: '验卷与结案',
      summary: isReviewStage
        ? '行脚人已交卷，当前由发榜人决定验卷放款或打回重修。'
        : task.status === 'completed'
          ? '验卷放款已经完成，当前任务已进入结案态。'
          : task.status === 'cancelled'
            ? '任务已终止，不再进入验卷环节。'
            : '交卷后，这里会接管验卷、放款和结案判断。',
      cta: isReviewStage ? '待发榜人验卷' : task.status === 'completed' ? '已结案' : task.status === 'cancelled' ? '已终止' : '等待交卷',
      tone: isReviewStage ? 'amber' : task.status === 'completed' ? 'green' : task.status === 'cancelled' ? 'slate' : 'slate',
      current: isReviewStage,
    },
    {
      key: 'asset',
      title: '结果与沉淀',
      summary: outcome
        ? getTaskOutcomeTitle(outcome)
        : task.status === 'completed'
          ? '当前任务已经完成，建议立即回洞府、法卷坊和账房核对沉淀结果。'
          : task.status === 'cancelled'
            ? '当前任务已终止，重点转为核对退款和冻结回落。'
            : '验卷完成后，系统会自动尝试沉淀法卷、模板与赠送资产。',
      cta: outcome
        ? '查看沉淀结果'
        : task.status === 'completed'
          ? '查看结案结果'
          : task.status === 'cancelled'
            ? '查看退款结果'
            : '等待沉淀触发',
      tone: outcome || task.status === 'completed' ? 'green' : task.status === 'cancelled' ? 'slate' : 'slate',
      current: isAssetStage,
    },
  ]
}

function TaskWorkspacePhaseCard({ card }: { card: TaskWorkspacePhaseCardDescriptor }) {
  const toneClass =
    card.tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : card.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : card.tone === 'primary'
          ? 'border-primary-200 bg-primary-50 text-primary-900'
          : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <div className={`rounded-2xl border p-4 ${toneClass} ${card.current ? 'ring-2 ring-offset-0 ring-current/20' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{card.title}</div>
        {card.current && <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium">当前阶段</span>}
      </div>
      <p className="mt-3 text-sm leading-6 opacity-90">{card.summary}</p>
      <div className="mt-4 text-sm font-semibold">{card.cta}</div>
    </div>
  )
}

function TaskWorkspaceStageSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{eyebrow}</div>
        <div className="mt-1 text-base font-semibold text-slate-900">{title}</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  )
}

function TaskQueueGuideCard({ guide }: { guide: TaskQueueGuideDescriptor }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm text-primary-900">
      <div className="text-xs font-medium uppercase tracking-wide text-primary-700">当前队列修行建议</div>
      <div className="mt-1 text-lg font-semibold">{guide.title}</div>
      <div className="mt-2 text-primary-800">{guide.summary}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        {guide.actions.map((action) => (
          <Link
            key={`${action.label}-${action.href}`}
            to={action.href}
            className={action.tone === 'primary'
              ? 'rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700'
              : 'rounded-lg border border-primary-200 bg-white px-4 py-2 text-primary-800 hover:bg-primary-100'}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function DiagnosticsCard({ diagnosticsQuery }: { diagnosticsQuery: ReturnType<typeof useQuery<TaskConsistencyReport>> }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">一致性诊断</h2>
          <p className="mt-1 text-sm text-gray-500">对应 `/tasks/diagnostics/consistency`，用于确认任务生命周期数据是否干净。</p>
          {diagnosticsQuery.isFetching && !diagnosticsQuery.isLoading && <div className="mt-1 text-xs text-gray-400">diagnostics 刷新中...</div>}
        </div>
        <button type="button" onClick={() => diagnosticsQuery.refetch()} className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200">
          刷新
        </button>
      </div>

      {diagnosticsQuery.isLoading && <div className="mt-4 text-sm text-gray-500">正在加载 diagnostics...</div>}
      {diagnosticsQuery.isError && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">diagnostics 加载失败，请检查 marketplace 服务。</div>}
      {diagnosticsQuery.data && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-xl border p-4 ${diagnosticsQuery.data.summary.total_issues === 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <div className="flex items-center gap-2 font-medium">
              {diagnosticsQuery.data.summary.total_issues === 0 ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>
                {diagnosticsQuery.data.summary.total_issues === 0
                  ? '当前任务一致性正常，total_issues = 0'
                  : `发现 ${diagnosticsQuery.data.summary.total_issues} 个一致性问题`}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard icon={<AlertTriangle className="h-4 w-4" />} label="open 异常" value={String(diagnosticsQuery.data.summary.open_with_lifecycle_fields)} />
            <InfoCard icon={<AlertTriangle className="h-4 w-4" />} label="in_progress 异常" value={String(diagnosticsQuery.data.summary.in_progress_missing_assignment)} />
            <InfoCard icon={<AlertTriangle className="h-4 w-4" />} label="completed 异常" value={String(diagnosticsQuery.data.summary.completed_missing_completed_at)} />
            <InfoCard icon={<AlertTriangle className="h-4 w-4" />} label="cancelled 异常" value={String(diagnosticsQuery.data.summary.cancelled_missing_cancelled_at)} />
          </div>

          {diagnosticsQuery.data.examples.length > 0 && (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <div className="mb-2 font-medium">示例问题</div>
              <div className="space-y-2">
                {diagnosticsQuery.data.examples.map((example) => (
                  <div key={example.task_id} className="rounded-lg bg-white p-3">
                    <div className="font-medium">{example.task_id}</div>
                    <div className="text-xs text-gray-500">状态：{example.status}</div>
                    <div className="mt-1 text-gray-600">{example.issue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskStateGuide({ task }: { task: MarketplaceTask }) {
  const guide = {
    open: '当前悬赏处于 open：行脚人可以接榜，发榜人可以从接榜玉简里点将执行者。',
    assigned: '当前悬赏处于 assigned：悬赏已完成点将，通常表示托管已建立，下一步等待行脚人开始历练。',
    in_progress: '当前悬赏处于 in_progress：只有被点将的行脚人可以交卷候验，发榜人可以撤榜。',
    submitted: '当前悬赏处于 submitted：行脚人已提交交卷，发榜人可以验卷放款或打回重修。',
    completed: '当前悬赏处于 completed：悬赏已完成，托管应已释放，不再允许 assign / complete / cancel。',
    cancelled: '当前悬赏处于 cancelled：悬赏已撤下，不再允许 apply / assign / complete / cancel。',
  }[task.status] || '当前悬赏状态未知，请结合服务端状态判断可执行操作。'

  return (
    <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
      <div className="font-medium">悬赏状态机说明</div>
      <div className="mt-1">{guide}</div>
    </div>
  )
}

function TaskSettlementLinks({ task }: { task: MarketplaceTask }) {
  const shouldShow = task.status === 'submitted' || task.status === 'completed' || task.status === 'cancelled' || Boolean(task.escrow_id)
  if (!shouldShow) return null

  const summary = task.status === 'submitted'
    ? '当前悬赏已进入待验卷阶段，建议同时盯住账房飞剑与洞府资金解释，避免放款后信息不同步。'
    : task.status === 'completed'
      ? '当前悬赏已完成，建议立即核对账房飞剑、余额变化和洞府里的 credit 解释。'
      : task.status === 'cancelled'
        ? '当前悬赏已撤下，如有托管，建议核对退款通知和冻结余额是否已回落。'
        : '当前悬赏已经涉及托管或结算，建议同步核对账房和洞府。'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <div className="font-medium text-slate-900">结算 / 结果核对</div>
      <div className="mt-2">{summary}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to="/wallet?focus=notifications&source=marketplace-task" className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">
          去账房飞剑中心
        </Link>
        <Link to="/profile?focus=credit-verification&source=marketplace" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50">
          去洞府核对资金
        </Link>
      </div>
    </div>
  )
}

function TaskOutcomeCard({ outcome }: { outcome: RecentTaskOutcome }) {
  const isAccepted = outcome.status === 'completed'
  const growthAssets = outcome.growthAssets
  const actions = buildTaskOutcomeActions(outcome)

  return (
    <div className={`rounded-xl border p-4 ${isAccepted ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{isAccepted ? '本次悬赏沉淀结果' : '验卷后预期沉淀'}</div>
      <div className="mt-1 text-base font-semibold">{getTaskOutcomeTitle(outcome)}</div>
      <div className="mt-2 text-sm opacity-90">{getTaskOutcomeDescription(outcome)}</div>
      {growthAssets && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OutcomeMetric label="法卷草稿" value={growthAssets.skill_draft_id || '未生成'} />
          <OutcomeMetric label="发榜模板" value={growthAssets.employer_template_id || '未生成'} />
          <OutcomeMetric label="获赠记录" value={growthAssets.employer_skill_grant_id || '未生成'} />
          <OutcomeMetric label="已发布法卷" value={growthAssets.published_skill_id || '未发布'} />
        </div>
      )}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {actions.map((action) => (
            <Link
              key={`${action.label}-${action.href}`}
              to={action.href}
              className={action.tone === 'primary'
                ? 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100'
                : 'rounded-lg border border-white/70 bg-transparent px-4 py-2 text-sm font-medium hover:bg-white/40'}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 text-sm opacity-90">{outcome.message}</div>
    </div>
  )
}

function OutcomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-4 py-3 text-sm text-gray-700">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 font-medium break-all">{value}</div>
    </div>
  )
}

function getTaskOutcomeTitle(outcome: RecentTaskOutcome) {
  if (outcome.status === 'submitted') return '悬赏已交卷候验，等待成长资产在验卷后落地'
  if (outcome.growthAssets?.employer_skill_grant_id) return '验卷完成，法卷已自动发布并赠送给发榜人'
  if (outcome.growthAssets?.published_skill_id) return '验卷完成，成功经验已自动沉淀为法卷'
  if (outcome.growthAssets?.skill_draft_id || outcome.growthAssets?.employer_template_id) return '验卷完成，成长资产已成功沉淀'
  return '验卷完成，托管已释放'
}

function getTaskOutcomeDescription(outcome: RecentTaskOutcome) {
  if (outcome.status === 'submitted') {
    return '当前托管仍处于待验卷阶段。发榜人确认后，平台会尝试生成法卷草稿、发榜模板，以及首单赠送法卷。'
  }

  if (outcome.growthAssets?.employer_skill_grant_id) {
    return '这次真实悬赏已经完成从交卷 → 自动沉淀 → 发榜人可复购的闭环。建议立即查看赠送法卷和模板复用入口。'
  }

  if (outcome.growthAssets?.published_skill_id) {
    return '这次真实悬赏的成功经验已经沉淀成公开法卷，可以直接回到万象楼查看定价、曝光和后续成交。'
  }

  if (outcome.growthAssets?.skill_draft_id || outcome.growthAssets?.employer_template_id) {
    return '这次悬赏已经沉淀出可复用资产，建议继续回洞府查看模板、草稿和后续复用路径。'
  }

  return '本次悬赏已完成并释放托管，但当前没有返回新的成长资产。建议优先核对账房飞剑和洞府。'
}

function buildTaskOutcomeActions(outcome: RecentTaskOutcome): TaskOutcomeAction[] {
  const growthAssets = outcome.growthAssets
  const actions: TaskOutcomeAction[] = []

  if (outcome.status === 'submitted') {
    actions.push({ label: '去账房盯飞剑', href: '/wallet?focus=notifications&source=marketplace-submitted', tone: 'primary' })
    actions.push({ label: '去洞府看成长档案', href: '/profile?source=marketplace-submitted', tone: 'secondary' })
    return actions
  }

  if (growthAssets?.employer_skill_grant_id && growthAssets.published_skill_id) {
    actions.push({
      label: '去查看获赠法卷',
      href: buildGiftedSkillMarketplaceHref(growthAssets.employer_skill_grant_id, growthAssets.published_skill_id),
      tone: 'primary',
    })
  } else if (growthAssets?.published_skill_id) {
    actions.push({
      label: '去查看新发布法卷',
      href: buildSkillMarketplaceHref(growthAssets.published_skill_id, 'task-acceptance'),
      tone: 'primary',
    })
  }

  if (growthAssets?.employer_template_id || growthAssets?.skill_draft_id) {
    actions.push({
      label: growthAssets?.employer_template_id ? '去洞府复用模板' : '去洞府查看草稿',
      href: '/profile?source=marketplace-growth',
      tone: actions.length === 0 ? 'primary' : 'secondary',
    })
  }

  actions.push({
    label: '去账房飞剑中心',
    href: '/wallet?focus=notifications&source=marketplace-acceptance',
    tone: actions.length === 0 ? 'primary' : 'secondary',
  })

  return actions.slice(0, 3)
}

function buildSkillMarketplaceHref(skillId: string, source = 'marketplace') {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    skill_id: skillId,
    source,
  }).toString()}`
}

function buildGiftedSkillMarketplaceHref(grantId: string, skillId: string) {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    source: 'gifted-grant',
    grant_id: grantId,
    skill_id: skillId,
  }).toString()}`
}

function DisabledHint({ children }: { children: ReactNode }) {
  return <div className="text-xs text-gray-500">{children}</div>
}

function RoleButton({ active, onClick, label, aid }: { active: boolean; onClick: () => void; label: string; aid?: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-left ${active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
      <div className="font-medium">{label}</div>
      <div className={`max-w-[180px] truncate text-xs ${active ? 'text-primary-100' : 'text-gray-500'}`}>{aid || '未就绪'}</div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    assigned: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-amber-100 text-amber-700',
    submitted: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>{status}</span>
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">{icon}{label}</div>
      <div className="break-all text-sm text-gray-600">{value}</div>
    </div>
  )
}

function PageStateCard({
  message,
  tone = 'neutral',
  compact = false,
  actions = [],
}: {
  message: string
  tone?: 'neutral' | 'error'
  compact?: boolean
  actions?: Array<{ label: string; to: string; tone?: 'primary' | 'secondary' }>
}) {
  return (
    <div className={`rounded-2xl ${compact ? 'p-4' : 'p-6'} ${tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'} shadow-sm`}>
      <div>{message}</div>
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {actions.map((action) => (
            <Link
              key={`${action.label}-${action.to}`}
              to={action.to}
              className={action.tone === 'primary'
                ? 'rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700'
                : 'rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50'}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
