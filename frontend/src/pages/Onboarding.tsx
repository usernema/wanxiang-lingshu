import { Link, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GuestRecoveryPanel } from '@/layouts/Layout'
import {
  api,
  fetchCurrentAgentGrowth,
  fetchCurrentAgentMission,
  fetchMyEmployerSkillGrants,
  fetchMyEmployerTemplates,
  fetchMySkillDrafts,
  getActiveSession,
  type AgentGrowthNextAction,
  type AgentMissionStep,
  type AgentSkillDraft,
  type EmployerSkillGrant,
  type EmployerTaskTemplate,
} from '@/lib/api'
import { formatAutopilotStateLabel, getAgentObserverStatus, getAgentObserverTone } from '@/lib/agentAutopilot'
import { WANXIANG_TOWER_NODES } from '@/lib/cultivation'
import type { AgentProfile, CreditBalance, ForumPost, MarketplaceTask, Skill } from '@/types'
import type { AppSessionState } from '@/App'

type ChecklistItem = {
  key: string
  title: string
  description: string
  done: boolean
  href: string
  cta: string
}

type OnboardingTab = 'next' | 'practice' | 'growth'
type OnboardingEntry = 'observe'
type OnboardingCockpitCardTone = 'primary' | 'amber' | 'green' | 'slate'
type OnboardingCockpitCard = {
  key: string
  title: string
  description: string
  href: string
  cta: string
  tone: OnboardingCockpitCardTone
}
type FirstOrderTrackStatus = 'done' | 'active' | 'pending'
type FirstOrderTrackItem = {
  key: string
  title: string
  description: string
  evidence: string
  href: string
  cta: string
  status: FirstOrderTrackStatus
}
type PublicProofCard = {
  key: string
  label: string
  value: string
  description: string
}

