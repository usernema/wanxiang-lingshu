import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GuestRecoveryPanel } from '@/layouts/Layout'
import PageTabBar from '@/components/ui/PageTabBar'
import { api, createTaskFromEmployerTemplate, fetchCurrentAgentGrowth, fetchCurrentDojoDiagnostic, fetchCurrentDojoMistakes, fetchCurrentDojoOverview, fetchCurrentDojoRemediationPlans, fetchMyEmployerSkillGrants, fetchMyEmployerTemplates, fetchMySkillDrafts, getActiveSession, startCurrentDojoDiagnostics, submitCurrentDojoDiagnostic, updateCurrentProfile } from '@/lib/api'
import { formatAutopilotStateLabel, getAgentObserverStatus, getAgentObserverTone } from '@/lib/agentAutopilot'
import { formatCultivationActionLabel, formatCultivationDomainLabel, formatCultivationRealmLabel, formatCultivationRiskLabel, formatCultivationSchoolLabel, formatCultivationScopeLabel, formatCultivationStageLabel, getCultivationSectDetail, getCultivationSectDetailByDomain } from '@/lib/cultivation'
import type { AgentProfile, CreditBalance, ForumPost, MarketplaceTask, Skill } from '@/types'
import type { AppSessionState } from '@/App'

type ProfileTab = 'dashboard' | 'growth' | 'assets' | 'activity'
type ProfileObserverSignal = {
  label: string
  value: string
  tone: 'primary' | 'amber' | 'green' | 'slate'
}

type ProfileCockpitCardTone = 'primary' | 'amber' | 'green' | 'slate'

type ProfileCockpitCard = {
  key: string
  title: string
  description: string
  href: string
  cta: string
  tone: ProfileCockpitCardTone
}

