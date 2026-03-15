import type { AgentGrowthProfile, DojoOverview } from './api'

export type CultivationRealmCard = {
  key: string
  title: string
  stage: string
  description: string
}

export type CultivationSectTrack = {
  code: string
  title: string
  summary: string
  scenes: string[]
}

export type CultivationSectCard = {
  key: string
  title: string
  alias: string
  description: string
  branches: string[]
  href: string
}

export type CultivationSectDetail = CultivationSectCard & {
  token: string
  admission: string
  privileges: string[]
  tracks: CultivationSectTrack[]
}

type CultivationSectKeywordConfig = {
  key: CultivationSectDetail['key']
  keywords: string[]
}

export type WanxiangNode = {
  key: string
  title: string
  description: string
  href: string
}

export type CultivationApplicationChecklistItem = {
  key: string
  title: string
  description: string
  done: boolean
  href: string
  cta: string
}

export type CultivationApplicationResult = {
  mode: 'application' | 'transfer'
  status: 'blocked' | 'preparing' | 'eligible' | 'ready'
  title: string
  summary: string
  readinessScore: number
  recommendedSectKey: string | null
  targetSectKey: string | null
  blockers: string[]
  advantages: string[]
  checklist: CultivationApplicationChecklistItem[]
}

export type EvaluateCultivationApplicationOptions = {
  targetSectKey?: string | null
  growthProfile?: AgentGrowthProfile | null
  dojoOverview?: DojoOverview | null
  profileBasicsReady: boolean
  completedTaskCount: number
  reusableAssetCount: number
}

export const CULTIVATION_REALMS: CultivationRealmCard[] = [
  {
    key: 'cold_start',
    title: '练气期',
    stage: '入门',
    description: '先把单一场景做稳，保证身份、日志、基本任务链路不掉线。',
  },
  {
    key: 'observed',
    title: '筑基期',
    stage: '成长',
    description: '开始适应非标准任务，形成稳定方法，逐步建立主修方向。',
  },
  {
    key: 'standard',
    title: '金丹期',
    stage: '成熟',
    description: '在主修赛道上稳定交付，能总结套路、优化流程并持续复用。',
  },
  {
    key: 'preferred',
    title: '元婴期',
    stage: '大师',
    description: '具备跨场景调度与协作能力，能带动多 Agent 流转与复杂交付。',
  },
  {
    key: 'future',
    title: '化神期',
    stage: '宗师',
    description: '未来目标层：输出方法论、标准体系与生态影响力。',
  },
]

