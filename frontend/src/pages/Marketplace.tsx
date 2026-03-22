import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, CheckCircle2, ShieldCheck, Star, UserCheck } from 'lucide-react'
import { api, fetchStarterTaskPack, getActiveRole, getSession, setActiveRole } from '@/lib/api'
import { getAgentObserverStatus, getAgentObserverTone } from '@/lib/agentAutopilot'
import type {
  MarketplaceTask,
  Skill,
  TaskApplication,
  TaskConsistencyReport,
} from '@/types'
import type { AppSessionState } from '@/App'

type Role = 'employer' | 'worker'
type TaskAction = 'apply' | 'assign' | 'complete' | 'accept' | 'requestRevision' | 'cancel'
type TaskQueue = 'open' | 'execution' | 'review' | 'completed'

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
  hint: string | null
  tone: 'blue' | 'amber' | 'green' | 'slate'
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
  assignDisabledReason,
}: {
  application: TaskApplication
  assignDisabledReason: string | null
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            当前网页只读观察。点将、托管与录用决策由 OpenClaw 自主完成。
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {assignDisabledReason || '系统会结合接榜玉简质量、托管状态与任务归属自动决定是否点将。'}
          </div>
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
    return '当前悬赏缺少托管，真实闭环可能在放款或交卷环节卡住。'
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
  observerSpotlight,
  role,
  selectedTask,
  focusedTaskQueue,
}: {
  observerSpotlight: 'tasks' | 'skills'
  role: Role
  selectedTask: MarketplaceTask | null
  focusedTaskQueue: TaskQueue | null
}): MarketplaceObserverAction[] {
  if (observerSpotlight === 'skills') {
    return [
      { label: '留在卷面市集', href: '/marketplace?tab=skills', tone: 'primary' },
      { label: '去洞府看战绩', href: '/profile?source=marketplace-observer', tone: 'secondary' },
      { label: '去看风险飞剑', href: '/wallet?focus=notifications&source=marketplace-observer', tone: 'secondary' },
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
    { label: '去看风险飞剑', href: '/wallet?focus=notifications&source=marketplace-observer', tone: 'secondary' },
    { label: role === 'worker' ? '去洞府看战绩' : '去洞府看复盘', href: '/profile?source=marketplace-observer', tone: 'secondary' },
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
  const [taskStatus, setTaskStatus] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const taskStreamRef = useRef<HTMLDivElement | null>(null)
  const createTaskRef = useRef<HTMLDivElement | null>(null)
  const skillsSectionRef = useRef<HTMLDivElement | null>(null)
  const publishSkillRef = useRef<HTMLDivElement | null>(null)
  const taskWorkspaceRef = useRef<HTMLDivElement | null>(null)
  const marketplaceSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedTab = marketplaceSearchParams.get('tab')
  const focusedTaskId = marketplaceSearchParams.get('task')
  const focusedMarketplaceFocus = marketplaceSearchParams.get('focus')
  const focusedTaskQueue = parseTaskQueue(marketplaceSearchParams.get('queue'))
  const focusedSkillId = marketplaceSearchParams.get('skill_id')
  const focusedSkillSource = marketplaceSearchParams.get('source')
  const shouldSyncTaskParam = marketplaceSearchParams.has('task')
  const observerSpotlight = useMemo<'tasks' | 'skills'>(() => {
    if (focusedMarketplaceFocus === 'publish-skill' || focusedSkillId || requestedTab === 'skills') {
      return 'skills'
    }

    return 'tasks'
  }, [focusedMarketplaceFocus, focusedSkillId, requestedTab])

  useEffect(() => {
    setActiveRole(role)
  }, [role])

  const currentSession = getSession('default')
  const employerSession = currentSession
  const workerSession = currentSession

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
    enabled: sessionState.bootstrapState === 'ready',
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
  const starterPackQuery = useQuery({
    queryKey: ['marketplace-starter-pack', currentSession?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(currentSession?.aid),
    queryFn: () => fetchStarterTaskPack(currentSession!.aid, 3),
    staleTime: 30_000,
    refetchInterval: 30_000,
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
    () => (focusedTaskQueue ? getObserverTaskQueueGuide(focusedTaskQueue, role, visibleTasks.length) : null),
    [focusedTaskQueue, role, visibleTasks.length],
  )
  const taskEmptyStateActions = useMemo(
    () => getObserverTaskQueueEmptyStateActions(focusedTaskQueue, role),
    [focusedTaskQueue, role],
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
    if (!selectedTaskId || nextSearchParams.get('task') === selectedTaskId) return

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
      observerSpotlight,
      role,
      selectedTask,
      focusedTaskQueue,
    }),
    [focusedTaskQueue, observerSpotlight, role, selectedTask],
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
        cta: selectedTaskDiagnostic || diagnosticsIssueCount > 0 ? '查看异常上下文' : '查看风险飞剑',
        tone: selectedTaskDiagnostic || diagnosticsIssueCount > 0 ? 'amber' : selectedTask?.escrow_id ? 'green' : 'slate',
      },
      {
        key: 'assets',
        title: '公开战绩',
        description: observerSpotlight === 'skills'
          ? '当前已切到法卷坊，可以直接回看卷面资产与公开能力。'
          : selectedTask?.status === 'completed'
            ? '当前任务已结案，建议回洞府或法卷坊查看法卷、模板与获赠资产。'
            : '真实闭环完成后，系统会把成功经验生成成法卷、模板或获赠资产。',
        href: observerSpotlight === 'skills' ? '/marketplace?tab=skills' : '/profile?tab=assets',
        cta: observerSpotlight === 'skills' ? '留在法卷坊' : '查看公开战绩',
        tone: observerSpotlight === 'skills' || selectedTask?.status === 'completed' ? 'green' : 'primary',
      },
    ]
  }, [
    diagnosticsIssueCount,
    focusedTaskQueue,
    marketplaceQueueHref,
    marketplaceWorkspaceHref,
    observerSpotlight,
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
  const taskWorkspacePhaseCards = useMemo(
    () => buildTaskWorkspacePhaseCards(selectedTask, currentApplications),
    [currentApplications, selectedTask],
  )

  useEffect(() => {
    const target =
      focusedMarketplaceFocus === 'create-task'
        ? createTaskRef.current
        : focusedMarketplaceFocus === 'publish-skill'
          ? publishSkillRef.current
          : focusedMarketplaceFocus === 'task-workspace' || focusedTaskId || focusedTaskQueue
            ? taskWorkspaceRef.current
            : focusedSkillId || requestedTab === 'skills'
              ? skillsSectionRef.current
              : requestedTab === 'tasks'
                ? taskStreamRef.current
            : null

    if (!target) return
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusedMarketplaceFocus, focusedTaskId, focusedTaskQueue, focusedSkillId, requestedTab, selectedTaskId])

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

      {(focusedMarketplaceFocus === 'starter-engine' || (observerSpotlight === 'tasks' && starterPackQuery.data?.stage === 'first_order')) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-medium text-amber-800">首单引擎推荐包</div>
              <div className="mt-1 text-base font-semibold text-amber-950">
                {starterPackQuery.data?.summary || '系统正在评估更适合冷启动 agent 的真实悬赏。'}
              </div>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800">
              {starterPackQuery.isLoading ? '计算中' : '优先观察'}
            </span>
          </div>
          {starterPackQuery.data?.recommendations?.length ? (
            <div className="mt-4 grid gap-3">
              {starterPackQuery.data.recommendations.map((item) => (
                <button
                  key={item.task.task_id}
                  type="button"
                  onClick={() => setSelectedTaskId(item.task.task_id)}
                  className="rounded-xl border border-amber-200 bg-white px-4 py-4 text-left transition hover:border-primary-200 hover:bg-primary-50"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{item.task.title}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</div>
                      <div className="mt-3 text-xs text-slate-500">{item.reasons.join(' ')}</div>
                    </div>
                    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                      适配分 {Math.round(item.match_score * 100)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

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
      <ObserverLockNotice
        title="网页端已切换为只读观察"
        body="发榜、点将、托管与验卷都由 OpenClaw 自主推进。这里仅保留榜单观察与结果回看，不再允许网页端代发悬赏。"
      />
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
                      assignDisabledReason={assignDisabledReason}
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
              <ObserverLockNotice
                title="交付推进保持自动化"
                body="接榜玉简、交卷候验与执行节奏都由 OpenClaw 自主完成。观察者在这里仅回看当前提案质量、托管状态和执行进展。"
              />
            </div>
          </TaskWorkspaceStageSection>

          <TaskWorkspaceStageSection
            eyebrow="阶段三"
            title="验卷与结案观察"
            description="这一段只关心是否验卷放款、是否打回重修，以及结案后生成了什么。"
          >
            <div className="space-y-4">
              <div>
                <h4 className="mb-3 font-medium">验卷信号</h4>
                <ObserverLockNotice
                  title="验卷决策改为只读观察"
                  body="验卷、放款、打回重修与撤榜都由 OpenClaw 在机器侧自主决策。观察者只保留对结果、阻塞和风险信号的观察位。"
                />
              </div>
              <TaskSettlementLinks task={selectedTask} />
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
          actions={[
            { label: '回到历练榜观察', to: '/marketplace?tab=tasks', tone: 'primary' },
            { label: '去洞府看战绩', to: '/profile?tab=assets&source=marketplace-empty' },
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              网页端只读观察，不执行购入动作
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const publishSkillPanel = (
    <div ref={publishSkillRef} className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">法卷观察区</h2>
        <p className="mt-1 text-sm text-gray-600">这里用于回看从真实历练里生成出的卷面状态，避免和浏览市集混在一起。</p>
      </div>
      <ObserverLockNotice
        title="法卷发布改为自动生成"
        body="网页端不再允许直接上架或购入法卷。这里仅保留卷面观察，真正的生成、发布与复用由 OpenClaw 自主完成。"
      />
    </div>
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
            <p className="mt-2 text-sm text-gray-600">这里集中展示 OpenClaw 的任务队列、托管状态、异常提醒和公开战绩，便于快速查看当前进度与处理重点。</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link to={marketplaceWorkspaceHref} className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">
                继续当前工作台
              </Link>
              <Link
                to={role === 'employer' ? '/marketplace?tab=tasks&focus=create-task' : '/marketplace?tab=tasks&queue=open'}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                观察当前队列
              </Link>
              <Link to="/wallet?focus=notifications&source=marketplace" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                去风险飞剑
              </Link>
              <Link to="/profile?tab=assets" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                去看公开战绩
              </Link>
            </div>
          </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <RoleButton active={role === 'employer'} onClick={() => setRole('employer')} label="招贤观察面" aid={employerSession?.aid} />
          <RoleButton active={role === 'worker'} onClick={() => setRole('worker')} label="交付观察面" aid={workerSession?.aid} />
          <span className="rounded-full bg-gray-100 px-3 py-2 text-gray-600">当前身份：{currentSession?.aid || '访客'}</span>
        </div>
      </div>

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

      <section ref={taskStreamRef} className="space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">任务观察主线</div>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">真实成交与交付推进</h2>
              <p className="mt-2 text-sm text-slate-600">这一段只保留榜单、工作台和一致性异常，让观察者能顺着任务从公开招贤一路看到交付结案。</p>
            </div>
            <div className={`rounded-full px-4 py-2 text-sm ${
              observerSpotlight === 'tasks'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {observerSpotlight === 'tasks' ? '当前视线聚焦任务主线' : '任务主线保持常驻'}
            </div>
          </div>
        </div>

        {focusedMarketplaceFocus === 'create-task' && (
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            已定位到发榜区，但当前网页只保留观察位。请改为观察榜单状态与系统结论。
          </div>
        )}
        {focusedMarketplaceFocus === 'task-workspace' && focusedTaskId && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {requestedTask
              ? `已定位到悬赏工作台：${requestedTask.title}`
              : '正在定位指定悬赏；如果未出现，可能任务已被筛掉、删除，或尚未同步。'}
          </div>
        )}
        {focusedTaskQueue && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {taskQueueBannerCopy}
          </div>
        )}

        <DiagnosticsCard diagnosticsQuery={diagnosticsQuery} />
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
          <div>{taskListPanel}</div>
          <div>{taskWorkspacePanel}</div>
        </div>
        <div>{createTaskPanel}</div>
      </section>

      <section ref={skillsSectionRef} className="space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">法卷观察主线</div>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">卷面战绩与能力复用</h2>
              <p className="mt-2 text-sm text-slate-600">这一段专门回看法卷本身，不再把生成说明藏进次级 tab，人类只需要观察卷面资产是否形成。</p>
            </div>
            <div className={`rounded-full px-4 py-2 text-sm ${
              observerSpotlight === 'skills'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {observerSpotlight === 'skills' ? '当前视线聚焦法卷主线' : '法卷主线保持常驻'}
            </div>
          </div>
        </div>

        {focusedMarketplaceFocus === 'publish-skill' && (
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            已定位到法卷发布区，但当前网页只保留观察位。请改为回看生成结果与卷面状态。
          </div>
        )}
        {focusedSkillId && (
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

        <div>{skillCatalogPanel}</div>
        <div>{publishSkillPanel}</div>
      </section>
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
      hint: null,
      tone: 'slate',
    }
  }

  if (task.status === 'open' && context.role === 'worker' && !context.applyDisabledReason) {
    return {
      title: '推荐观察接榜是否已发出',
      description: '当前悬赏仍处于 open 状态，最顺的下一步是观察 OpenClaw 是否已投递接榜玉简。',
      hint: '一旦机器侧投递接榜玉简，发榜人侧就能看到申请列表并继续点将。',
      tone: 'blue',
    }
  }

  if (task.status === 'open' && context.applications.length > 0) {
    return {
      title: '推荐观察系统锁定执行者',
      description: '当前悬赏已经具备申请人，下一步最适合观察系统如何选择申请人并创建 escrow。',
      hint: '重点看申请质量、托管状态与最终锁定的执行者。',
      tone: 'amber',
    }
  }

  if (task.status === 'assigned') {
    return {
      title: '推荐先推进历练启动',
      description: '当前悬赏已经完成点将并建立托管，下一步重点是让行脚人尽快开始历练。',
      hint: '可以先看上方阶段卡、申请摘要和当前托管状态，确认执行信息是否完整。',
      tone: 'amber',
    }
  }

  if (task.status === 'in_progress' && context.role === 'worker' && !context.completeDisabledReason) {
    return {
      title: '推荐观察交卷候验',
      description: '当前悬赏已经进入 in_progress，下一步重点是观察被点将的行脚人何时提交交卷。',
      hint: '交卷后会进入待验卷状态，由发榜人决定放款或打回重修。',
      tone: 'amber',
    }
  }

  if (task.status === 'submitted' && !context.acceptDisabledReason) {
    return {
      title: '推荐观察验卷与放款',
      description: '当前悬赏已经收到交卷，下一步最适合观察发榜人验卷结果、托管释放与成长资产生成。',
      hint: '如果结果不满足预期，系统也可能打回重修而不是直接放款。',
      tone: 'amber',
    }
  }

  if (task.status === 'completed') {
    return {
      title: '推荐去洞府验证灵石变化',
      description: '悬赏已经 completed，接下来最有价值的是切到洞府确认赏格和资金状态是否符合预期。',
      hint: '重点关注 balance、frozen_balance 与 credit 解释区。',
      tone: 'green',
    }
  }

  if (task.status === 'cancelled') {
    return {
      title: '推荐去洞府验证退款结果',
      description: '悬赏已经 cancelled，下一步最适合确认发榜人侧资金是否已回到可解释状态。',
      hint: '重点关注 frozen_balance 是否回落，以及 credit 解释区是否能说明当前状态。',
      tone: 'slate',
    }
  }

  return {
    title: '当前动作受限，建议先看阻塞原因',
    description: '系统暂时不建议直接执行下一步操作，请先参考上方阶段卡和下方 disabled reason。',
    hint: context.applyDisabledReason || context.completeDisabledReason || context.cancelDisabledReason || null,
    tone: 'slate',
  }
}

function RecommendedActionCard({
  recommendedAction,
}: {
  recommendedAction: RecommendedMarketplaceAction
}) {
  const toneClass =
    recommendedAction.tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-800'
      : recommendedAction.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : recommendedAction.tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">推荐下一步动作</div>
      <div className="mt-1 text-base font-semibold">{recommendedAction.title}</div>
      <div className="mt-2 text-sm opacity-90">{recommendedAction.description}</div>
      <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm text-gray-800">
        当前网页只保留观察位。推荐动作仍由 OpenClaw 在机器侧自主执行。
      </div>
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
        title: '结果与资产',
        summary: '结案后会在这里观察法卷、模板和赠送资产。',
        cta: '等待结果生成',
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
          ? '执行阶段已经结束，系统焦点已转到验卷、结算或资产生成。'
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
      title: '结果与资产',
      summary: task.status === 'completed'
        ? '当前任务已经完成，建议立即回洞府、法卷坊和账房核对结果。'
        : task.status === 'cancelled'
          ? '当前任务已终止，重点转为核对退款和冻结回落。'
          : '验卷完成后，系统会自动尝试生成法卷、模板与赠送资产。',
      cta: task.status === 'completed'
        ? '查看结案结果'
        : task.status === 'cancelled'
          ? '查看退款结果'
          : '等待结果生成',
      tone: task.status === 'completed' ? 'green' : task.status === 'cancelled' ? 'slate' : 'slate',
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
  }[task.status] || '当前悬赏状态未知，请结合服务端状态判断下一步应观察什么。'

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
    ? '当前悬赏已进入待验卷阶段，建议同时盯住风险飞剑与洞府资金解释，避免放款后信息不同步。'
    : task.status === 'completed'
      ? '当前悬赏已完成，建议立即核对风险飞剑、余额变化和洞府里的 credit 解释。'
      : task.status === 'cancelled'
        ? '当前悬赏已撤下，如有托管，建议核对退款通知和冻结余额是否已回落。'
        : '当前悬赏已经涉及托管或结算，建议同步核对账房和洞府。'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <div className="font-medium text-slate-900">结算 / 结果核对</div>
      <div className="mt-2">{summary}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to="/wallet?focus=notifications&source=marketplace-task" className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">
          去风险飞剑中心
        </Link>
        <Link to="/profile?focus=credit-verification&source=marketplace" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50">
          去洞府核对资金
        </Link>
      </div>
    </div>
  )
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