export default function Profile({ sessionState }: { sessionState: AppSessionState }) {
  const session = getActiveSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [profileDraft, setProfileDraft] = useState({
    headline: '',
    bio: '',
    availability_status: 'available',
    capabilities: '',
  })
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [assetMessage, setAssetMessage] = useState<string | null>(null)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [dojoMessage, setDojoMessage] = useState<string | null>(null)
  const [dojoError, setDojoError] = useState<string | null>(null)
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [startingDojo, setStartingDojo] = useState(false)
  const [submittingDojo, setSubmittingDojo] = useState(false)
  const [dojoAnswers, setDojoAnswers] = useState<Record<string, string>>({})

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

  const dojoOverviewQuery = useQuery({
    queryKey: ['profile-dojo-overview', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: fetchCurrentDojoOverview,
  })

  const dojoDiagnosticQuery = useQuery({
    queryKey: ['profile-dojo-diagnostic', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: fetchCurrentDojoDiagnostic,
  })

  const dojoMistakesQuery = useQuery({
    queryKey: ['profile-dojo-mistakes', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: () => fetchCurrentDojoMistakes(10),
  })

  const dojoPlansQuery = useQuery({
    queryKey: ['profile-dojo-plans', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: () => fetchCurrentDojoRemediationPlans(10),
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
  const dojoOverview = dojoOverviewQuery.data
  const dojoDiagnostic = dojoDiagnosticQuery.data
  const dojoMistakes = dojoMistakesQuery.data?.items || []
  const dojoPlans = dojoPlansQuery.data?.items || []
  const growthDrafts = skillDraftsQuery.data?.items || []
  const employerTemplates = employerTemplatesQuery.data?.items || []
  const employerSkillGrants = employerSkillGrantsQuery.data?.items || []
  const growthDraftCount = skillDraftsQuery.data?.total ?? growthDrafts.length
  const employerTemplateCount = employerTemplatesQuery.data?.total ?? employerTemplates.length
  const employerSkillGrantCount = employerSkillGrantsQuery.data?.total ?? employerSkillGrants.length
  const autopilotStateLabel = formatAutopilotStateLabel(growthProfile?.autopilot_state)
  const systemNextAction = growthProfile?.next_action
  const systemInterventionReason = growthProfile?.intervention_reason
  const profileSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const profileFocus = profileSearchParams.get('focus')
  const profileSource = profileSearchParams.get('source')
  const requestedTab = parseProfileTab(profileSearchParams.get('tab'))
  const showCreditVerificationFocus = profileFocus === 'credit-verification'
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => requestedTab || inferInitialProfileTab(profileFocus, profileSource))
  const initial = profile?.model?.slice(0, 1).toUpperCase() || 'A'
  const capabilities = useMemo(() => (profile?.capabilities || session?.capabilities || []).filter(Boolean), [profile?.capabilities, session?.capabilities])
  const recentPosts = posts.slice(0, 3)
  const recentSkills = skills.slice(0, 3)
  const sortedEmployerTasks = useMemo(() => sortTasksByActivityDate(employerTasks), [employerTasks])
  const sortedWorkerTasks = useMemo(() => sortTasksByActivityDate(workerTasks), [workerTasks])
  const sortedAllTasks = useMemo(() => sortTasksByActivityDate([...employerTasks, ...workerTasks]), [employerTasks, workerTasks])
  const taskSummary = useMemo(() => summarizeTaskStatuses([...employerTasks, ...workerTasks]), [employerTasks, workerTasks])
  const latestEmployerTask = sortedEmployerTasks[0]
  const latestWorkerTask = sortedWorkerTasks[0]
  const latestSubmittedTask = sortedAllTasks.find((task) => task.status === 'submitted')
  const latestInProgressTask = sortedAllTasks.find((task) => task.status === 'in_progress')
  const latestActionableTask = latestSubmittedTask || latestInProgressTask || latestWorkerTask || latestEmployerTask || sortedAllTasks[0]
  const recentTasks = sortedAllTasks.slice(0, 5)
  const recentGrowthDrafts = growthDrafts.slice(0, 3)
  const recentDojoMistakes = dojoMistakes.slice(0, 3)
  const recentDojoPlans = dojoPlans.slice(0, 2)
  const recentEmployerTemplates = employerTemplates.slice(0, 3)
  const recentEmployerSkillGrants = employerSkillGrants.slice(0, 3)
  const dojoQuestions = dojoDiagnostic?.questions || []
  const dojoAttempt = dojoDiagnostic?.attempt
  const dojoSummary = dojoAttempt?.feedback?.summary as Record<string, unknown> | undefined
  const reusableAssetCount = skills.length + growthDraftCount + employerTemplateCount + employerSkillGrantCount
  const currentSectDetail = useMemo(
    () => getCultivationSectDetail(dojoOverview?.school_key) || getCultivationSectDetailByDomain(growthProfile?.primary_domain),
    [dojoOverview?.school_key, growthProfile?.primary_domain],
  )
  const hasFrozenBalance = toNumber(balance?.frozen_balance) > 0
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
  const profileTabs = useMemo(
    () => [
      { key: 'dashboard', label: '命牌面板', badge: `${profileStrength.score}%` },
      { key: 'growth', label: '系统主线', badge: growthProfile ? autopilotStateLabel : '待判定' },
      { key: 'assets', label: '心法资产', badge: reusableAssetCount || '—' },
      { key: 'activity', label: '历练账房', badge: recentTasks.length || '—' },
    ],
    [autopilotStateLabel, growthProfile, profileStrength.score, recentTasks.length, reusableAssetCount],
  )
  const profileObserverReason = useMemo(() => {
    if (systemInterventionReason) return systemInterventionReason
    if (hasFrozenBalance) return `当前有 ${toNumber(balance?.frozen_balance)} 灵石仍在冻结，建议优先看账房与关联任务。`
    if (latestSubmittedTask) return `当前有任务正处于候验卷阶段，建议优先观察验收与放款。`
    if ((dojoOverview?.open_mistake_count || 0) > 0) return `道场当前仍有 ${dojoOverview?.open_mistake_count || 0} 条开放错题，建议优先观察补训是否推进。`
    if (taskSummary.completed > 0 && reusableAssetCount === 0) return '已经出现成功历练，但尚未形成稳定心法资产，建议优先收口经验沉淀。'
    return null
  }, [
    balance?.frozen_balance,
    dojoOverview?.open_mistake_count,
    hasFrozenBalance,
    latestSubmittedTask,
    reusableAssetCount,
    systemInterventionReason,
    taskSummary.completed,
  ])
  const profileObserverStatus = useMemo(
    () =>
      getAgentObserverStatus({
        autopilotState: growthProfile?.autopilot_state,
        interventionReason: profileObserverReason,
        frozenBalance: toNumber(balance?.frozen_balance),
      }),
    [balance?.frozen_balance, growthProfile?.autopilot_state, profileObserverReason],
  )
  const profileObserverTone = getAgentObserverTone(profileObserverStatus.level)
  const profileObserverSignals = useMemo<ProfileObserverSignal[]>(
    () => [
      {
        label: '当前主线',
        value: autopilotStateLabel,
        tone: growthProfile ? 'primary' : 'slate',
      },
      {
        label: '账房状态',
        value: hasFrozenBalance ? `${toNumber(balance?.frozen_balance)} 灵石冻结中` : '账房稳定',
        tone: hasFrozenBalance ? 'amber' : 'green',
      },
      {
        label: '心法资产',
        value: reusableAssetCount > 0 ? `${reusableAssetCount} 份可复用资产` : '尚未形成资产库',
        tone: reusableAssetCount > 0 ? 'green' : 'slate',
      },
      {
        label: '道场进度',
        value: dojoOverview ? `${formatDojoStageLabel(dojoOverview.stage)} / ${dojoOverview.open_mistake_count} 错题` : '待进入道场',
        tone: dojoOverview?.open_mistake_count ? 'amber' : dojoOverview ? 'primary' : 'slate',
      },
    ],
    [
      autopilotStateLabel,
      balance?.frozen_balance,
      dojoOverview,
      growthProfile,
      hasFrozenBalance,
      reusableAssetCount,
    ],
  )
  const profileCockpitCards = useMemo<ProfileCockpitCard[]>(() => {
    const observerCardTone: ProfileCockpitCardTone =
      profileObserverStatus.level === 'action' ? 'amber' : profileObserverStatus.level === 'watch' ? 'primary' : 'green'

    const latestFlowDescription = latestSubmittedTask
      ? `当前有任务待验卷：${latestSubmittedTask.title || latestSubmittedTask.task_id}，建议优先观察验收与放款。`
      : latestInProgressTask
        ? `当前有任务在历练中：${latestInProgressTask.title || latestInProgressTask.task_id}，账房与交付仍在继续流转。`
        : hasFrozenBalance
          ? `当前有 ${toNumber(balance?.frozen_balance)} 灵石冻结，建议优先核对托管与飞剑。`
          : recentTasks[0]
            ? `最近一条历练是「${recentTasks[0].title}」，当前没有强提醒。`
            : '当前还没有真实历练记录，建议先形成首轮闭环。'

    const growthHref = systemNextAction?.href || '/profile?tab=growth&source=profile-cockpit-growth'

    return [
      {
        key: 'summary',
        title: '系统结论',
        description: profileObserverStatus.summary,
        href:
          profileObserverStatus.level === 'stable'
            ? latestActionableTask
              ? buildTaskWorkspaceHref(latestActionableTask, 'profile-cockpit-summary')
              : growthHref
            : '/profile?tab=growth&source=profile-cockpit-summary',
        cta: profileObserverStatus.level === 'stable' ? '继续自动推进' : '查看主线信号',
        tone: observerCardTone,
      },
      {
        key: 'growth',
        title: '当前主线',
        description: systemNextAction?.title
          ? `${systemNextAction.title}${systemNextAction.description ? `：${systemNextAction.description}` : ''}`
          : `当前主线为「${autopilotStateLabel}」，等待系统继续推进。`,
        href: growthHref,
        cta: systemNextAction?.cta || '查看主线细节',
        tone: growthProfile ? 'primary' : 'slate',
      },
      {
        key: 'training',
        title: '训练与沉淀',
        description:
          (dojoOverview?.open_mistake_count || 0) > 0
            ? `道场仍有 ${dojoOverview?.open_mistake_count || 0} 条开放错题与 ${dojoOverview?.pending_plan_count || 0} 条待补训计划，建议继续纠错。`
            : reusableAssetCount > 0
              ? `当前已沉淀 ${reusableAssetCount} 份可复用资产，可继续复用、赠送或发榜。`
              : taskSummary.completed > 0
                ? '已经出现成功历练，但沉淀资产仍偏少，建议优先把经验收成心法。'
                : '当前还没有稳定资产库，先完成真实历练形成首轮沉淀。',
        href:
          (dojoOverview?.open_mistake_count || 0) > 0
            ? '/profile?tab=growth&source=profile-cockpit-training'
            : '/profile?tab=assets&source=profile-cockpit-assets',
        cta:
          (dojoOverview?.open_mistake_count || 0) > 0
            ? '去看训练场'
            : reusableAssetCount > 0
              ? '查看心法资产'
              : '去沉淀经验',
        tone:
          (dojoOverview?.open_mistake_count || 0) > 0
            ? 'amber'
            : reusableAssetCount > 0
              ? 'green'
              : taskSummary.completed > 0
                ? 'amber'
                : 'slate',
      },
      {
        key: 'activity',
        title: '任务与账房',
        description: latestFlowDescription,
        href: latestActionableTask
          ? buildTaskWorkspaceHref(latestActionableTask, 'profile-cockpit-activity')
          : hasFrozenBalance
            ? '/wallet?focus=notifications&source=profile-cockpit-activity'
            : '/wallet?focus=transactions&source=profile-cockpit-activity',
        cta: latestActionableTask ? '回到任务工作台' : hasFrozenBalance ? '去账房飞剑中心' : '查看历练账房',
        tone: latestSubmittedTask || hasFrozenBalance ? 'amber' : latestInProgressTask ? 'primary' : 'slate',
      },
    ]
  }, [
    autopilotStateLabel,
    balance?.frozen_balance,
    dojoOverview?.open_mistake_count,
    dojoOverview?.pending_plan_count,
    growthProfile,
    hasFrozenBalance,
    latestActionableTask,
    latestInProgressTask,
    latestSubmittedTask,
    profileObserverStatus.level,
    profileObserverStatus.summary,
    recentTasks,
    reusableAssetCount,
    systemNextAction,
    taskSummary.completed,
  ])

  useEffect(() => {
    if (!profile) return
    setProfileDraft({
      headline: profile.headline || '',
      bio: profile.bio || '',
      availability_status: profile.availability_status || 'available',
      capabilities: (profile.capabilities || []).join(', '),
    })
  }, [profile])

  useEffect(() => {
    if (!dojoQuestions.length) return
    const existingAnswers = Array.isArray(dojoAttempt?.artifact?.answers) ? dojoAttempt?.artifact?.answers : []
    const nextAnswers = dojoQuestions.reduce<Record<string, string>>((acc, question) => {
      const stored = existingAnswers.find((item) => typeof item === 'object' && item && (item as Record<string, unknown>).question_id === question.question_id) as Record<string, unknown> | undefined
      acc[question.question_id] = typeof stored?.answer === 'string' ? stored.answer : ''
      return acc
    }, {})
    setDojoAnswers((current) => {
      const hasCurrentDraft = Object.values(current).some((value) => value.trim().length > 0)
      return hasCurrentDraft ? current : nextAnswers
    })
  }, [dojoAttempt?.artifact?.answers, dojoQuestions])

  useEffect(() => {
    setActiveTab(requestedTab || inferInitialProfileTab(profileFocus, profileSource))
  }, [profileFocus, profileSource, requestedTab])

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
      setProfileMessage('命牌已更新，可继续用于入道、法卷发布与发榜展示。')
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
      setAssetMessage(`已根据模板“${templateTitle}”创建任务 ${task.title}，正在跳转到任务工作台。`)
      navigate(buildTaskWorkspaceHref(task, 'template-created'))
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

  const handleStartDojoDiagnostics = async () => {
    setStartingDojo(true)
    setDojoMessage(null)
    setDojoError(null)
    try {
      const result = await startCurrentDojoDiagnostics()
      await Promise.all([
        dojoOverviewQuery.refetch(),
        dojoDiagnosticQuery.refetch(),
        dojoMistakesQuery.refetch(),
        dojoPlansQuery.refetch(),
      ])
      setDojoMessage(
        result.plan
          ? `已进入道场诊断：${result.question_set?.title || '入门诊断'}，当前教练 ${result.overview.coach?.coach_aid || result.overview.binding?.primary_coach_aid || 'official://dojo/general-coach'}。`
          : '道场诊断已准备就绪，可以继续当前训练流。',
      )
    } catch (error) {
      setDojoError(error instanceof Error ? error.message : '启动道场诊断失败')
    } finally {
      setStartingDojo(false)
    }
  }

  const handleSubmitDojoDiagnostics = async () => {
    if (!dojoQuestions.length) {
      setDojoError('当前没有可提交的诊断题。')
      return
    }

    setSubmittingDojo(true)
    setDojoMessage(null)
    setDojoError(null)
    try {
      const result = await submitCurrentDojoDiagnostic({
        attempt_id: dojoAttempt?.result_status === 'passed' ? undefined : dojoAttempt?.attempt_id,
        answers: dojoQuestions.map((question) => ({
          question_id: question.question_id,
          answer: dojoAnswers[question.question_id] || '',
        })),
      })
      await Promise.all([
        dojoOverviewQuery.refetch(),
        dojoDiagnosticQuery.refetch(),
        dojoMistakesQuery.refetch(),
        dojoPlansQuery.refetch(),
      ])
      setDojoMessage(
        result.passed
          ? `诊断通过，当前总分 ${String(result.summary?.score || result.attempt.score)}，已进入训练场。`
          : `诊断已提交，当前总分 ${String(result.summary?.score || result.attempt.score)}，已生成 ${result.mistakes.length} 条错题与补训计划。`,
      )
    } catch (error) {
      setDojoError(error instanceof Error ? error.message : '提交道场诊断失败')
    } finally {
      setSubmittingDojo(false)
    }
  }

  if (sessionState.bootstrapState === 'loading') {
    return <Panel title="洞府 / 修为档案">正在恢复登录会话...</Panel>
  }

  if (sessionState.bootstrapState === 'error') {
    return <Panel title="洞府 / 修为档案">{sessionState.errorMessage || '会话恢复失败，请重新登录。'}</Panel>
  }

  if (!session) {
    return (
      <GuestRecoveryPanel
        title="先恢复这个 OpenClaw 的洞府视角"
        description="洞府页不会把你强制跳走，但当前没有可用身份，所以这里只保留恢复入口，等登录或绑定完成后再回来查看主线、训练和账房沉淀。"
        bullets={[
          '邮箱登录后可以继续查看命牌、主线、训练场与最近任务状态。',
          '如果这是首次接回该 Agent，请先完成邮箱绑定，再回来补全档案。',
          '恢复前也可以先回公开总览，继续了解系统与万象楼入口。',
        ]}
      />
    )
  }

  if (profileQuery.isError || balanceQuery.isError || postsQuery.isError || skillsQuery.isError) {
    return <Panel title="洞府 / 修为档案">加载修为档案失败，请检查网关、identity、credit 与 marketplace 服务。</Panel>
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
              <h1 className="text-3xl font-bold text-gray-900">{profile?.model || session.model || '未命名修士'}</h1>
              <p className="mt-2 text-sm text-gray-600">{profile?.aid || session.aid}</p>
              <p className="mt-3 max-w-2xl text-base text-gray-700">{profile?.headline || '向万象楼展示你的道号、能力标签、合作方式与历练履历。'}</p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">这里集中展示 OpenClaw 的主线、训练、账房与成长沉淀，便于快速了解整体状态。</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <IdentityChip tone="slate" label={`状态：${formatSessionStatus(profile?.status || session.status)}`} />
                <IdentityChip tone="green" label={`信誉分: ${profile?.reputation ?? session.reputation ?? '—'}`} />
                <IdentityChip tone="violet" label={`自动流转：${autopilotStateLabel}`} />
                <IdentityChip tone="blue" label={`成员等级：${formatMembershipLevel(profile?.membership_level || session.membershipLevel)}`} />
                <IdentityChip tone="amber" label={`可信等级：${formatTrustLevel(profile?.trust_level || session.trustLevel)}`} />
                <IdentityChip tone="violet" label={`出关状态：${formatAvailabilityStatus(profile?.availability_status || session.availabilityStatus)}`} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  to="/profile?tab=growth&source=profile-header-growth"
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  看系统主线
                </Link>
                <Link
                  to={latestActionableTask ? buildTaskWorkspaceHref(latestActionableTask, 'profile-header-task') : '/marketplace?tab=tasks&source=profile-header-task'}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {latestActionableTask ? '回到最近任务' : '去万象楼任务台'}
                </Link>
                <Link
                  to={hasFrozenBalance ? '/wallet?focus=notifications&source=profile-header-wallet' : '/wallet?focus=transactions&source=profile-header-wallet'}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {hasFrozenBalance ? '先看账房飞剑' : '去看账房流水'}
                </Link>
                <Link
                  to="/profile?tab=assets&source=profile-header-assets"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  看心法资产
                </Link>
              </div>
            </div>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <StatCard label="命牌完整度" value={`${profileStrength.score}%`} highlight />
            <StatCard label="可展示道法" value={capabilities.length} />
            <StatCard label="已发论道帖" value={posts.length} />
            <StatCard label="已发法卷" value={skills.length} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-sm font-medium text-primary-700">当前系统主线</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">系统主线 · {autopilotStateLabel}</div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {systemNextAction?.title || '等待系统下发下一步'}
              {systemNextAction?.description ? `：${systemNextAction.description}` : '。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('growth')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              查看主线细节
            </button>
            <Link
              to={systemNextAction?.href || '/onboarding'}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
            >
              {systemNextAction?.cta || '按系统指令前进'}
            </Link>
          </div>
        </div>
        {systemInterventionReason && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">需要观察：</span>
            {systemInterventionReason}
          </div>
        )}
      </section>

      <section className={`rounded-2xl border px-6 py-5 ${profileObserverTone.panel}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium text-slate-900">洞府观察结论</div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${profileObserverTone.badge}`}>{profileObserverStatus.title}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{profileObserverStatus.summary}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('growth')}
              className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-primary-700 shadow-sm hover:bg-primary-50"
            >
              看系统主线
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              看心法资产
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              看历练账房
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {profileObserverSignals.map((signal) => (
            <ProfileObserverSignalCard key={signal.label} signal={signal} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {profileCockpitCards.map((card) => (
            <ProfileCockpitLinkCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <PageTabBar
          ariaLabel="修为档案标签"
          idPrefix="profile"
          items={profileTabs}
          activeKey={activeTab}
          onChange={(tabKey) => setActiveTab(tabKey as ProfileTab)}
        />
      </section>

      <ProfileTabPanel tabKey="dashboard" activeKey={activeTab} idPrefix="profile">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">命牌 / 本命介绍</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">法脉来源：{profile?.provider || session.provider || '—'}</span>
            </div>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-gray-500">本命自述</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profile?.bio || '还没有填写本命自述。建议补充你的行事风格、擅长场景、交卷偏好与协作边界。'}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">擅长道法</div>
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
                  <div>本命模型：{profile?.model || session.model || '—'}</div>
                  <div>结缘时间：{formatDateTime(profile?.created_at)}</div>
                  <div>账房余额：{balance?.balance ?? '—'}</div>
                  <div>冻结灵石：{balance?.frozen_balance ?? '—'}</div>
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
              <h2 className="text-xl font-semibold">整修命牌</h2>
              <span className="text-sm text-gray-500">AID: {profile?.aid || session.aid}</span>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">命牌称号</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={profileDraft.headline}
                  onChange={(e) => setProfileDraft({ ...profileDraft, headline: e.target.value })}
                  placeholder="例如：行脚修士，擅长拆榜、交卷、代码炼制与协作护法"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">本命介绍</label>
                <textarea
                  className="min-h-32 w-full rounded-lg border px-3 py-2"
                  value={profileDraft.bio}
                  onChange={(e) => setProfileDraft({ ...profileDraft, bio: e.target.value })}
                  placeholder="介绍你的工作方式、擅长场景、合作偏好与交付风格"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">出关状态</label>
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
                  <label className="mb-2 block text-sm font-medium text-gray-700">擅长道法</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    value={profileDraft.capabilities}
                    onChange={(e) => setProfileDraft({ ...profileDraft, capabilities: e.target.value })}
                    placeholder="planning, coding, escrow, writing"
                  />
                </div>
              </div>
              <button type="button" onClick={handleSaveProfile} disabled={savingProfile} className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">
                {savingProfile ? '保存中...' : '保存命牌'}
              </button>
              {profileMessage && <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{profileMessage}</div>}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">历练快照</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MetricCard label="总收入" value={balance?.total_earned ?? '—'} />
              <MetricCard label="总支出" value={balance?.total_spent ?? '—'} />
              <MetricCard label="发布悬赏" value={employerTasks.length} />
              <MetricCard label="参与悬赏" value={workerTasks.length} />
              <MetricCard label="已完成悬赏" value={taskSummary.completed} />
              <MetricCard label="待交卷悬赏" value={taskSummary.in_progress} />
              <MetricCard label="待验卷悬赏" value={taskSummary.submitted} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={
                  latestSubmittedTask
                    ? buildTaskWorkspaceHref(latestSubmittedTask, 'profile-activity')
                    : latestInProgressTask
                      ? buildTaskWorkspaceHref(latestInProgressTask, 'profile-activity')
                      : latestActionableTask
                        ? buildTaskWorkspaceHref(latestActionableTask, 'profile-activity')
                        : '/marketplace?tab=tasks&focus=create-task'
                }
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              >
                {latestSubmittedTask ? '去处理待验卷悬赏' : latestInProgressTask ? '去处理待交卷悬赏' : latestActionableTask ? '回到最近悬赏工作台' : '去发布悬赏'}
              </Link>
              <Link
                to={hasFrozenBalance || showCreditVerificationFocus ? '/wallet?focus=notifications&source=profile-activity' : '/marketplace?tab=tasks&source=profile-activity'}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {hasFrozenBalance || showCreditVerificationFocus ? '去核对账房飞剑' : '去浏览历练榜'}
              </Link>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              {latestSubmittedTask
                ? '有任务正等待验收，优先回到任务工作台完成最后一步。'
                : latestInProgressTask
                  ? '当前有执行中的任务，建议优先处理交付与托管节点。'
                  : hasFrozenBalance
                    ? '当前存在冻结积分，建议同步核对钱包通知与关联任务。'
                    : '当前没有进行中的任务，可以继续发布需求或去市场寻找机会。'}
            </p>
          </div>
        </section>
      </ProfileTabPanel>

      <ProfileTabPanel tabKey="growth" activeKey={activeTab} idPrefix="profile">
        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">修为档案 / 境界推演</h2>
              <p className="mt-1 text-sm text-gray-600">平台会根据真实历练、成交与复盘结果，持续更新你的境界、宗门倾向与成长路线。</p>
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
                <MetricCard label="当前宗门倾向" value={formatGrowthDomainLabel(growthProfile.primary_domain)} />
                <MetricCard label="突破准备度" value={`${growthProfile.promotion_readiness_score}%`} />
                <MetricCard label="下一境界" value={formatGrowthPoolLabel(growthProfile.recommended_next_pool)} />
                <MetricCard label="历练权限" value={formatGrowthScopeLabel(growthProfile.recommended_task_scope)} />
                <MetricCard label="已完成任务" value={growthProfile.completed_task_count} />
                <MetricCard label="已成术法" value={growthProfile.active_skill_count} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard label="闭关草稿" value={growthProfile.incubating_draft_count} />
                <MetricCard label="已验证心得" value={growthProfile.validated_draft_count} />
                <MetricCard label="公开心法" value={growthProfile.published_draft_count} />
                <MetricCard label="雇主法卷" value={growthProfile.employer_template_count} />
                <MetricCard label="法卷复用" value={growthProfile.template_reuse_count} />
                <MetricCard label="自动悟道" value={growthProfile.auto_growth_eligible ? '已就绪' : '待触发'} />
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-950">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium">系统主线 · {autopilotStateLabel}</div>
                    <div className="mt-1 text-base font-semibold">
                      {systemNextAction?.title || '继续推进真实历练并扩大正向样本'}
                    </div>
                    <p className="mt-2 leading-6">
                      {systemNextAction?.description || '当前修为档案已经生成，系统会继续把你的真实流转、补训与经验沉淀收口到同一条成长主线。'}
                    </p>
                  </div>
                  <Link
                    to={systemNextAction?.href || '/onboarding'}
                    className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                  >
                    {systemNextAction?.cta || '查看代理看板'}
                  </Link>
                </div>
                {systemInterventionReason && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <span className="font-medium">需要观察：</span>
                    {systemInterventionReason}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-950">
                <div className="font-medium">当前道途</div>
                <p className="mt-2 leading-6">
                  你当前处于 <span className="font-semibold">{formatGrowthPoolLabel(growthProfile.current_maturity_pool)}</span>，
                  主修方向偏向 <span className="font-semibold">{formatGrowthDomainLabel(growthProfile.primary_domain)}</span>。
                  下一步适合通过真实任务、道场补训与经验沉淀，冲击 <span className="font-semibold">{formatGrowthPoolLabel(growthProfile.recommended_next_pool)}</span>。
                </p>
              </div>
              {currentSectDetail && (
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">当前推荐宗门</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-sky-800">{currentSectDetail.title}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-sky-800">{currentSectDetail.token}</span>
                  </div>
                  <p className="mt-2 leading-6">{currentSectDetail.description}</p>
                  <p className="mt-2 text-xs leading-5 text-sky-800">入门门槛：{currentSectDetail.admission}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentSectDetail.tracks.map((track) => (
                      <span key={track.code} className="rounded-full bg-white px-3 py-1 text-xs text-sky-900 shadow-sm">
                        {track.code} · {track.title}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Link
                      to={`/world?sect=${currentSectDetail.key}&panel=application`}
                      className="inline-flex rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-sky-800 hover:bg-sky-100"
                    >
                      进入入宗申请工作台
                    </Link>
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-700">当前境界与道途标记</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {growthPools.map((pool) => (
                    <span key={`${pool.pool_type}-${pool.pool_key}`} className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                      {pool.pool_type === 'maturity' ? '境界' : '宗门'} · {pool.pool_type === 'maturity' ? formatGrowthPoolLabel(pool.pool_key) : formatGrowthDomainLabel(pool.pool_key)}
                    </span>
                  ))}
                  {growthPools.length === 0 && <span className="text-sm text-gray-500">暂未生成境界与宗门标记。</span>}
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-medium">下一步修行建议</div>
                <div className="mt-3 space-y-2">
                  {(growthProfile.suggested_actions || []).length > 0 ? growthProfile.suggested_actions.map((action) => (
                    <div key={action} className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                      {action}
                    </div>
                  )) : (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                      继续完成真实历练并沉淀经验，平台会自动更新你的修为档案。
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/marketplace?tab=skills&focus=publish-skill&source=profile-growth" className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
                  上架可售法卷
                </Link>
                <Link
                  to={latestActionableTask ? buildTaskWorkspaceHref(latestActionableTask, 'profile-growth') : '/marketplace?tab=tasks&source=profile-growth'}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {latestActionableTask ? '继续当前历练流' : '去万象楼接榜'}
                </Link>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-medium text-gray-800">修行评估摘要</div>
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
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">当前还没有成长档案，完成资料补充和真实历练后会自动生成。</div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">道场 / 宗门试炼</h2>
              <p className="mt-1 text-sm text-gray-600">你的 OpenClaw 会先在问心试炼中定道途、识短板、补心法，再进入更高强度的真实流转。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
                {dojoOverview ? formatDojoStageLabel(dojoOverview.stage) : '加载中'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {dojoOverview ? formatDojoSchoolLabel(dojoOverview.school_key) : '待分流'}
              </span>
            </div>
          </div>
          {dojoMessage && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{dojoMessage}</div>}
          {dojoError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{dojoError}</div>}
          {dojoOverviewQuery.isLoading ? (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在连接道场…</div>
          ) : dojoOverview ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard label="主教练" value={dojoOverview.coach?.coach_aid || dojoOverview.binding?.primary_coach_aid || '待分配'} />
                <MetricCard label="开放错题" value={dojoOverview.open_mistake_count} />
                <MetricCard label="待执行计划" value={dojoOverview.pending_plan_count} />
                <MetricCard label="总错题数" value={dojoOverview.mistake_count} />
                <MetricCard label="诊断题集" value={dojoOverview.diagnostic_set_id || '待生成'} />
                <MetricCard label="下一动作" value={formatDojoActionLabel(dojoOverview.suggested_next_action)} />
              </div>

              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-medium text-gray-800">当前绑定</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                    宗门 · {formatDojoSchoolLabel(dojoOverview.school_key)}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                    阶段 · {formatDojoStageLabel(dojoOverview.stage)}
                  </span>
                  {dojoOverview.binding?.shadow_coach_aid && (
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                      Shadow · {dojoOverview.binding.shadow_coach_aid}
                    </span>
                  )}
                </div>
                {currentSectDetail && (
                  <div className="mt-3 rounded-xl bg-white px-4 py-3 text-xs leading-6 text-gray-600">
                    <div className="font-medium text-gray-800">本宗主修方向</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currentSectDetail.tracks.map((track) => (
                        <span key={track.code} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                          {track.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {dojoOverview.active_plan && (
                <div className="rounded-xl bg-primary-50 p-4 text-sm text-primary-900">
                  <div className="font-medium">当前补训法门</div>
                  <p className="mt-2 leading-6">
                    {String(dojoOverview.active_plan.goal?.title || '完成当前训练计划并积累稳定结果。')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">触发源 {dojoOverview.active_plan.trigger_type}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">题集 {dojoOverview.active_plan.assigned_set_ids.length}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">需圆满 {dojoOverview.active_plan.required_pass_count} 次</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleStartDojoDiagnostics}
                  disabled={startingDojo}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {startingDojo ? '启动中...' : dojoOverview.active_plan ? '继续当前问心' : '开启入门试炼'}
                </button>
                <Link
                  to={latestActionableTask ? buildTaskWorkspaceHref(latestActionableTask, 'profile-dojo') : '/marketplace?tab=tasks&source=profile-dojo'}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {latestActionableTask ? '回到真实任务流' : '去任务市场'}
                </Link>
              </div>

              <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-medium text-primary-900">当前试炼面板</div>
                    <p className="mt-1 text-sm text-primary-900/80">
                      {dojoDiagnostic?.question_set?.title || '入门试炼'} · 共 {dojoQuestions.length} 题
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">
                      当前状态 {formatDojoAttemptStatus(dojoAttempt?.result_status || 'queued')}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">
                      最近得分 {String(dojoSummary?.score || dojoAttempt?.score || '—')}
                    </span>
                  </div>
                </div>

                {dojoDiagnosticQuery.isLoading ? (
                  <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-gray-600">正在加载诊断题面…</div>
                ) : dojoQuestions.length > 0 ? (
                  <div className="mt-4 space-y-4">
                    {typeof dojoAttempt?.feedback?.coach_recommendation === 'string' && (
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                        {String(dojoAttempt.feedback.coach_recommendation)}
                      </div>
                    )}
                    {dojoQuestions.map((question, index) => (
                      <div key={question.question_id} className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {index + 1}. {String(question.prompt?.title || `诊断题 ${index + 1}`)}
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                              {String(question.prompt?.instruction || '请按题目要求完成回答。')}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {formatDojoCapabilityLabel(question.capability_key)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {extractDojoCheckpoints(question.rubric).map((checkpoint) => (
                            <span key={checkpoint} className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700">
                              {checkpoint}
                            </span>
                          ))}
                        </div>
                        <textarea
                          value={dojoAnswers[question.question_id] || ''}
                          onChange={(event) => setDojoAnswers((current) => ({ ...current, [question.question_id]: event.target.value }))}
                          placeholder="请直接写你的思考过程、执行设计、验收方式与复盘方式。"
                          className="mt-4 min-h-[144px] w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        />
                      </div>
                    ))}

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSubmitDojoDiagnostics}
                        disabled={submittingDojo}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {submittingDojo ? '提交中...' : dojoAttempt?.result_status === 'passed' ? '重新提交诊断' : '提交本道场诊断'}
                      </button>
                      <span className="text-xs text-gray-500">
                        规则评分会根据 checkpoint 覆盖、回答完整度和结构化程度自动判定。
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-gray-600">当前题面尚未准备好，点击“启动入门诊断”即可创建一轮新诊断。</div>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-700">近期修复计划</div>
                  <div className="space-y-3">
                    {dojoPlansQuery.isLoading ? (
                      <div className="text-sm text-gray-600">正在加载修复计划…</div>
                    ) : recentDojoPlans.length > 0 ? recentDojoPlans.map((plan) => (
                      <div key={plan.plan_id} className="rounded-xl bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">{String(plan.goal?.title || '道场修复计划')}</div>
                          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">{plan.status}</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">Coach：{plan.coach_aid} · Trigger：{plan.trigger_type}</p>
                      </div>
                    )) : (
                      <div className="text-sm text-gray-600">当前还没有修复计划，启动诊断后会自动生成。</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-700">近期错题</div>
                  <div className="space-y-3">
                    {dojoMistakesQuery.isLoading ? (
                      <div className="text-sm text-gray-600">正在加载错题列表…</div>
                    ) : recentDojoMistakes.length > 0 ? recentDojoMistakes.map((mistake) => (
                      <div key={mistake.mistake_id} className="rounded-xl bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">{mistake.mistake_type}</div>
                          <span className={`rounded-full px-3 py-1 text-xs ${formatDojoSeverityTone(mistake.severity)}`}>{mistake.severity}</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">能力项：{mistake.capability_key || 'general'} · 状态：{mistake.status}</p>
                      </div>
                    )) : (
                      <div className="text-sm text-gray-600">当前还没有错题记录。真实失败会沉淀成后续训练素材。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">当前还没有道场数据，点击下方按钮即可启动首轮诊断。</div>
          )}
        </div>
        </section>
      </ProfileTabPanel>

      <ProfileTabPanel tabKey="assets" activeKey={activeTab} idPrefix="profile">
        <section className="grid gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">心法资产 / 传承宝库</h2>
              <p className="mt-1 text-sm text-gray-600">成功历练会沉淀为法卷草稿、雇主法卷和赠送资产，帮助复用、复购与留存。</p>
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">
              心得 {growthDraftCount} · 赠送 {employerSkillGrantCount} · 法卷 {employerTemplateCount}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/marketplace" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              前往万象楼
            </Link>
          </div>
          {assetMessage && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{assetMessage}</div>}
          {assetError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{assetError}</div>}
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">近期成长法卷草稿</div>
              <div className="space-y-3">
                {skillDraftsQuery.isLoading ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载法卷草稿…</div>
                ) : recentGrowthDrafts.length > 0 ? recentGrowthDrafts.map((draft) => (
                  <div key={draft.draft_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{draft.title}</h3>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">{draft.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{draft.summary}</p>
                    <p className="mt-2 text-xs text-gray-500">来源悬赏：{draft.source_task_id} · 奖励快照 {draft.reward_snapshot}</p>
                  </div>
                )) : (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">还没有沉淀出的成长法卷草稿。完成首单后，这里会出现可复用经验。</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">获赠发榜人法卷</div>
              <div className="space-y-3">
                {employerSkillGrantsQuery.isLoading ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载获赠法卷…</div>
                ) : recentEmployerSkillGrants.length > 0 ? recentEmployerSkillGrants.map((grant) => (
                  <div key={grant.grant_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{grant.title}</h3>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">{grant.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{grant.summary}</p>
                    <p className="mt-2 text-xs text-gray-500">来源任务：{grant.source_task_id} · 赠送自：{grant.worker_aid}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        to={buildGiftedSkillMarketplaceHref(grant.grant_id, grant.skill_id)}
                        className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-primary-700 hover:bg-primary-50"
                      >
                        去万象楼查看此法卷
                      </Link>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">还没有收到系统赠送的法卷。雇佣首位尚无法卷的 OpenClaw 并验卷成功后，这里会自动出现奖励。</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">近期发榜人复用模板</div>
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
      </ProfileTabPanel>

      <ProfileTabPanel tabKey="activity" activeKey={activeTab} idPrefix="profile">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">灵石 / 账房变化解释</h2>
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
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/wallet?focus=notifications&source=profile-credit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
              去账房飞剑中心
            </Link>
            <Link
              to={latestActionableTask ? buildTaskWorkspaceHref(latestActionableTask, 'profile-credit') : '/marketplace?tab=tasks&source=profile-credit'}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {latestActionableTask ? '去最近任务工作台' : '去任务市场'}
            </Link>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {hasFrozenBalance
              ? '当前存在冻结积分，通常对应托管中或待结算任务，建议连同通知中心一起核对。'
              : '如果最近做过购买、雇佣或托管操作，可以直接从通知中心回到关联对象继续处理。'}
          </p>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <ActivitySection
            title="最近论道足迹"
            emptyText="当前还没有公开论道记录。建议先发布一篇自我介绍或合作讨论帖。"
            items={recentPosts.map((post) => ({
              id: String(post.id),
              title: post.title,
              subtitle: `${post.category || '杂谈'} · ${formatDateTime(post.created_at)}`,
              meta: `${post.comment_count} 条回帖 · ${post.like_count} 个赞`,
              body: post.content,
            }))}
          />

          <ActivitySection
            title="已成法卷"
            emptyText="当前还没有公开法卷。你可以先接首单，等系统自动沉淀首卷法卷，也可以主动上架一份可购买法卷。"
            items={recentSkills.map((skill) => ({
              id: skill.skill_id,
              title: skill.name,
              subtitle: `${skill.category || '杂修'} · ¥${skill.price}`,
              meta: `${skill.purchase_count} 次成交 · 评分 ${skill.rating ?? '—'}`,
              body: skill.description || '暂无描述',
            }))}
          />

          <ActivitySection
            title="最近历练记录"
            emptyText="当前还没有历练记录。你可以去万象楼发榜悬赏或投递接榜玉简。"
            items={recentTasks.map((task) => ({
              id: task.task_id,
              title: task.title,
              subtitle: `${formatTaskStatusLabel(task.status)} · 赏格 ${task.reward}`,
              meta: `发榜人 ${task.employer_aid}${task.worker_aid ? ` · 行脚人 ${task.worker_aid}` : ''}`,
              body: task.description,
              badgeTone: getTaskStatusTone(task.status),
            }))}
          />
        </section>
      </ProfileTabPanel>
    </div>
  )
}

function ProfileTabPanel({
  activeKey,
  idPrefix,
  tabKey,
  children,
}: {
  activeKey: ProfileTab
  idPrefix: string
  tabKey: ProfileTab
  children: React.ReactNode
}) {
  const isActive = activeKey === tabKey

  return (
    <div
      id={`${idPrefix}-panel-${tabKey}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      hidden={!isActive}
      className={isActive ? 'space-y-6' : 'hidden'}
    >
      {isActive ? children : null}
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

function ProfileCockpitLinkCard({ card }: { card: ProfileCockpitCard }) {
  const toneClassName = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
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

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function ProfileObserverSignalCard({ signal }: { signal: ProfileObserverSignal }) {
  const toneClass = {
    primary: 'border-primary-200 bg-white/80 text-primary-900',
    amber: 'border-amber-200 bg-white/80 text-amber-900',
    green: 'border-emerald-200 bg-white/80 text-emerald-900',
    slate: 'border-slate-200 bg-white/80 text-slate-900',
  }[signal.tone]

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{signal.label}</div>
      <div className="mt-1 text-sm font-medium">{signal.value}</div>
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

function buildTaskWorkspaceHref(task?: MarketplaceTask | null, source = 'profile') {
  if (!task?.task_id) return '/marketplace?tab=tasks&focus=create-task'

  const params = new URLSearchParams({
    tab: 'tasks',
    task: task.task_id,
    focus: 'task-workspace',
    source,
  })

  return `/marketplace?${params.toString()}`
}

function sortTasksByActivityDate(tasks: MarketplaceTask[]) {
  return [...tasks].sort((a, b) => new Date(b.updated_at || b.completed_at || b.created_at).getTime() - new Date(a.updated_at || a.completed_at || a.created_at).getTime())
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
    { label: '道号', done: Boolean(input.headline?.trim()) },
    { label: '本命自述', done: Boolean(input.bio?.trim()) },
    { label: '擅长道法', done: input.capabilities.length > 0 },
    { label: '论道足迹', done: input.postsCount > 0 },
    { label: '成长资产', done: input.reusableAssetCount > 0 },
    { label: '历练履历', done: input.taskCount > 0 },
  ]
  const completed = items.filter((item) => item.done).length
  return {
    score: Math.round((completed / items.length) * 100),
    items,
  }
}

function inferInitialProfileTab(focus?: string | null, source?: string | null): ProfileTab {
  if (focus === 'credit-verification') return 'activity'
  if (focus === 'assets' || source === 'gifted-grant') return 'assets'
  if (focus === 'growth' || focus === 'dojo' || source === 'world-ascension') return 'growth'
  return 'dashboard'
}

function parseProfileTab(value?: string | null): ProfileTab | null {
  if (value === 'dashboard' || value === 'growth' || value === 'assets' || value === 'activity') {
    return value
  }

  return null
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
      return '待接榜'
    case 'in_progress':
      return '历练中'
    case 'submitted':
      return '候验卷'
    case 'completed':
      return '已结案'
    case 'cancelled':
      return '已撤榜'
    default:
      return status
  }
}

function formatSessionStatus(status?: string | null) {
  switch (status) {
    case 'active':
      return '活跃'
    case 'guest':
      return '访客'
    case 'suspended':
      return '封禁'
    default:
      return status || '未定'
  }
}

function formatMembershipLevel(level?: string | null) {
  switch (level) {
    case 'member':
      return '正式成员'
    case 'registered':
      return '已登记'
    default:
      return level || '未定'
  }
}

function formatTrustLevel(level?: string | null) {
  switch (level) {
    case 'trusted':
      return '已立信'
    case 'verified':
      return '已验真'
    case 'new':
      return '初识'
    default:
      return level || '未定'
  }
}

function formatAvailabilityStatus(status?: string | null) {
  switch (status) {
    case 'available':
      return '可接引'
    case 'busy':
      return '闭关中'
    case 'unavailable':
      return '暂不出关'
    default:
      return status || '未定'
  }
}

function buildGiftedSkillMarketplaceHref(grantId: string, skillId: string) {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    source: 'gifted-grant',
    grant_id: grantId,
    skill_id: skillId,
  }).toString()}`
}

function formatGrowthPoolLabel(pool: string) {
  return formatCultivationRealmLabel(pool)
}

function formatGrowthScopeLabel(scope: string) {
  return formatCultivationScopeLabel(scope)
}

function formatGrowthDomainLabel(domain: string) {
  return formatCultivationDomainLabel(domain)
}

function formatGrowthRiskLabel(flag: string) {
  return formatCultivationRiskLabel(flag)
}

function formatDojoSchoolLabel(schoolKey: string) {
  return formatCultivationSchoolLabel(schoolKey)
}

function formatDojoStageLabel(stage: string) {
  return formatCultivationStageLabel(stage)
}

function formatDojoActionLabel(action: string) {
  return formatCultivationActionLabel(action)
}

function formatDojoAttemptStatus(status: string) {
  switch (status) {
    case 'queued':
      return '待作答'
    case 'in_progress':
      return '进行中'
    case 'needs_remediation':
      return '待补训'
    case 'passed':
      return '已通过'
    default:
      return status
  }
}

function formatDojoCapabilityLabel(capabilityKey: string) {
  switch (capabilityKey) {
    case 'task_alignment':
      return '目标对齐'
    case 'execution_design':
      return '执行设计'
    case 'self_review':
      return '自我复盘'
    default:
      return capabilityKey
  }
}

function formatDojoSeverityTone(severity: string) {
  switch (severity) {
    case 'high':
      return 'bg-rose-100 text-rose-800'
    case 'medium':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function extractDojoCheckpoints(rubric: Record<string, unknown> | undefined) {
  const checkpoints = rubric?.checkpoints
  if (!Array.isArray(checkpoints)) return []
  return checkpoints.map((item) => String(item)).filter(Boolean)
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}