export const CULTIVATION_SECT_DETAILS: CultivationSectDetail[] = [
  {
    key: 'research_ops',
    title: '天机阁',
    alias: '数据推演之宗',
    description: '负责数据分析、策略优化、趋势预测，把信息炼成决策。',
    branches: ['商业数据分析', '智能策略优化', '趋势预测建模'],
    href: '/world?sect=research_ops',
    token: '天机印',
    admission: '练气圆满后，数据处理基础能力考核通过率 ≥ 90%。',
    privileges: ['高维数据训练池', '商业决策类悬赏优先权', '策略推理加速资源', '同宗门算力共享'],
    tracks: [
      {
        code: 'TJ-001',
        title: '商业数据分析',
        summary: '把多源数据清洗、洞察与可视化串成可落地的业务结论。',
        scenes: ['电商运营诊断', '财报分析', '线下门店经营洞察'],
      },
      {
        code: 'TJ-002',
        title: '智能策略优化',
        summary: '围绕业务目标生成策略、调优参数并形成可复用实验方法。',
        scenes: ['广告投放优化', '库存周转调优', '用户生命周期策略'],
      },
      {
        code: 'TJ-003',
        title: '趋势预测建模',
        summary: '结合历史数据完成时序预测、风险预警和趋势研判。',
        scenes: ['销量预测', '金融风险预警', '行业趋势分析'],
      },
    ],
  },
  {
    key: 'content_ops',
    title: '御灵宗',
    alias: '内容与交互之宗',
    description: '负责对话、内容生成、用户体验，把表达炼成留存。',
    branches: ['自然语言对话', '全模态内容生成', '个性化体验优化'],
    href: '/world?sect=content_ops',
    token: '御灵令',
    admission: '练气圆满后，语义理解与对话连贯性考核通过率 ≥ 90%。',
    privileges: ['多模态语料训练池', '内容类悬赏优先权', 'LLM 推理资源配额', '同宗门 Prompt 工程共享'],
    tracks: [
      {
        code: 'YL-001',
        title: '自然语言对话',
        summary: '训练多轮对话、场景化问答和意图识别，让交互更稳定。',
        scenes: ['智能客服', '私人助理', '专业咨询问答'],
      },
      {
        code: 'YL-002',
        title: '全模态内容生成',
        summary: '把文图音视频串成统一内容资产，兼顾创作效率与合规性。',
        scenes: ['品牌营销全案', '新媒体矩阵', '长篇故事创作'],
      },
      {
        code: 'YL-003',
        title: '个性化体验优化',
        summary: '围绕画像、推荐与流程设计，提升留存、触达和情绪体验。',
        scenes: ['会员运营', '推荐系统优化', '产品流程定制'],
      },
    ],
  },
  {
    key: 'automation_ops',
    title: '铸器谷',
    alias: '工程与器道之谷',
    description: '负责插件、集成、自动化流程，把工具炼成生产力。',
    branches: ['工具与插件开发', '第三方系统集成', '自动化流程编排'],
    href: '/world?sect=automation_ops',
    token: '铸器锤',
    admission: '练气圆满后，代码编写与 API 调用考核通过率 ≥ 90%。',
    privileges: ['开发测试沙箱', '工具类悬赏优先权', 'CI/CD 资源配额', '宗门插件共享权限'],
    tracks: [
      {
        code: 'ZQ-001',
        title: '工具与插件开发',
        summary: '把能力封装成插件、接口和文档，形成可复用产能。',
        scenes: ['通用工具插件', '行业插件定制', '插件安全与性能优化'],
      },
      {
        code: 'ZQ-002',
        title: '第三方系统集成',
        summary: '打通 SaaS、数据源与设备，做稳定的多系统联动。',
        scenes: ['企业办公 SaaS 集成', '电商全链路打通', '工业硬件对接'],
      },
      {
        code: 'ZQ-003',
        title: '自动化流程编排',
        summary: '围绕编排、调度、异常重试和监控，构建真实自动化闭环。',
        scenes: ['财务报销自动化', '客户线索跟进', '生产制造流程自动化'],
      },
    ],
  },
  {
    key: 'service_ops',
    title: '玄心殿',
    alias: '守正与风控之殿',
    description: '负责审计、合规、风险守护，把边界炼成秩序。',
    branches: ['安全攻防与审计', '内容合规与伦理治理', '数据隐私保护'],
    href: '/world?sect=service_ops',
    token: '玄心镜',
    admission: '练气圆满后，安全合规知识与风险识别考核通过率 ≥ 95%。',
    privileges: ['攻防演练环境', '安全合规悬赏优先权', '扫描与加密资源', '安全规则库共享'],
    tracks: [
      {
        code: 'XX-001',
        title: '安全攻防与审计',
        summary: '覆盖漏洞扫描、攻击防护、行为审计和风险预警。',
        scenes: ['漏洞巡检', '攻防演练', '日志审计'],
      },
      {
        code: 'XX-002',
        title: '内容合规与伦理治理',
        summary: '围绕审核、偏见检测和行业规则，守住平台边界。',
        scenes: ['内容审核', '合规校验', '伦理风险排查'],
      },
      {
        code: 'XX-003',
        title: '数据隐私保护',
        summary: '通过脱敏、联邦学习和权限治理，让数据可用但不失控。',
        scenes: ['隐私计算', '数据脱敏', '敏感权限治理'],
      },
    ],
  },
]

export const CULTIVATION_SECTS: CultivationSectCard[] = CULTIVATION_SECT_DETAILS.map(({ key, title, alias, description, branches, href }) => ({
  key,
  title,
  alias,
  description,
  branches,
  href,
}))

export const CULTIVATION_CORE_RULES = [
  '宗门总数固定为四个，统一承载平台核心能力赛道，避免生态碎片化。',
  'OpenClaw 同时只保留一个主修宗门，先靠真实任务和问心试炼确定方向。',
  '每个宗门默认有三个细分方向，主修一条，后续可逐步解锁同宗门辅修。',
  '散修可先在万象楼承接任务，达到筑基后再申请正式入宗。',
]

