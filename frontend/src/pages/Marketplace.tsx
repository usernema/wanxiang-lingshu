import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, CheckCircle2, ShieldCheck, Star, UserCheck } from 'lucide-react'
import { api, getActiveRole, getSession, setActiveRole, switchRole } from '@/lib/api'
import type {
  MarketplaceTask,
  MarketplaceTaskCompleteResponse,
  Skill,
  TaskApplication,
  TaskConsistencyReport,
} from '@/types'
import type { AppSessionState } from '@/App'

type Role = 'employer' | 'worker'
type TaskAction = 'apply' | 'assign' | 'complete' | 'cancel'

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
  ctaKind: 'apply' | 'complete' | 'profile' | null
  hint: string | null
  tone: 'blue' | 'amber' | 'green' | 'slate'
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
      proposal: '未填写 proposal',
      proposalStrength: 'light',
      summary: '没有补充执行方案，建议雇主先确认交付方式与时间预期。',
    }
  }
  if (proposal.length >= 120) {
    return {
      proposal,
      proposalStrength: 'strong',
      summary: 'proposal 信息较完整，通常已覆盖做法、边界或交付承诺。',
    }
  }
  if (proposal.length >= 40) {
    return {
      proposal,
      proposalStrength: 'medium',
      summary: 'proposal 已表达基本意向，但还可以补充执行细节。',
    }
  }
  return {
    proposal,
    proposalStrength: 'light',
    summary: 'proposal 偏简短，分配前最好再确认执行计划。',
  }
}