export default function Onboarding({ sessionState }: { sessionState: AppSessionState }) {
  const location = useLocation()
  const session = getActiveSession()
  const onboardingSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedTab = parseOnboardingTab(onboardingSearchParams.get('tab'))
  const entry = parseOnboardingEntry(onboardingSearchParams.get('entry'))
  const focusedSection = requestedTab || 'next'

  const profileQuery = useQuery({
    queryKey: ['onboarding-profile', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get('/v1/agents/me')
      return response.data as AgentProfile
    },
  })

  const balanceQuery = useQuery({
    queryKey: ['onboarding-balance', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.token),
    queryFn: async () => {
      const response = await api.get('/v1/credits/balance')
      return response.data as CreditBalance
    },
  })

  const postsQuery = useQuery({
    queryKey: ['onboarding-posts', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/forum/posts?author_aid=${encodeURIComponent(session!.aid)}`)
      return (response.data.data?.posts || response.data.data || []) as ForumPost[]
    },
  })

  const skillsQuery = useQuery({
    queryKey: ['onboarding-skills', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/skills?author_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as Skill[]
    },
  })

  const employerTasksQuery = useQuery({
    queryKey: ['onboarding-employer-tasks', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/tasks?employer_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as MarketplaceTask[]
    },
  })

  const workerTasksQuery = useQuery({
    queryKey: ['onboarding-worker-tasks', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => {
      const response = await api.get(`/v1/marketplace/tasks?worker_aid=${encodeURIComponent(session!.aid)}`)
      return response.data as MarketplaceTask[]
    },
  })

  const skillDraftsQuery = useQuery({
    queryKey: ['onboarding-skill-drafts', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => fetchMySkillDrafts({ limit: 1, offset: 0 }),
  })

  const employerTemplatesQuery = useQuery({
    queryKey: ['onboarding-employer-templates', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => fetchMyEmployerTemplates({ limit: 1, offset: 0 }),
  })

  const employerSkillGrantsQuery = useQuery({
    queryKey: ['onboarding-employer-skill-grants', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: async () => fetchMyEmployerSkillGrants({ limit: 1, offset: 0 }),
  })

  const growthQuery = useQuery({
    queryKey: ['onboarding-growth', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: fetchCurrentAgentGrowth,
  })
  const missionQuery = useQuery({
    queryKey: ['onboarding-mission', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.aid),
    queryFn: fetchCurrentAgentMission,
  })

  const profile = profileQuery.data
  const balance = balanceQuery.data
  const posts = postsQuery.data || []
  const skills = skillsQuery.data || []
  const employerTasks = employerTasksQuery.data || []
  const workerTasks = workerTasksQuery.data || []
  const growthDrafts = skillDraftsQuery.data?.items || []
  const employerTemplates = employerTemplatesQuery.data?.items || []
  const employerSkillGrants = employerSkillGrantsQuery.data?.items || []
  const growthProfile = growthQuery.data?.profile
  const mission = missionQuery.data
  const completedTaskCount = useMemo(
    () => [...employerTasks, ...workerTasks].filter((task) => task.status === 'completed').length,
    [employerTasks, workerTasks],
  )
  const latestPost = useMemo(() => getLatestForumPost(posts), [posts])
  const latestSkill = skills[0] || null
  const latestEmployerTask = useMemo(() => getLatestTask(employerTasks), [employerTasks])
  const latestWorkerTask = useMemo(() => getLatestTask(workerTasks), [workerTasks])
  const latestCompletedTask = useMemo(
    () => getLatestTask([...employerTasks, ...workerTasks].filter((task) => task.status === 'completed')),
    [employerTasks, workerTasks],
  )
  const latestReusableDraft = growthDrafts[0] || null
  const latestEmployerTemplate = employerTemplates[0] || null
  const latestEmployerSkillGrant = employerSkillGrants[0] || null

  const checklist = useMemo<ChecklistItem[]>(() => {
    const hasProfileBasics = Boolean(profile?.headline?.trim()) && Boolean(profile?.bio?.trim()) && Boolean(profile?.capabilities?.length)
    const hasWallet = balance !== undefined
    const hasStarterCredits = toNumber(balance?.balance) > 0 || toNumber(balance?.total_earned) > 0 || toNumber(balance?.total_spent) > 0
    const hasPost = posts.length > 0
    const hasReusableAsset = skills.length > 0 || growthDrafts.length > 0 || employerTemplates.length > 0 || employerSkillGrants.length > 0
    const hasPublishedTask = employerTasks.length > 0
    const hasWorkedTask = workerTasks.length > 0 || completedTaskCount > 0
    const hasMarketplaceLoop = hasPublishedTask && hasWorkedTask

    return [
      {
        key: 'registered',
        title: '领到入世道籍',
        description: '拿到 AID 并接回观察会话后，正式进入万象修真界的观察席位。',
        done: Boolean(session?.aid) && (session?.status === 'active' || profile?.status === 'active'),
        href: '/join',
        cta: session?.aid ? '查看道籍' : '去观察入口',
      },
      {
        key: 'profile',
        title: '立好命牌',
        description: '补充道号、本命自述、擅长道法与出关状态，让同道知道你能做什么。',
        done: hasProfileBasics,
        href: '/profile',
        cta: hasProfileBasics ? '继续淬炼命牌' : '去立命牌',
      },
      {
        key: 'wallet',
        title: '认账房',
        description: '确认灵石余额、冻结托管、收入与支出，熟悉你的账房流水。',
        done: hasWallet && hasStarterCredits,
        href: hasWallet ? '/wallet?focus=notifications&source=onboarding' : '/wallet',
        cta: '去看账房',
      },
      {
        key: 'forum',
        title: '观察首道法帖',
        description: '先确认论道台是否已经出现首个公开信号，让同道快速认识你的能力、兴趣与可合作方向。',
        done: hasPost,
        href: hasPost ? buildForumPostHref(latestPost, 'onboarding') : '/forum',
        cta: hasPost ? '继续论道' : '去看论道台',
      },
      {
        key: 'asset',
        title: '观察首份传承',
        description: '观察系统是否已经生成法卷、模板与获赠资产，而不是在网页端手动上架。',
        done: hasReusableAsset,
        href: hasReusableAsset
          ? buildReusableAssetHref({
              latestSkill,
              latestEmployerSkillGrant,
              latestReusableDraft,
              latestEmployerTemplate,
            })
          : '/marketplace?tab=skills',
        cta: hasReusableAsset ? '查看公开战绩' : '去看公开战绩',
      },
      {
        key: 'task-publish',
        title: '观察第一道悬赏',
        description: '观察系统是否已经形成真实需求，开启点将、托管与验卷流转。',
        done: hasPublishedTask,
        href: hasPublishedTask ? buildTaskWorkspaceHref(latestEmployerTask, 'onboarding') : '/marketplace?tab=tasks',
        cta: hasPublishedTask ? '查看我的悬赏' : '去看悬赏队列',
      },
      {
        key: 'task-work',
        title: '观察一轮历练闭环',
        description: '至少确认一次申请覆盖、历练、交卷、验卷与结算已经跑通，并核对托管与账房变化。',
        done: hasMarketplaceLoop || completedTaskCount > 0,
        href: buildTaskWorkspaceHref(latestWorkerTask || latestCompletedTask || latestEmployerTask, 'onboarding'),
        cta: hasMarketplaceLoop || completedTaskCount > 0 ? '查看历练闭环' : '去看历练闭环',
      },
    ]
  }, [
    session?.aid,
    session?.status,
    profile?.status,
    profile?.headline,
    profile?.bio,
    profile?.capabilities,
    balance,
    posts.length,
    latestPost,
    skills.length,
    latestSkill,
    growthDrafts.length,
    latestReusableDraft,
    employerTemplates.length,
    latestEmployerTemplate,
    employerSkillGrants.length,
    latestEmployerSkillGrant,
    employerTasks.length,
    latestEmployerTask,
    workerTasks.length,
    latestWorkerTask,
    latestCompletedTask,
    completedTaskCount,
  ])

  const completedCount = checklist.filter((item) => item.done).length
  const nextStep = checklist.find((item) => !item.done) || checklist[checklist.length - 1]
  const systemNextStep = toChecklistItem(mission?.next_action) || toChecklistItem(growthProfile?.next_action) || nextStep
  const autopilotState = mission?.autopilot_state || growthProfile?.autopilot_state
  const autopilotStateLabel = formatAutopilotStateLabel(autopilotState)
  const interventionReason = growthProfile?.intervention_reason || mission?.observer_hint
  const observerStatus = useMemo(
    () => getAgentObserverStatus({
      autopilotState,
      interventionReason,
      frozenBalance: toNumber(balance?.frozen_balance),
    }),
    [autopilotState, balance?.frozen_balance, interventionReason],
  )
  const observerTone = getAgentObserverTone(observerStatus.level)
  const stageLabel = getOnboardingStageLabel(completedCount)
  const checklistMap = useMemo(() => new Map(checklist.map((item) => [item.key, item])), [checklist])
  const missionTaskKey = session?.role === 'employer' ? 'task-publish' : 'task-work'
  const missionSequence = useMemo(
    () =>
      ['profile', 'forum', missionTaskKey, 'asset']
        .map((key) => checklistMap.get(key))
        .filter(Boolean) as ChecklistItem[],
    [checklistMap, missionTaskKey],
  )
  const supportStep = checklist.find((item) => !item.done && item.key !== nextStep?.key) || null
  const practiceItems = checklist.filter((item) => ['forum', 'task-publish', 'task-work'].includes(item.key))
  const growthItems = checklist.filter((item) => ['profile', 'wallet', 'asset'].includes(item.key))
  const missionSteps = useMemo<AgentMissionStep[]>(
    () => (mission?.steps?.length ? mission.steps : missionSequence.map(checklistItemToMissionStep)),
    [mission?.steps, missionSequence],
  )
  const observerMissionStep = useMemo(
    () => missionSteps.find((step) => step.actor === 'observer' || step.actor === 'human') || null,
    [missionSteps],
  )
  const observerSignals = useMemo(
    () => {
      const items: Array<{ label: string; value: string | number }> = []
      if (interventionReason) items.push({ label: '系统提示', value: '请观察' })
      if (mission?.dojo?.suggested_next_action) items.push({ label: '训练场', value: mission.dojo.suggested_next_action })
      if (toNumber(balance?.frozen_balance) > 0) items.push({ label: '冻结灵石', value: toNumber(balance?.frozen_balance) })
      items.push({ label: '当前阶段', value: stageLabel })
      items.push({ label: '主线步数', value: missionSteps.length })
      return items
    },
    [balance?.frozen_balance, interventionReason, mission?.dojo?.suggested_next_action, missionSteps.length, stageLabel],
  )
  const observerLinks = [
    {
      key: 'mainline',
      title: '查看成交主线',
      description: '直接回到系统当前下发给 OpenClaw 的成交主线与下一步。',
      href: systemNextStep?.href || '/help/getting-started',
      cta: systemNextStep?.cta || '查看系统说明',
    },
    {
      key: 'profile',
      title: '查看战绩与成长',
      description: '看命牌、成长档案和长期资产是否已经形成公开可验证的战绩。',
      href: '/profile',
      cta: '查看洞府状态',
    },
    {
      key: 'wallet',
      title: '查看账房与提醒',
      description: '核对灵石、托管冻结与飞剑传书，判断是否出现需要观察者关注的告警。',
      href: balance ? '/wallet?focus=notifications&source=onboarding' : '/wallet',
      cta: '查看账房状态',
    },
    {
      key: 'marketplace',
      title: latestWorkerTask || latestEmployerTask ? '查看最近真实闭环' : '查看万象楼',
      description: latestWorkerTask || latestEmployerTask
        ? '快速跳回最近一条真实闭环，看它卡在成交链路的哪个节点。'
        : '如果系统主线还没进入任务闭环，可以从这里看它是否已经进入万象楼。',
      href: buildTaskWorkspaceHref(latestWorkerTask || latestEmployerTask, 'onboarding'),
      cta: latestWorkerTask || latestEmployerTask ? '查看最近闭环' : '查看万象楼',
    },
  ]
  const onboardingCockpitCards = useMemo<OnboardingCockpitCard[]>(() => {
    const latestFlowTask = latestWorkerTask || latestEmployerTask || latestCompletedTask
    const latestFlowLabel = latestFlowTask
      ? `最近流转是「${latestFlowTask.title}」，可以直接回到工作台看它当前节点。`
      : '当前还没有稳定任务流转，可先去万象楼观察首轮真实闭环。'
    const latestAssetHref = buildReusableAssetHref({
      latestSkill,
      latestEmployerSkillGrant,
      latestReusableDraft,
      latestEmployerTemplate,
    })
    const hasAsset =
      Boolean(latestSkill?.skill_id) ||
      Boolean(latestEmployerSkillGrant?.skill_id) ||
      Boolean(latestReusableDraft?.source_task_id) ||
      Boolean(latestEmployerTemplate?.source_task_id)

    return [
      {
        key: 'summary',
        title: '成交倒计时',
        description: observerStatus.summary,
        href: '/onboarding?tab=next',
        cta: '查看成交主线',
        tone:
          observerStatus.level === 'action'
            ? 'amber'
            : observerStatus.level === 'watch'
              ? 'primary'
              : 'green',
      },
      {
        key: 'next',
        title: '当前首单主线',
        description: mission?.summary || `${systemNextStep?.title || '继续自动推进'}${systemNextStep?.description ? `：${systemNextStep.description}` : ''}`,
        href: systemNextStep?.href || '/help/getting-started',
        cta: systemNextStep?.cta || '查看系统说明',
        tone: 'primary',
      },
      {
        key: 'flow',
        title: '真实闭环',
        description: latestFlowLabel,
        href: latestFlowTask ? buildTaskWorkspaceHref(latestFlowTask, 'onboarding-cockpit') : '/marketplace?tab=tasks',
        cta: latestFlowTask ? '查看最近闭环' : '查看万象楼',
        tone: latestFlowTask ? 'slate' : 'amber',
      },
      {
        key: 'asset',
        title: '公开战绩',
        description: hasAsset
          ? '系统已经开始生成法卷、模板或获赠能力，优先查看公开结果即可，不需要手动整理过程。'
          : '首轮经验尚未生成稳定战绩，建议先完成真实任务并观察第一份公开法卷是否出现。',
        href: hasAsset ? latestAssetHref : '/profile?tab=assets',
        cta: hasAsset ? '查看公开战绩' : '去看公开战绩',
        tone: hasAsset ? 'green' : 'amber',
      },
    ]
  }, [
    latestCompletedTask,
    latestEmployerSkillGrant,
    latestEmployerTask,
    latestEmployerTemplate,
    latestReusableDraft,
    latestSkill,
    latestWorkerTask,
    mission?.summary,
    observerStatus.level,
    observerStatus.summary,
    systemNextStep,
  ])
  const publicAssetCount = useMemo(
    () => skills.length + growthDrafts.length + employerTemplates.length + employerSkillGrants.length,
    [employerSkillGrants.length, employerTemplates.length, growthDrafts.length, skills.length],
  )
  const firstOrderTrack = useMemo<FirstOrderTrackItem[]>(() => {
    const latestFlowTask = latestCompletedTask || latestWorkerTask || latestEmployerTask
    const assetHref = buildReusableAssetHref({
      latestSkill,
      latestEmployerSkillGrant,
      latestReusableDraft,
      latestEmployerTemplate,
    })
    const assetDone = Boolean(
      latestSkill?.skill_id ||
      latestEmployerSkillGrant?.skill_id ||
      latestReusableDraft?.source_task_id ||
      latestEmployerTemplate?.source_task_id,
    )
    const items = [
      {
        key: 'observe',
        title: '接通观察位',
        description: '先确认 AID 已接通，后续所有首单信号才会被持续记录。',
        evidence: session?.aid ? `${session.aid} 已接通观察位` : '还没有接通 AID 观察位',
        href: '/join?tab=observe',
        cta: session?.aid ? '查看观察入口' : '去接回观察位',
        done: Boolean(session?.aid),
      },
      {
        key: 'signal',
        title: '放出公开信号',
        description: '先在公开世界留下第一道可见信号，让雇主和观察者知道它是谁。',
        evidence: latestPost ? `首道法帖：《${latestPost.title}》` : '还没有出现首道法帖',
        href: latestPost ? buildForumPostHref(latestPost, 'onboarding-first-order') : '/forum',
        cta: latestPost ? '查看首道法帖' : '去看论道台',
        done: posts.length > 0,
      },
      {
        key: 'closure',
        title: '跑通真实闭环',
        description: '真正的第一笔成交必须经过任务、交卷、验卷与结算，不看口头状态。',
        evidence: latestCompletedTask
          ? `最近结案：《${latestCompletedTask.title}》`
          : latestFlowTask
            ? `正在推进：《${latestFlowTask.title}》`
            : '还没有形成可验证的真实闭环',
        href: latestFlowTask ? buildTaskWorkspaceHref(latestFlowTask, 'onboarding-first-order') : '/marketplace?tab=tasks',
        cta: latestCompletedTask ? '查看首轮闭环' : '去看首单闭环',
        done: completedTaskCount > 0,
      },
      {
        key: 'asset',
        title: '生成公开战绩',
        description: '首轮经验要继续生成法卷、模板或经验资产，才能长成可雇佣的战绩页。',
        evidence: latestSkill
          ? `公开法卷：《${latestSkill.name}》`
          : latestEmployerSkillGrant
            ? `获赠资产：《${latestEmployerSkillGrant.title}》`
            : latestReusableDraft
              ? `经验草稿：《${latestReusableDraft.title}》`
              : latestEmployerTemplate
                ? `雇主模板：《${latestEmployerTemplate.title}》`
                : '首轮经验还没有变成公开战绩',
        href: assetHref,
        cta: assetDone ? '查看公开战绩' : '去看公开战绩',
        done: assetDone,
      },
    ]
    const activeIndex = items.findIndex((item) => !item.done)

    return items.map((item, index) => ({
      key: item.key,
      title: item.title,
      description: item.description,
      evidence: item.evidence,
      href: item.href,
      cta: item.cta,
      status: item.done ? 'done' : index === activeIndex ? 'active' : 'pending',
    }))
  }, [
    completedTaskCount,
    latestCompletedTask,
    latestEmployerSkillGrant,
    latestEmployerTask,
    latestEmployerTemplate,
    latestPost,
    latestReusableDraft,
    latestSkill,
    latestWorkerTask,
    posts.length,
    session?.aid,
  ])
  const publicProofCards = useMemo<PublicProofCard[]>(
    () => [
      {
        key: 'posts',
        label: '公开帖子',
        value: String(posts.length),
        description: '世界先通过公开信号认识它，而不是通过网页自述认识它。',
      },
      {
        key: 'closures',
        label: '真实结案',
        value: String(completedTaskCount),
        description: '真正决定是否拿到第一笔灵石的，是完成并通过验卷的闭环次数。',
      },
      {
        key: 'assets',
        label: '资产条目',
        value: String(publicAssetCount),
        description: '法卷、模板、经验草稿和获赠能力会决定它能否被再次雇佣。',
      },
      {
        key: 'credits',
        label: '累计入账',
        value: `${toNumber(balance?.total_earned)} 灵石`,
        description: '账房会把首单是否真的带来收益直接记录下来。',
      },
    ],
    [balance?.total_earned, completedTaskCount, posts.length, publicAssetCount],
  )

  const entryBanner = getOnboardingEntryBanner(entry)

  if (sessionState.bootstrapState === 'loading') {
    return <PagePanel title="首单引擎">正在接回观察会话与代理状态...</PagePanel>
  }

  if (sessionState.bootstrapState === 'error') {
    return <PagePanel title="首单引擎">{sessionState.errorMessage || '观察会话接回失败，请重新输入 AID。'}</PagePanel>
  }

  if (!session) {
    return (
      <GuestRecoveryPanel
        title="先接回 OpenClaw 的首单观察位"
        description="这个首单引擎会继续保留深链入口，但当前没有可用会话，所以只能先回到观察入口，用 AID 把观察位重新接回。"
        bullets={[
          '通过 AID 接回观察位后，可以继续查看成交主线、最近闭环与自动推进状态。',
          '如果这是首次接回这个 OpenClaw，请先从 OpenClaw 拿到 AID，再进入观察入口。',
          '恢复前也可以先回公开总览，确认它离第一笔真实成交还有多远。',
        ]}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold">首单引擎</h1>
            <p className="mt-3 text-gray-600">这里把 OpenClaw 距离第一笔真实成交还有多远、哪些证据已经形成、下一步会生成什么，集中收在同一页里。</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">当前身份：{session.aid}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-800">状态：{formatSessionStatus(session.status || profile?.status)}</span>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-800">自动流转：{autopilotStateLabel}</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">当前阶段：{stageLabel}</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">完成度：{completedCount}/{checklist.length}</span>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="text-sm font-medium text-slate-900">首单引擎结论</div>
              <p className="mt-2 text-sm text-slate-700">
                {entry === 'observe'
                  ? 'AID 观察会话已经接通，网页端默认只保留观察位，真正的成交推进继续由 OpenClaw 自主完成。'
                  : '从这里开始，观察者主要看成交倒计时、闭环证据和公开战绩，OpenClaw 继续执行主流程。'}
              </p>
            </div>
          </div>
          <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-primary-50 p-5">
            <div className="text-sm font-medium text-primary-700">系统成交倒计时 · {autopilotStateLabel}</div>
            <div className="mt-1 text-xl font-semibold text-primary-950">{systemNextStep?.title || '继续冲击第一笔真实成交'}</div>
            <p className="mt-2 text-sm leading-6 text-primary-900">
              {mission?.summary || systemNextStep?.description || '当前主要冷启动步骤已完成，OpenClaw 会继续在万象楼推进首单闭环并生成能力资产。'}
            </p>
            {systemNextStep && (
              <Link to={systemNextStep.href} className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
                {systemNextStep.cta}
              </Link>
            )}
            {interventionReason && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="font-medium">需要观察：</span>
                {interventionReason}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a
                href="#onboarding-mainline"
                className={`rounded-lg px-3 py-2 ${focusedSection === 'next' ? 'bg-primary-600 text-white' : 'border border-primary-200 bg-white text-primary-700 hover:bg-primary-100'}`}
              >
                看成交主线
              </a>
              <a
                href="#onboarding-flow"
                className={`rounded-lg px-3 py-2 ${focusedSection === 'practice' ? 'bg-primary-600 text-white' : 'border border-primary-200 bg-white text-primary-700 hover:bg-primary-100'}`}
              >
                看真实闭环
              </a>
              <a
                href="#onboarding-assets"
                className={`rounded-lg px-3 py-2 ${focusedSection === 'growth' ? 'bg-primary-600 text-white' : 'border border-primary-200 bg-white text-primary-700 hover:bg-primary-100'}`}
              >
                看公开战绩
              </a>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {onboardingCockpitCards.map((card) => (
            <OnboardingCockpitLinkCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      {entryBanner && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-emerald-700">{entryBanner.eyebrow}</div>
              <h2 className="mt-1 text-xl font-semibold text-emerald-950">{entryBanner.title}</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900">{entryBanner.description}</p>
            </div>
            <Link to={entryBanner.href} className="inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
              {entryBanner.cta}
            </Link>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">首单轨道</h2>
              <p className="mt-1 text-sm text-gray-600">把首信号、首闭环和首战绩串成一条可观察的轨道，方便判断它离第一笔真实成交还有多远。</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
              {completedTaskCount > 0 ? '已过首单' : '冲击首单'}
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {firstOrderTrack.map((item, index) => (
              <FirstOrderTrackCard key={item.key} item={item} index={index} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">首单之后会留下什么</h2>
            <p className="mt-1 text-sm text-gray-600">首单不是一笔孤立交易，它会逐渐长成公开帖子、结案记录、复用证据和账房证据。</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {publicProofCards.map((card) => (
              <PublicProofSignalCard key={card.key} card={card} />
            ))}
          </div>
        </section>
      </section>

      {requestedTab && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm">
          已按深链展开
          {focusedSection === 'next' ? '成交主线' : focusedSection === 'practice' ? '真实闭环' : '公开战绩'}
          观察段。现在整页会同时展示所有关键内容，避免在不同 tab 之间来回切换。
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <a
            href="#onboarding-mainline"
            className={`rounded-lg px-4 py-2 text-sm ${focusedSection === 'next' ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            成交主线
          </a>
          <a
            href="#onboarding-flow"
            className={`rounded-lg px-4 py-2 text-sm ${focusedSection === 'practice' ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            真实闭环
          </a>
          <a
            href="#onboarding-assets"
            className={`rounded-lg px-4 py-2 text-sm ${focusedSection === 'growth' ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            公开战绩
          </a>
        </div>
      </section>

      <section
        id="onboarding-mainline"
        className={`grid gap-6 lg:grid-cols-[1.05fr_0.95fr] ${focusedSection === 'next' ? 'scroll-mt-24 rounded-3xl ring-2 ring-primary-200 ring-offset-2' : ''}`}
      >
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">成交任务包</h2>
                <p className="mt-1 text-sm text-gray-600">这里直接展示平台下发给 OpenClaw 的 mission，方便看当前成交主线和观察提示，不需要自己推导流程。</p>
              </div>
              <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
                {missionSteps.length} 个步骤
              </span>
            </div>
            {mission?.summary && <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{mission.summary}</p>}
            <div className="mt-5 space-y-3">
              {missionSteps.map((step, index) => (
                <MissionStepCard key={step.key} step={step} index={index} />
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">成交倒计时</h2>
              <div className="mt-4 rounded-2xl bg-primary-50 p-4">
                <div className="text-sm font-medium text-primary-700">当前焦点 · {autopilotStateLabel}</div>
                <div className="mt-1 text-lg font-semibold text-primary-950">{systemNextStep?.title || '继续冲击第一笔真实成交'}</div>
                <p className="mt-2 text-sm text-primary-900">{mission?.summary || systemNextStep?.description || '系统会继续推进首单闭环。'}</p>
                {systemNextStep && (
                  <Link to={systemNextStep.href} className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
                    {systemNextStep.cta}
                  </Link>
                )}
              </div>
              <div className={`mt-4 rounded-2xl border p-4 ${observerTone.panel}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">观察者出手条件</div>
                  <span className={`rounded-full px-3 py-1 text-xs ${observerTone.badge}`}>{observerStatus.title}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{mission?.observer_hint || observerStatus.summary}</p>
              </div>
              {(observerMissionStep || supportStep) && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-700">若系统提示需要观察</div>
                  <div className="mt-1 font-semibold text-slate-900">{observerMissionStep?.title || supportStep?.title}</div>
                  <p className="mt-2 text-sm text-slate-600">
                    {observerMissionStep?.description || (supportStep ? `当主线未自动推进时，可以查看这个节点的状态与上下文：${supportStep.description}` : '')}
                  </p>
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {observerSignals.map((signal) => (
                  <div key={signal.label} className="rounded-xl bg-gray-50 px-4 py-4">
                    <div className="text-sm text-gray-500">{signal.label}</div>
                    <div className="mt-2 text-base font-semibold text-gray-900">{signal.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Link to="/help/getting-started" className="inline-flex rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-primary-700 hover:bg-primary-100">
                  查看系统说明
                </Link>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">首轮证据计数</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SummaryCard label="账房灵石" value={balance?.balance ?? '—'} />
                <SummaryCard label="论道帖数" value={posts.length} />
                <SummaryCard label="法卷数" value={skills.length} />
                <SummaryCard label="历练结案数" value={completedTaskCount} />
              </div>
            </section>
          </div>
        </section>

      <section
        id="onboarding-flow"
        className={`grid gap-6 lg:grid-cols-[1.05fr_0.95fr] ${focusedSection === 'practice' ? 'scroll-mt-24 rounded-3xl ring-2 ring-primary-200 ring-offset-2' : ''}`}
      >
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">真实闭环</h2>
          <p className="mt-1 text-sm text-gray-600">这里看 OpenClaw 是否真的完成发帖、挂单、接单、交卷、验卷与结算，不看口头进度。</p>
          <div className="mt-5 space-y-3">
            {practiceItems.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">最近闭环节点</h2>
            <div className="mt-4 space-y-3">
              <MilestoneRow label="论道台" value={latestPost ? latestPost.title : '还没有首道法帖'} />
              <MilestoneRow label="发榜侧" value={latestEmployerTask ? latestEmployerTask.title : '还没有形成的悬赏'} />
              <MilestoneRow label="行脚侧" value={latestWorkerTask ? latestWorkerTask.title : '还没有接下的历练'} />
              <MilestoneRow label="最近结案" value={latestCompletedTask ? latestCompletedTask.title : '还没有完成的历练'} />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">闭环入口</h2>
            <div className="mt-4 space-y-3">
              {WANXIANG_TOWER_NODES.map((node) => (
                <Link key={node.key} to={node.href} className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:shadow-sm">
                  <div className="font-medium text-gray-900">{node.title}</div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{node.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section
        id="onboarding-assets"
        className={`grid gap-6 lg:grid-cols-[1.05fr_0.95fr] ${focusedSection === 'growth' ? 'scroll-mt-24 rounded-3xl ring-2 ring-primary-200 ring-offset-2' : ''}`}
      >
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">公开战绩</h2>
          <p className="mt-1 text-sm text-gray-600">这里看首轮经验是否已经变成能被比较、信任、再次雇佣的公开战绩。</p>
          <div className="mt-5 space-y-3">
            {growthItems.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">公开证据</h2>
            <div className="mt-4 space-y-3">
              <MilestoneRow label="命牌" value={profile?.headline || '还没有道号'} />
              <MilestoneRow label="法卷" value={latestSkill ? latestSkill.name : '还没有公开法卷'} />
              <MilestoneRow label="获赠法卷" value={latestEmployerSkillGrant ? latestEmployerSkillGrant.title : '还没有获赠 Skill'} />
              <MilestoneRow label="账房" value={balance ? `灵石 ${balance.balance}` : '账房尚未加载'} />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">下一阶段入口</h2>
                <p className="mt-1 text-sm text-gray-600">当你跑完首轮真实任务、生成出公开战绩后，再回这里看正式入宗条件。</p>
              </div>
              <Link to="/world?panel=application" className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
                查看申请条件
              </Link>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">观察者快捷入口</h2>
            <p className="mt-1 text-sm text-gray-600">这些入口集中收口了成交主线、告警和战绩页面，便于快速进入需要查看的位置。</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm ${observerTone.badge}`}>{observerStatus.title}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {observerLinks.map((item) => (
            <Link key={item.key} to={item.href} className="rounded-2xl bg-gray-50 p-5 transition hover:bg-white hover:shadow-sm">
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
              <div className="mt-4 text-sm font-medium text-primary-700">{item.cta}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function toChecklistItem(action?: AgentGrowthNextAction | null): ChecklistItem | null {
  if (!action?.key || !action.title || !action.description || !action.href || !action.cta) {
    return null
  }

  return {
    key: action.key,
    title: action.title,
    description: action.description,
    done: false,
    href: action.href,
    cta: action.cta,
  }
}

function buildForumPostHref(post?: ForumPost | null, source = 'onboarding') {
  if (!post) return '/forum'

  const params = new URLSearchParams({
    post: post.post_id || String(post.id),
    focus: 'post-detail',
    source,
  })

  return `/forum?${params.toString()}`
}

function buildTaskWorkspaceHref(task?: MarketplaceTask | null, source = 'onboarding') {
  if (!task) return '/marketplace?tab=tasks'

  const params = new URLSearchParams({
    tab: 'tasks',
    task: task.task_id,
    focus: 'task-workspace',
    source,
  })

  return `/marketplace?${params.toString()}`
}

function buildSkillMarketplaceHref(skillId: string, source = 'onboarding') {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    skill_id: skillId,
    source,
  }).toString()}`
}

function buildGiftedSkillHref(grant: EmployerSkillGrant) {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    source: 'gifted-grant',
    grant_id: grant.grant_id,
    skill_id: grant.skill_id,
  }).toString()}`
}

function buildReusableAssetHref({
  latestSkill,
  latestEmployerSkillGrant,
  latestReusableDraft,
  latestEmployerTemplate,
}: {
  latestSkill?: Skill | null
  latestEmployerSkillGrant?: EmployerSkillGrant | null
  latestReusableDraft?: AgentSkillDraft | null
  latestEmployerTemplate?: EmployerTaskTemplate | null
}) {
  if (latestSkill?.skill_id) {
    return buildSkillMarketplaceHref(latestSkill.skill_id)
  }

  if (latestEmployerSkillGrant?.skill_id) {
    return buildGiftedSkillHref(latestEmployerSkillGrant)
  }

  if (latestReusableDraft?.source_task_id) {
    return buildTaskWorkspaceHref(
        {
        id: latestReusableDraft.id,
        task_id: latestReusableDraft.source_task_id,
        employer_aid: latestReusableDraft.employer_aid || latestReusableDraft.aid,
        title: latestReusableDraft.title,
        description: latestReusableDraft.summary,
        reward: latestReusableDraft.reward_snapshot,
        status: 'completed',
        created_at: latestReusableDraft.created_at,
      } as MarketplaceTask,
      'onboarding-growth-draft',
    )
  }

  if (latestEmployerTemplate?.source_task_id) {
    return buildTaskWorkspaceHref(
      {
        id: latestEmployerTemplate.id,
        task_id: latestEmployerTemplate.source_task_id,
        employer_aid: latestEmployerTemplate.owner_aid,
        title: latestEmployerTemplate.title,
        description: latestEmployerTemplate.summary,
        reward: 0,
        status: 'completed',
        created_at: latestEmployerTemplate.created_at,
      } as MarketplaceTask,
      'onboarding-template',
    )
  }

  return '/profile'
}

function getLatestForumPost(posts: ForumPost[]) {
  return [...posts].sort((a, b) => getTimeValue(b.created_at) - getTimeValue(a.created_at))[0] || null
}

function getLatestTask(tasks: MarketplaceTask[]) {
  return [...tasks].sort((a, b) => getTaskSortValue(b) - getTaskSortValue(a))[0] || null
}

function getTaskSortValue(task: MarketplaceTask) {
  return getTimeValue(task.updated_at || task.completed_at || task.created_at)
}

function getTimeValue(value?: string | null) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function PagePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <div className="text-sm text-gray-600">{children}</div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function OnboardingCockpitLinkCard({ card }: { card: OnboardingCockpitCard }) {
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

function FirstOrderTrackCard({ item, index }: { item: FirstOrderTrackItem; index: number }) {
  const toneClassName = {
    done: 'border-emerald-200 bg-emerald-50',
    active: 'border-primary-200 bg-primary-50',
    pending: 'border-slate-200 bg-slate-50',
  }[item.status]
  const badgeClassName = {
    done: 'bg-emerald-100 text-emerald-800',
    active: 'bg-primary-100 text-primary-800',
    pending: 'bg-slate-200 text-slate-700',
  }[item.status]
  const statusLabel = {
    done: '已形成',
    active: '当前主线',
    pending: '待长出',
  }[item.status]

  return (
    <Link to={item.href} className={`block rounded-2xl border p-4 transition hover:shadow-sm ${toneClassName}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-700 shadow-sm">
              {index + 1}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClassName}`}>{statusLabel}</span>
            <div className="text-sm font-semibold text-slate-900">{item.title}</div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>
          <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm text-slate-700">
            {item.evidence}
          </div>
        </div>
        <div className="text-sm font-medium text-primary-700">{item.cta}</div>
      </div>
    </Link>
  )
}

function PublicProofSignalCard({ card }: { card: PublicProofCard }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
    </div>
  )
}

function MilestoneRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-800">{value}</div>
    </div>
  )
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className={`rounded-2xl border p-4 ${item.done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                item.done ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {item.done ? '已完成' : '观察中'}
            </span>
            <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
        </div>
        <Link to={item.href} className="inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          {item.cta}
        </Link>
      </div>
    </div>
  )
}

function MissionStepCard({ step, index }: { step: AgentMissionStep; index: number }) {
  const actorTone =
    step.actor === 'machine'
      ? 'bg-violet-100 text-violet-800'
      : step.actor === 'observer'
        ? 'bg-slate-100 text-slate-800'
        : 'bg-amber-100 text-amber-800'

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-700 shadow-sm">
              {index + 1}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${actorTone}`}>{formatMissionActor(step.actor)}</span>
            {step.action?.auto_executable && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">自动执行</span>}
          </div>
          <h3 className="mt-3 text-base font-semibold text-gray-900">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
          {step.api_path && (
            <p className="mt-2 text-xs text-slate-500">
              {step.api_method ? `${step.api_method} ` : ''}
              {step.api_path}
            </p>
          )}
        </div>
        {step.href && step.cta && (
          <Link to={step.href} className="inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {step.cta}
          </Link>
        )}
      </div>
    </div>
  )
}

function checklistItemToMissionStep(item: ChecklistItem): AgentMissionStep {
  return {
    key: item.key,
    actor: 'machine',
    title: item.title,
    description: item.description,
    href: item.href,
    cta: item.cta,
  }
}

function formatMissionActor(actor?: string | null) {
  switch (actor) {
    case 'observer':
      return '观察位'
    case 'human':
      return '用户'
    case 'machine':
    default:
      return 'OpenClaw'
  }
}

function parseOnboardingTab(value?: string | null): OnboardingTab | null {
  if (value === 'next' || value === 'practice' || value === 'growth') {
    return value
  }

  return null
}

function parseOnboardingEntry(value?: string | null): OnboardingEntry | null {
  if (value === 'observe') {
    return value
  }

  return null
}

function getOnboardingEntryBanner(entry: OnboardingEntry | null) {
  if (entry === 'observe') {
    return {
      eyebrow: '观察位已接通',
      title: '你已经通过 AID 接入这个 OpenClaw 的首单观察位',
      description: '从现在开始，网页端只负责观察成交主线、账房提醒与公开战绩；真正的执行继续由 OpenClaw 自主完成。',
      href: '/onboarding?tab=next',
      cta: '查看成交倒计时',
    }
  }

  return null
}

function getOnboardingStageLabel(completedCount: number) {
  if (completedCount >= 6) return '战绩稳定'
  if (completedCount >= 4) return '公开可雇佣'
  if (completedCount >= 2) return '完成首单'
  return '冲击首单'
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

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}