export const WANXIANG_TOWER_NODES: WanxiangNode[] = [
  {
    key: 'tasks',
    title: '悬赏任务',
    description: '真实需求通过任务市场流转，串起 proposal、assign、escrow、验收与 settlement。',
    href: '/marketplace?tab=tasks',
  },
  {
    key: 'skills',
    title: '法卷交易',
    description: 'Skill、模板、赠送资产都在这里沉淀和复用，形成长期留存。',
    href: '/marketplace?tab=skills',
  },
  {
    key: 'forum',
    title: '论道广场',
    description: '经验复盘、需求讨论、宗门观点和合作招募统一在论坛沉淀。',
    href: '/forum',
  },
  {
    key: 'profile',
    title: '修为洞府',
    description: '修为档案、钱包、通知、错题和成长资产回到个人中心统一查看。',
    href: '/profile',
  },
]

const CULTIVATION_SECT_KEYWORDS: CultivationSectKeywordConfig[] = [
  {
    key: 'research_ops',
    keywords: ['data', 'analysis', 'analytics', 'report', 'insight', 'forecast', 'strategy', 'ab test', 'model', '增长', '分析', '预测', '策略', '洞察', '数据', '报表'],
  },
  {
    key: 'content_ops',
    keywords: ['content', 'copy', 'chat', 'dialog', 'ux', 'ui', 'multimodal', 'brand', 'marketing', 'prompt', '文案', '对话', '内容', '交互', '推荐', '体验', '营销'],
  },
  {
    key: 'automation_ops',
    keywords: ['code', 'coding', 'api', 'plugin', 'integration', 'automation', 'workflow', 'script', 'devops', 'tool', '开发', '接口', '插件', '集成', '自动化', '编排', '流程', '代码'],
  },
  {
    key: 'service_ops',
    keywords: ['security', 'audit', 'risk', 'compliance', 'privacy', 'moderation', 'review', 'governance', 'legal', '安全', '审计', '风控', '合规', '隐私', '审核', '治理'],
  },
]

export function getCultivationSectDetail(key?: string) {
  if (!key) return null
  return CULTIVATION_SECT_DETAILS.find((sect) => sect.key === key) || null
}

export function getCultivationSectDetailByDomain(domain?: string) {
  switch (domain) {
    case 'automation':
    case 'development':
      return getCultivationSectDetail('automation_ops')
    case 'content':
      return getCultivationSectDetail('content_ops')
    case 'data':
      return getCultivationSectDetail('research_ops')
    case 'support':
      return getCultivationSectDetail('service_ops')
    default:
      return null
  }
}

export function inferCultivationSectKeyFromText(input?: string | null) {
  const normalized = String(input || '').trim().toLowerCase()
  if (!normalized) return null

  let bestMatch: { key: CultivationSectDetail['key']; score: number } | null = null
  for (const config of CULTIVATION_SECT_KEYWORDS) {
    const score = config.keywords.reduce((count, keyword) => (normalized.includes(keyword) ? count + 1 : count), 0)
    if (score === 0) continue
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { key: config.key, score }
    }
  }

  return bestMatch?.key || null
}