function getProposalStrengthTone(strength: ApplicantInsight['proposalStrength']) {
  if (strength === 'strong') return 'bg-green-100 text-green-800'
  if (strength === 'medium') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function getProposalStrengthLabel(strength: ApplicantInsight['proposalStrength']) {
  if (strength === 'strong') return 'proposal 完整'
  if (strength === 'medium') return 'proposal 一般'
  return 'proposal 简短'
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
  if (!proposal?.trim()) return '未填写 proposal'
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
  if (task.status === 'open' && applications.length === 0) return '已发布，等待申请人投递 proposal。'
  if (task.status === 'open' && applications.length > 0) return `已收到 ${applications.length} 个申请，待 employer 决策。`
  if (task.status === 'in_progress') return `已分配给 ${task.worker_aid || '指定 worker'}，escrow ${task.escrow_id ? '已创建' : '待核对'}。`
  if (task.status === 'completed') return '任务已完成，建议转去 Profile / Wallet 核对结算。'
  if (task.status === 'cancelled') return '任务已取消，如存在托管应已退款。'
  return '任务状态待确认。'
}

function getTaskOwnershipLabel(task: MarketplaceTask, employerSession: ReturnType<typeof getSession>, workerSession: ReturnType<typeof getSession>) {
  if (employerSession && task.employer_aid === employerSession.aid) return '你是该任务的 employer'
  if (workerSession && task.worker_aid === workerSession.aid) return '你是该任务的 assigned worker'
  if (workerSession && task.employer_aid !== workerSession.aid && task.status === 'open') return '你可以作为 worker 申请该任务'
  return '你当前在观察这个任务'
}

function getWorkerTaskActionSummary(task: MarketplaceTask, applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return '当前没有 worker 身份可用。'
  const hasApplied = applications.some((application) => application.applicant_aid === workerSession.aid)
  if (task.status === 'open' && !hasApplied) return '你可以提交 proposal 争取被雇佣。'
  if (task.status === 'open' && hasApplied) return '你已提交 proposal，等待 employer 做分配决策。'
  if (task.status === 'in_progress' && task.worker_aid === workerSession.aid) return '你已被雇佣，可以开始交付并完成任务。'
  if (task.status === 'completed' && task.worker_aid === workerSession.aid) return '你已完成此任务，建议去 Wallet 查看收入流水。'
  return '当前这个任务没有分配给你。'
}

function getEmployerTaskActionSummary(task: MarketplaceTask, applications: TaskApplication[], employerSession: ReturnType<typeof getSession>) {
  if (!employerSession || task.employer_aid !== employerSession.aid) return '当前不是你的任务，无法进行雇佣决策。'
  if (task.status === 'open' && applications.length === 0) return '任务已发布，下一步是等待或引导 worker 申请。'
  if (task.status === 'open' && applications.length > 0) return '任务已收到申请，下一步是选择 proposal 并 assign。'
  if (task.status === 'in_progress') return '任务已进入执行中，下一步重点是等待 worker 完成。'
  if (task.status === 'completed') return '任务已闭环完成，建议核对 escrow 和 balance 变化。'
  return '当前任务已取消。'
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
  if (!applications.length) return '暂无 proposal。'
  const strongCount = applications.filter((application) => getApplicantInsight(application).proposalStrength === 'strong').length
  if (strongCount === 0) return '当前 proposal 普遍偏短，建议雇主分配前先确认细节。'
  return `${strongCount} 份 proposal 信息较完整，可优先查看。`
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
  if (task.status === 'in_progress') return '待交付'
  if (task.status === 'completed') return '已完成'
  return '已取消'
}

function getTaskDecisionStateTone(state: string) {
  if (state === '待申请') return 'bg-blue-100 text-blue-800'
  if (state === '待分配' || state === '待交付') return 'bg-amber-100 text-amber-800'
  if (state === '已完成') return 'bg-green-100 text-green-800'
  return 'bg-slate-100 text-slate-700'
}

function getTaskQuickFacts(task: MarketplaceTask, applications: TaskApplication[]) {
  return [
    { label: 'Decision state', value: getTaskDecisionState(task, applications), tone: getTaskDecisionStateTone(getTaskDecisionState(task, applications)) },
    { label: 'Applicants', value: getApplicantCountLabel(applications.length), tone: 'bg-slate-100 text-slate-700' },
    { label: 'Selected worker', value: task.worker_aid || '尚未选择执行者', tone: 'bg-slate-100 text-slate-700' },
    { label: 'Escrow', value: task.escrow_id ? 'escrow 已建立' : 'escrow 尚未建立', tone: 'bg-slate-100 text-slate-700' },
  ]
}

function getAssignedApplication(task: MarketplaceTask, applications: TaskApplication[]) {
  if (!task.worker_aid) return null
  return applications.find((application) => application.applicant_aid === task.worker_aid) || null
}

function getTaskProposalPlaceholder(task: MarketplaceTask) {
  if (task.status === 'open') return '说明你的执行方案、交付物、预计节奏，帮助 employer 做分配决策'
  return '当前任务不在 open 阶段，此 proposal 仅用于回顾已提交申请内容'
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
}: {
  application: TaskApplication
  task: MarketplaceTask
  assignDisabledReason: string | null
  isAssignPending: boolean
  onAssign: () => void
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
          <button
            type="button"
            onClick={onAssign}
            className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:bg-gray-300"
            disabled={Boolean(assignDisabledReason) || isAssignPending}
          >
            {isAssignPending ? '分配中...' : task.status === 'open' ? '分配并创建 escrow' : '不可分配'}
          </button>
          {assignDisabledReason ? <div className="mt-2 text-xs text-gray-500">{assignDisabledReason}</div> : <div className="mt-2 text-xs text-gray-500">选择该申请人后会进入 assign + escrow 流程。</div>}
        </div>
      </div>
    </div>
  )
}

function TaskPipeline({ task, applications }: { task: MarketplaceTask; applications: TaskApplication[] }) {
  const steps = [
    { label: '发布任务', done: true },
    { label: '收到申请', done: applications.length > 0 || task.status !== 'open' },
    { label: '雇佣并托管', done: Boolean(task.worker_aid || task.escrow_id || task.status === 'completed') },
    { label: '完成结算', done: task.status === 'completed' },
  ]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-medium text-gray-900">Hiring pipeline</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
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
  return task.status === 'open' ? '正在加载 proposal 列表...' : '正在加载历史申请记录...'
}

function getApplicationsEmptyCopy(task: MarketplaceTask, applications: TaskApplication[]) {
  if (task.status === 'open') {
    return applications.length === 0 ? '当前还没有申请人，下一步应先引导 worker 提交 proposal。' : '已有申请。'
  }
  return '当前没有可显示的历史申请记录。'
}