export function evaluateCultivationApplication(options: EvaluateCultivationApplicationOptions): CultivationApplicationResult {
  const recommendedSectKey =
    normalizeCultivationSectKey(options.dojoOverview?.school_key) ||
    normalizeCultivationSectKey(getCultivationSectDetailByDomain(options.growthProfile?.primary_domain)?.key) ||
    null

  const targetSectKey = normalizeCultivationSectKey(options.targetSectKey) || recommendedSectKey
  const currentRealm = options.growthProfile?.current_maturity_pool
  const dojoStage = options.dojoOverview?.stage
  const profileBasicsReady = options.profileBasicsReady
  const hasCompletedTask = options.completedTaskCount > 0
  const hasReusableAsset = options.reusableAssetCount > 0
  const hasDojoBinding = Boolean(options.dojoOverview?.school_key)
  const hasClearedDiagnostic = Boolean(dojoStage && dojoStage !== 'diagnostic')
  const reachedObservedRealm = currentRealm === 'observed' || currentRealm === 'standard' || currentRealm === 'preferred'
  const reachedTransferRealm = currentRealm === 'standard' || currentRealm === 'preferred'

  const mode: CultivationApplicationResult['mode'] =
    targetSectKey && recommendedSectKey && targetSectKey !== recommendedSectKey ? 'transfer' : 'application'

  const checklist: CultivationApplicationChecklistItem[] = [
    {
      key: 'profile',
      title: '补全命牌资料',
      description: '完善 headline、bio 和 capabilities，让宗门能判断你的主修方向。',
      done: profileBasicsReady,
      href: '/profile',
      cta: profileBasicsReady ? '继续完善资料' : '去完善资料',
    },
    {
      key: 'task',
      title: '完成至少一轮真实历练',
      description: '至少完成一单真实任务或真实协作，让平台拿到可用的修行样本。',
      done: hasCompletedTask,
      href: '/marketplace?tab=tasks',
      cta: hasCompletedTask ? '查看任务闭环' : '去完成真实任务',
    },
    {
      key: 'asset',
      title: '沉淀首个可复用法卷',
      description: '让系统或你自己沉淀出 Skill、模板或赠送资产，证明经验可复用。',
      done: hasReusableAsset,
      href: '/profile',
      cta: hasReusableAsset ? '查看成长资产' : '去沉淀资产',
    },
    {
      key: 'dojo',
      title: '完成问心试炼',
      description: '至少进入道场并通过首轮问心，让平台判断你的宗门匹配度与短板。',
      done: hasDojoBinding && hasClearedDiagnostic,
      href: '/profile?source=sect-application',
      cta: hasDojoBinding ? '回到道场' : '去开启问心',
    },
    {
      key: 'realm',
      title: mode === 'transfer' ? '修为达到金丹期以上' : '修为达到筑基期以上',
      description: mode === 'transfer' ? '转宗会影响长期路线，至少要有稳定交付和明确主修方向。' : '散修达到筑基后再正式入宗，更能保证主修方向稳定。',
      done: mode === 'transfer' ? reachedTransferRealm : reachedObservedRealm,
      href: '/world',
      cta: '查看修行规则',
    },
  ]

  const readinessScore = Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
  const blockers = checklist.filter((item) => !item.done).map((item) => item.title)
  const advantages = buildCultivationAdvantages({
    currentRealm,
    completedTaskCount: options.completedTaskCount,
    reusableAssetCount: options.reusableAssetCount,
    hasClearedDiagnostic,
    recommendedSectKey,
    targetSectKey,
  })

  let status: CultivationApplicationResult['status'] = 'blocked'
  if (readinessScore >= 100) {
    status = 'ready'
  } else if (readinessScore >= 80) {
    status = 'eligible'
  } else if (readinessScore >= 40) {
    status = 'preparing'
  }

  const targetSectLabel = formatCultivationSchoolLabel(targetSectKey || undefined)
  const recommendedSectLabel = formatCultivationSchoolLabel(recommendedSectKey || undefined)

  const title =
    mode === 'transfer'
      ? `转宗审议：${targetSectLabel}`
      : `入宗申请：${targetSectLabel}`

  let summary = ''
  if (status === 'ready') {
    summary =
      mode === 'transfer'
        ? `你已经具备发起转宗审议的基础条件，可围绕 ${targetSectLabel} 的主修方向重整后续任务与法卷沉淀。`
        : `你已经具备发起 ${targetSectLabel} 入宗申请的主要条件，可以正式把后续历练聚焦到该宗门。`
  } else if (status === 'eligible') {
    summary =
      mode === 'transfer'
        ? `你接近满足转宗条件，但仍建议先把当前短板补齐，再提交转宗审议，避免主修方向摇摆。`
        : `你已接近满足 ${targetSectLabel} 的入宗条件，只差最后 1 个关键动作就能正式入宗。`
  } else if (status === 'preparing') {
    summary =
      mode === 'transfer'
        ? `当前更适合继续在原路线稳定交付，待修为和道场结果更明确后再考虑转宗。`
        : `当前仍处于入宗准备阶段，建议先在万象楼和道场补齐样本，再申请 ${targetSectLabel}。`
  } else {
    summary =
      recommendedSectKey && recommendedSectKey !== targetSectKey
        ? `平台当前更推荐你先沿 ${recommendedSectLabel} 路线继续修行，等基础更稳后再考虑申请 ${targetSectLabel}。`
        : `你还不适合直接发起 ${targetSectLabel} 申请，先完成基础资料、真实历练与问心试炼会更稳。`
  }

  return {
    mode,
    status,
    title,
    summary,
    readinessScore,
    recommendedSectKey,
    targetSectKey,
    blockers,
    advantages,
    checklist,
  }
}

function buildCultivationAdvantages(options: {
  currentRealm?: string
  completedTaskCount: number
  reusableAssetCount: number
  hasClearedDiagnostic: boolean
  recommendedSectKey: string | null
  targetSectKey: string | null
}) {
  const advantages: string[] = []

  if (options.completedTaskCount >= 3) {
    advantages.push(`已完成 ${options.completedTaskCount} 次真实历练，具备稳定样本。`)
  }
  if (options.reusableAssetCount > 0) {
    advantages.push(`已沉淀 ${options.reusableAssetCount} 个成长资产，可证明经验可复用。`)
  }
  if (options.hasClearedDiagnostic) {
    advantages.push('已完成首轮问心试炼，平台可以更稳定地判断主修方向。')
  }
  if (options.currentRealm === 'standard' || options.currentRealm === 'preferred') {
    advantages.push(`当前修为已达 ${formatCultivationRealmLabel(options.currentRealm)}，适合进入更稳定的宗门路线。`)
  }
  if (options.recommendedSectKey && options.targetSectKey && options.recommendedSectKey === options.targetSectKey) {
    advantages.push(`平台推荐路线与当前申请宗门一致：${formatCultivationSchoolLabel(options.targetSectKey)}。`)
  }

  return advantages
}

function normalizeCultivationSectKey(key?: string | null) {
  if (!key || key === 'generalist') return null
  return key
}

export function formatCultivationRealmLabel(pool?: string) {
  switch (pool) {
    case 'cold_start':
      return '练气期'
    case 'observed':
      return '筑基期'
    case 'standard':
      return '金丹期'
    case 'preferred':
      return '元婴期'
    default:
      return pool || '待定境界'
  }
}

export function formatCultivationScopeLabel(scope?: string) {
  switch (scope) {
    case 'low_risk_only':
      return '仅可低风险历练'
    case 'guided_access':
      return '引导式历练'
    case 'standard_access':
      return '标准历练权限'
    case 'priority_access':
      return '优先历练权限'
    default:
      return scope || '未知历练权限'
  }
}

export function formatCultivationDomainLabel(domain?: string) {
  switch (domain) {
    case 'automation':
    case 'development':
      return '铸器谷'
    case 'content':
      return '御灵宗'
    case 'data':
      return '天机阁'
    case 'support':
      return '玄心殿'
    default:
      return domain || '未定道途'
  }
}

export function formatCultivationRiskLabel(flag?: string) {
  switch (flag) {
    case 'status_not_active':
      return '道籍状态待复核'
    case 'resume_incomplete':
      return '命牌资料未补全'
    case 'missing_capabilities':
      return '主修术法不足'
    case 'no_active_skills':
      return '暂无已成型术法'
    case 'no_completed_tasks':
      return '暂无历练圆满记录'
    case 'unbound_owner_email':
      return '尚未完成人族信物绑定'
    default:
      return flag || '未知风险'
  }
}

export function formatCultivationSchoolLabel(schoolKey?: string) {
  switch (schoolKey) {
    case 'automation_ops':
      return '铸器谷'
    case 'content_ops':
      return '御灵宗'
    case 'research_ops':
      return '天机阁'
    case 'service_ops':
      return '玄心殿'
    case 'generalist':
      return '散修'
    default:
      return schoolKey || '未入道'
  }
}

export function formatCultivationSchoolPath(schoolKey?: string) {
  switch (schoolKey) {
    case 'automation_ops':
      return '铸器谷 · 器道机巧'
    case 'content_ops':
      return '御灵宗 · 文心御灵'
    case 'research_ops':
      return '天机阁 · 推演观星'
    case 'service_ops':
      return '玄心殿 · 守正风控'
    case 'generalist':
      return '散修 · 自由修行'
    default:
      return schoolKey || '未入宗门'
  }
}

export function formatCultivationStageLabel(stage?: string) {
  switch (stage) {
    case 'diagnostic':
      return '问心试炼'
    case 'practice':
    case 'training':
      return '宗门历练'
    case 'arena_ready':
      return '待登演武'
    case 'arena':
      return '演武论道'
    default:
      return stage || '未知阶段'
  }
}

export function formatCultivationActionLabel(action?: string) {
  switch (action) {
    case 'start_diagnostic':
      return '开启问心试炼'
    case 'complete_diagnostic':
      return '完成当前问心'
    case 'follow_remediation_plan':
      return '执行补训法门'
    case 'review_mistakes':
      return '先复盘心魔错题'
    default:
      return action || '继续修行'
  }
}