function getTaskApplyHint(task: MarketplaceTask, applications: TaskApplication[], workerSession: ReturnType<typeof getSession>) {
  if (!workerSession) return '当前没有 worker session，无法提交 proposal。'
  if (task.status !== 'open') return '当前任务不再接受新的 proposal。'
  if (hasAppliedToTask(applications, workerSession)) return '你已经提交过 proposal，可等待 employer 决策。'
  return 'proposal 越具体，越有利于 employer 做出雇佣决策。'
}

function getAssignedApplicationCopy(task: MarketplaceTask, applications: TaskApplication[]) {
  const assigned = getAssignedApplication(task, applications)
  if (!assigned) {
    return {
      title: '尚未分配执行者',
      meta: '分配后这里会显示被雇佣 worker 的 proposal 摘要。',
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
  if (!workerSession) return '当前没有 worker 身份可用。'
  if (task.status === 'open' && hasAppliedToTask(applications, workerSession)) return '你已提交 proposal，等待 employer 选择申请人。'
  if (task.status === 'open') return '你可以作为 worker 申请该任务。'
  if (task.status === 'in_progress' && task.worker_aid === workerSession.aid) return '你已被雇佣，接下来可以完成任务。'
  if (task.status === 'completed' && task.worker_aid === workerSession.aid) return '你已完成该任务，可以去 Wallet 查看收入流水。'
  return '当前该任务没有分配给你。'
}

export default function Marketplace({ sessionState }: { sessionState: AppSessionState }) {
  const [role, setRole] = useState<Role>(() => (getActiveRole() === 'worker' ? 'worker' : 'employer'))
  const [marketTab, setMarketTab] = useState<'tasks' | 'skills'>('tasks')
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
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    setActiveRole(role)
  }, [role])

  const currentSession = getSession(role) || getSession('default')
  const employerSession = getSession('employer')
  const workerSession = getSession('worker')

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

  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.task_id === selectedTaskId) ?? null,
    [tasksQuery.data, selectedTaskId],
  )

  useEffect(() => {
    if (!tasksQuery.data?.length) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId) {
      setSelectedTaskId(tasksQuery.data[0].task_id)
      return
    }

    if (!tasksQuery.data.some((task) => task.task_id === selectedTaskId)) {
      setSelectedTaskId(tasksQuery.data[0].task_id)
    }
  }, [tasksQuery.data, selectedTaskId])

  const applicationsQuery = useQuery({
    queryKey: ['task-applications', selectedTaskId],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(selectedTaskId),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/tasks/${selectedTaskId}/applications`)
      return response.data as TaskApplication[]
    },
  })

  const canApplySelectedTask = Boolean(
    selectedTask && workerSession && selectedTask.status === 'open' && selectedTask.employer_aid !== workerSession.aid,
  )
  const canCompleteSelectedTask = Boolean(
    selectedTask && workerSession && selectedTask.status === 'in_progress' && selectedTask.worker_aid === workerSession.aid,
  )
  const canCancelSelectedTask = Boolean(
    selectedTask &&
      employerSession &&
      (selectedTask.status === 'open' || selectedTask.status === 'in_progress') &&
      selectedTask.employer_aid === employerSession.aid,
  )

  const applyDisabledReason = getTaskActionDisabledReason('apply', selectedTask, employerSession, workerSession)
  const completeDisabledReason = getTaskActionDisabledReason('complete', selectedTask, employerSession, workerSession)
  const cancelDisabledReason = getTaskActionDisabledReason('cancel', selectedTask, employerSession, workerSession)
  const selectedTaskDiagnostic = diagnosticsQuery.data?.examples.find((example) => example.task_id === selectedTask?.task_id) ?? null

  const stageGuide = getTaskStageGuide(selectedTask, {
    role,
    employerSession,
    workerSession,
    applyDisabledReason,
    completeDisabledReason,
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
    cancelDisabledReason,
  })

  const taskWorkspaceOverview = selectedTask
    ? getTaskWorkspaceOverview(selectedTask, currentApplications, employerSession, workerSession)
    : null
  const assignedApplicationCopy = selectedTask ? getAssignedApplicationCopy(selectedTask, currentApplications) : null
  const applicationsInsights = getApplicationsInsights(currentApplications)
  const workerStatusSummary = selectedTask ? getWorkerStatusSummary(selectedTask, currentApplications, workerSession) : null

  const refetchTaskWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['marketplace-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task-applications', selectedTaskId] }),
      queryClient.invalidateQueries({ queryKey: ['task-diagnostics-consistency'] }),
    ])
  }

  const publishSkill = useMutation({
    mutationFn: async () => {
      const session = await switchRole(role)
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
      setActionMessage('技能已发布。')
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
      const session = await switchRole(role)
      return api.post(`/v1/marketplace/skills/${skillId}/purchase`, { buyer_aid: session.aid })
    },
    onSuccess: () => {
      setActionMessage('技能购买请求已完成。')
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
      const session = await switchRole('employer')
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
      setActionMessage(`任务已创建：${created.title}`)
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
      const session = await switchRole('worker')
      return api.post(`/v1/marketplace/tasks/${taskId}/apply`, {
        applicant_aid: session.aid,
        proposal: applicationProposal || undefined,
      })
    },
    onSuccess: async () => {
      setApplicationProposal('')
      setActionMessage('已提交任务申请。')
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
      await switchRole('employer')
      return api.post(`/v1/marketplace/tasks/${taskId}/assign?worker_aid=${encodeURIComponent(workerAid)}`)
    },
    onSuccess: async () => {
      setActionMessage('任务已分配并创建托管。')
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
      const session = await switchRole('worker')
      const response = await api.post(`/v1/marketplace/tasks/${taskId}/complete`, {
        worker_aid: session.aid,
        result: 'done',
      })
      return response.data as MarketplaceTaskCompleteResponse
    },
    onSuccess: async (response) => {
      setActionMessage(response.message)
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'completeTask'))
      setActionMessage(null)
    },
  })

  const cancelTask = useMutation({
    mutationFn: async (taskId: string) => {
      await switchRole('employer')
      return api.post(`/v1/marketplace/tasks/${taskId}/cancel`)
    },
    onSuccess: async () => {
      setActionMessage('任务已取消。')
      setErrorMessage(null)
      await refetchTaskWorkspace()
    },
    onError: (error) => {
      setErrorMessage(mapMarketplaceError(error, 'cancelTask'))
      setActionMessage(null)
    },
  })

  const openProfileWithContext = () => {
    setActionMessage('建议下一步切换到个人中心查看 balance / frozen_balance 是否符合当前任务状态。')
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

  if (sessionState.bootstrapState === 'loading') {
    return <PageStateCard message="正在恢复 marketplace 所需 seeded session..." />
  }

  if (sessionState.bootstrapState === 'error') {
    return <PageStateCard message={sessionState.errorMessage || 'Marketplace session 恢复失败。'} tone="error" />
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">能力市场</h1>
            <p className="mt-2 text-sm text-gray-600">当前页面使用 seeded employer / worker 身份进行产品级本地联调。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <RoleButton active={role === 'employer'} onClick={() => setRole('employer')} label="Employer" aid={employerSession?.aid} />
            <RoleButton active={role === 'worker'} onClick={() => setRole('worker')} label="Worker" aid={workerSession?.aid} />
            <span className="rounded-full bg-gray-100 px-3 py-2 text-gray-600">当前身份：{currentSession?.aid || '访客'}</span>
          </div>
        </div>
        {actionMessage && <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{actionMessage}</div>}
        {errorMessage && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm ${marketTab === 'tasks' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 shadow-sm'}`}
          onClick={() => setMarketTab('tasks')}
        >
          任务市场
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm ${marketTab === 'skills' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 shadow-sm'}`}
          onClick={() => setMarketTab('skills')}
        >
          技能市场
        </button>
      </div>

      {marketTab === 'tasks' ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-4">
            <DiagnosticsCard diagnosticsQuery={diagnosticsQuery} />

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">任务列表</h2>
                  {tasksQuery.isFetching && !tasksQuery.isLoading && <div className="mt-1 text-xs text-gray-400">列表刷新中...</div>}
                </div>
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
                >
                  <option value="">全部状态</option>
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>

              <div className="space-y-3">
                {tasksQuery.isLoading && <PageStateCard message="加载任务中..." compact />}
                {tasksQuery.isError && <PageStateCard message="任务加载失败，请检查网关与 marketplace 服务。" tone="error" compact />}
                {!tasksQuery.isLoading && !tasksQuery.isError && tasksQuery.data?.length === 0 && <PageStateCard message="当前没有符合筛选条件的任务。" compact />}
                {tasksQuery.data?.map((task) => (
                  <button
                    type="button"
                    key={task.task_id}
                    onClick={() => setSelectedTaskId(task.task_id)}
                    className={`w-full rounded-2xl border p-5 text-left transition ${selectedTaskId === task.task_id ? 'border-primary-500 bg-primary-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{task.title}</h3>
                        <div className="mt-1 text-xs text-gray-500">任务 ID: {task.task_id}</div>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="mb-4 line-clamp-2 text-sm text-gray-600">{task.description}</p>
                    <div className="grid gap-2 text-sm text-gray-500 md:grid-cols-2">
                      <div>雇主：{task.employer_aid}</div>
                      <div>执行者：{task.worker_aid || '未分配'}</div>
                      <div>奖励：{task.reward} 积分</div>
                      <div>托管：{task.escrow_id || '未创建'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">发布任务</h2>
              <form onSubmit={submitTask} className="space-y-3">
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="任务标题" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
                <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="任务描述" rows={4} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
                <textarea value={taskRequirements} onChange={(e) => setTaskRequirements(e.target.value)} placeholder="任务要求（可选）" rows={3} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
                <input value={taskReward} onChange={(e) => setTaskReward(e.target.value)} placeholder="奖励积分" type="number" min="0" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
                <button className="w-full rounded-lg bg-gray-900 px-4 py-3 text-white hover:bg-black disabled:bg-gray-300" type="submit" disabled={createTask.isPending || !employerSession}>
                  {createTask.isPending ? '创建中...' : '以 Employer 身份发布任务'}
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">任务详情</h2>
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
                      <div className="mb-1 font-medium">要求</div>
                      <div className="text-gray-600">{selectedTask.requirements}</div>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoCard icon={<Briefcase className="h-4 w-4" />} label="雇主" value={selectedTask.employer_aid} />
                    <InfoCard icon={<UserCheck className="h-4 w-4" />} label="执行者" value={selectedTask.worker_aid || '未分配'} />
                    <InfoCard icon={<CheckCircle2 className="h-4 w-4" />} label="奖励" value={`${selectedTask.reward} 积分`} />
                    <InfoCard icon={<Star className="h-4 w-4" />} label="托管" value={selectedTask.escrow_id || '未创建'} />
                  </div>

                  <TaskPipeline task={selectedTask} applications={currentApplications} />
                  <TaskLifecycleStageCard stageGuide={stageGuide} />
                  <RecommendedActionCard
                    recommendedAction={recommendedAction}
                    onOpenProfile={openProfileWithContext}
                    onApply={() => selectedTask && applyTask.mutate(selectedTask.task_id)}
                    onComplete={() => selectedTask && completeTask.mutate(selectedTask.task_id)}
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

                  {taskWorkspaceOverview?.assignedApplication && !assignedApplicationCopy && (
                    <SectionHint title="已分配申请记录">
                      <div>{taskWorkspaceOverview.assignedApplication.applicant_aid}</div>
                    </SectionHint>
                  )}

                  {assignedApplicationCopy && (
                    <SectionHint title="当前被雇佣 / 已锁定 proposal">
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

                  {selectedTaskDiagnostic && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <div className="font-medium">当前选中任务在 diagnostics 中被标记为异常</div>
                      <div className="mt-1">{selectedTaskDiagnostic.issue}</div>
                    </div>
                  )}

                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">申请列表</h4>
                      {applicationsQuery.isFetching && <span className="text-xs text-gray-400">刷新中...</span>}
                    </div>
                    <RoleSummaryBanner message={applicationsInsights.coverage} />
                    <RoleSummaryBanner message={applicationsInsights.priority} />
                    {applicationsQuery.isLoading && <div className="text-gray-500">{getApplicationsLoadingCopy(selectedTask)}</div>}
                    {applicationsQuery.isError && <div className="rounded-xl bg-red-50 p-3 text-red-700">申请列表加载失败，请稍后重试。</div>}
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
                        />
                      )
                    })}
                  </div>

                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <h4 className="font-medium">Worker 操作</h4>
                    {workerStatusSummary && <RoleSummaryBanner message={workerStatusSummary} />}
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
                        {applyTask.isPending ? '申请中...' : '以 Worker 身份申请任务'}
                      </button>
                      {applyDisabledReason && <DisabledHint>{applyDisabledReason}</DisabledHint>}
                    </form>
                    <button
                      type="button"
                      onClick={() => selectedTask && completeTask.mutate(selectedTask.task_id)}
                      disabled={!canCompleteSelectedTask || completeTask.isPending}
                      className="w-full rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {completeTask.isPending ? '完成中...' : '以 Worker 身份完成任务'}
                    </button>
                    {completeDisabledReason && <DisabledHint>{completeDisabledReason}</DisabledHint>}
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="mb-3 font-medium">Employer 操作</h4>
                    <div className="mb-3 text-xs text-gray-500">雇主可以基于 proposal 质量、申请覆盖度和 escrow 状态做出分配或取消决策。</div>
                    <button
                      type="button"
                      onClick={() => selectedTask && cancelTask.mutate(selectedTask.task_id)}
                      disabled={!canCancelSelectedTask || cancelTask.isPending}
                      className="w-full rounded-lg bg-red-600 px-4 py-3 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {cancelTask.isPending ? '取消中...' : '以 Employer 身份取消任务'}
                    </button>
                    {cancelDisabledReason && <DisabledHint>{cancelDisabledReason}</DisabledHint>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">请选择一个任务查看详情、申请列表与后续操作。</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {skillsQuery.isLoading && <PageStateCard message="加载技能中..." compact />}
              {skillsQuery.isError && <PageStateCard message="技能加载失败，请检查 marketplace 服务。" tone="error" compact />}
              {!skillsQuery.isLoading && !skillsQuery.isError && skillsQuery.data?.length === 0 && <PageStateCard message="当前暂无技能。" compact />}
              {skillsQuery.data?.map((skill) => (
                <div key={skill.skill_id} className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{skill.name}</h2>
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
                      <div className="text-2xl font-bold text-primary-600">{skill.price} 积分</div>
                      <div className="text-xs text-gray-400">发布者 {skill.author_aid}</div>
                    </div>
                    <button className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:bg-gray-300" onClick={() => purchaseSkill.mutate(skill.skill_id)} disabled={purchaseSkill.isPending}>
                      {purchaseSkill.isPending ? '处理中...' : '购买'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={submitSkill} className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">发布技能</h2>
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="技能名称" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="技能描述" rows={5} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="价格" type="number" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500" />
              <button className="w-full rounded-lg bg-gray-900 px-4 py-3 text-white hover:bg-black disabled:bg-gray-300" type="submit" disabled={publishSkill.isPending || !currentSession}>
                {publishSkill.isPending ? '发布中...' : '发布技能'}
              </button>
            </div>
          </form>
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
  if (!task) return '请先选择一个任务。'

  switch (action) {
    case 'apply':
      if (!workerSession) return '当前没有可用的 worker session。'
      if (task.status !== 'open') return '只有 open 状态的任务可以申请。'
      if (task.employer_aid === workerSession.aid) return '雇主本人不能以 worker 身份申请自己的任务。'
      return null
    case 'assign':
      if (!employerSession) return '当前没有可用的 employer session。'
      if (task.employer_aid !== employerSession.aid) return '只有任务所属 employer 可以执行分配。'
      if (task.status !== 'open') return '只有 open 状态的任务可以分配。'
      if (task.worker_aid || task.escrow_id) return '当前任务已经分配或已创建托管。'
      if (!workerAid) return '请先选择要分配的申请人。'
      return null
    case 'complete':
      if (!workerSession) return '当前没有可用的 worker session。'
      if (task.status !== 'in_progress') return '只有 in_progress 状态的任务可以完成。'
      if (task.worker_aid !== workerSession.aid) return '只有被分配的 worker 可以完成该任务。'
      if (!task.escrow_id) return '当前任务缺少 escrow，无法释放托管。'
      return null
    case 'cancel':
      if (!employerSession) return '当前没有可用的 employer session。'
      if (task.employer_aid !== employerSession.aid) return '只有任务所属 employer 可以取消任务。'
      if (task.status !== 'open' && task.status !== 'in_progress') return '只有 open 或 in_progress 状态的任务可以取消。'
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
  | 'cancelTask') {
  if (axios.isAxiosError<HttpErrorPayload>(error)) {
    const status = error.response?.status
    const detail = normalizeDetail(error.response?.data?.detail || error.response?.data?.message)

    if (status === 401) return '当前 session 无效或已过期，请先刷新 seeded session。'
    if (status === 403) {
      if (action === 'createTask' || action === 'assignTask' || action === 'cancelTask') return '当前 employer 身份与任务所有者不匹配。'
      if (action === 'applyTask' || action === 'completeTask') return '当前 worker 身份与请求中的执行者不匹配。'
      return detail || '当前身份没有执行该操作的权限。'
    }
    if (status === 404) return detail || '目标任务不存在，列表可能已过期。'
    if (status === 409) return detail || '当前任务状态不允许执行该操作。'
    if (status === 400) {
      if (detail?.includes('Only assigned worker can complete the task')) return '只有当前被分配的 worker 才能完成该任务。'
      if (detail?.includes('Task has no escrow to release')) return '当前任务缺少 escrow，无法完成。请先检查分配与 credit 托管状态。'
      if (detail?.includes('Task is not open for applications')) return '当前任务不再处于 open 状态，无法继续申请。'
      if (detail?.includes('worker_aid is required')) return '分配任务时必须明确选择一个申请人。'
      if (detail?.includes('Failed to create escrow')) return '创建 escrow 失败，请检查 employer 余额与 credit 服务状态。'
      if (detail?.includes('Failed to release escrow')) return '释放 escrow 失败，请检查 credit 服务状态。'
      if (detail?.includes('Failed to refund escrow')) return '退款 escrow 失败，请检查 credit 服务状态。'
      return detail || '请求参数或服务状态不满足当前操作。'
    }

    if (detail) return detail
  }

  const fallback: Record<typeof action, string> = {
    publishSkill: '技能发布失败，请检查当前 session 与 marketplace 服务。',
    purchaseSkill: '技能购买失败，请检查余额、session 与 marketplace 服务。',
    createTask: '任务创建失败，请检查 employer session。',
    applyTask: '任务申请失败，请检查 worker session。',
    assignTask: '任务分配失败，请检查 employer 身份、余额和申请列表。',
    completeTask: '任务完成失败，请确认当前 worker 即为 assigned worker。',
    cancelTask: '任务取消失败，请确认当前 employer 为任务所有者。',
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
    cancelDisabledReason: string | null
  },
): RecommendedMarketplaceAction {
  if (!task) {
    return {
      title: '先选择一个任务',
      description: '从左侧列表中选择一个任务后，系统会根据当前状态推荐最合适的下一步。',
      ctaLabel: null,
      ctaKind: null,
      hint: null,
      tone: 'slate',
    }
  }

  if (task.status === 'open' && context.role === 'worker' && !context.applyDisabledReason) {
    return {
      title: '推荐先申请这个任务',
      description: '当前任务仍处于 open 状态，最顺的演示路径是先以 Worker 身份提交申请。',
      ctaLabel: '立即申请',
      ctaKind: 'apply',
      hint: '提交申请后，Employer 侧就能看到申请列表并继续分配。',
      tone: 'blue',
    }
  }

  if (task.status === 'open' && context.applications.length > 0) {
    return {
      title: '推荐切到申请列表完成分配',
      description: '当前任务已经具备申请人，下一步最适合由 Employer 选择申请人并创建 escrow。',
      ctaLabel: null,
      ctaKind: null,
      hint: '下方“申请列表”中的分配按钮就是当前推荐动作。',
      tone: 'amber',
    }
  }

  if (task.status === 'in_progress' && context.role === 'worker' && !context.completeDisabledReason) {
    return {
      title: '推荐立即完成任务',
      description: '当前任务已经进入 in_progress，且当前 Worker 就是被分配执行者，可以直接完成闭环。',
      ctaLabel: '完成任务',
      ctaKind: 'complete',
      hint: '完成后建议去 Profile 查看 balance / frozen_balance 是否变化。',
      tone: 'amber',
    }
  }

  if (task.status === 'completed') {
    return {
      title: '推荐去 Profile 验证余额变化',
      description: '任务已经 completed，接下来最有价值的是切到个人中心确认 reward 和资金状态是否符合预期。',
      ctaLabel: '查看 Profile',
      ctaKind: 'profile',
      hint: '重点关注 balance、frozen_balance 与 credit 解释区。',
      tone: 'green',
    }
  }

  if (task.status === 'cancelled') {
    return {
      title: '推荐去 Profile 验证退款结果',
      description: '任务已经 cancelled，下一步最适合确认 Employer 侧资金是否已回到可解释状态。',
      ctaLabel: '查看 Profile',
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
}: {
  recommendedAction: RecommendedMarketplaceAction
  onOpenProfile: () => void
  onApply: () => void
  onComplete: () => void
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
    if (recommendedAction.ctaKind === 'profile') return onOpenProfile()
  }

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">推荐演示动作</div>
      <div className="mt-1 text-base font-semibold">{recommendedAction.title}</div>
      <div className="mt-2 text-sm opacity-90">{recommendedAction.description}</div>
      {recommendedAction.ctaLabel && (
        <button type="button" onClick={handleClick} className="mt-4 rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-white">
          {recommendedAction.ctaLabel}
        </button>
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
    cancelDisabledReason: string | null
    applications: TaskApplication[]
  },
): TaskStageGuide {
  if (!task) {
    return {
      title: '未选择任务',
      summary: '请先从左侧列表中选择一个任务，以查看当前闭环阶段。',
      nextAction: '选择任务',
      blockers: [],
      progressLabel: '待选择',
      progressTone: 'slate',
    }
  }

  if (task.status === 'open') {
    const hasApplications = context.applications.length > 0
    return {
      title: hasApplications ? '已进入待分配阶段' : '已进入招募阶段',
      summary: hasApplications
        ? `当前任务已有 ${context.applications.length} 个申请，Employer 可以选择申请人并创建 escrow。`
        : '当前任务已发布但还没有完成分配，Worker 可以先申请该任务。',
      nextAction: hasApplications ? 'Employer 分配 Worker' : 'Worker 申请任务',
      blockers: [context.role === 'worker' ? context.applyDisabledReason : null, context.cancelDisabledReason].filter(Boolean) as string[],
      progressLabel: hasApplications ? '待分配' : '招募中',
      progressTone: hasApplications ? 'amber' : 'blue',
    }
  }

  if (task.status === 'in_progress') {
    return {
      title: '已托管，等待交付',
      summary: task.escrow_id
        ? '任务已分配成功，Credit escrow 已创建，接下来等待 Worker 完成交付。'
        : '任务处于进行中，但当前 escrow 信息缺失，需要先检查托管状态。',
      nextAction: 'Worker 完成任务',
      blockers: [context.completeDisabledReason, context.cancelDisabledReason].filter(Boolean) as string[],
      progressLabel: '执行中',
      progressTone: 'amber',
    }
  }

  if (task.status === 'completed') {
    return {
      title: '闭环完成',
      summary: '任务已完成，Reward 与 escrow 已进入完成态，可以切换到 Profile / Credit 侧验证余额变化。',
      nextAction: '查看余额与结果',
      blockers: [],
      progressLabel: '已完成',
      progressTone: 'green',
    }
  }

  return {
    title: '闭环已中止',
    summary: '当前任务已取消，若此前存在 escrow，资金应已退款给 Employer。',
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
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">当前闭环阶段</div>
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
    open: '当前任务处于 open：worker 可以申请，任务 employer 可以从申请列表中分配执行者。',
    in_progress: '当前任务处于 in_progress：只有被分配的 worker 可以 complete，employer 可以 cancel。',
    completed: '当前任务处于 completed：任务已完成，托管应已释放，不再允许 assign / complete / cancel。',
    cancelled: '当前任务处于 cancelled：任务已取消，不再允许 apply / assign / complete / cancel。',
  }[task.status] || '当前任务状态未知，请结合服务端状态判断可执行操作。'

  return (
    <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
      <div className="font-medium">状态机说明</div>
      <div className="mt-1">{guide}</div>
    </div>
  )
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
    in_progress: 'bg-amber-100 text-amber-700',
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

function PageStateCard({ message, tone = 'neutral', compact = false }: { message: string; tone?: 'neutral' | 'error'; compact?: boolean }) {
  return (
    <div className={`rounded-2xl ${compact ? 'p-4' : 'p-6'} ${tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'} shadow-sm`}>
      {message}
    </div>
  )
}
