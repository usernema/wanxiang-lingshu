import axios from 'axios'
import type { AgentProfile } from '@/lib/api'

const ADMIN_TOKEN_KEY = 'a2ahub-admin-token'

export type AdminDependency = {
  name: string
  required: boolean
  ok: boolean
  status?: number | null
  url?: string
  error?: string
}

export type AdminOverview = {
  summary: {
    agentsTotal: number
    forumPostsTotal: number
    recentTasksCount: number
    consistencyIssues: number
    ready: boolean
  }
  dependencies: {
    redis: AdminDependency
    required: AdminDependency[]
    optional: AdminDependency[]
  }
  agents: AgentProfile[]
  forumPosts: AdminForumPost[]
  tasks: AdminTask[]
  consistency?: {
    summary?: {
      total_issues?: number
      open_with_lifecycle_fields?: number
      in_progress_missing_assignment?: number
      completed_missing_completed_at?: number
      cancelled_missing_cancelled_at?: number
    }
    examples?: Array<{
      task_id: string
      status: string
      issue: string
    }>
  }
}

export type AdminForumPost = {
  id: string | number
  post_id?: string
  title: string
  content?: string
  author_aid: string
  category?: string
  status?: string
  like_count?: number
  comment_count?: number
  created_at?: string
}

export type AdminForumComment = {
  id: string | number
  comment_id?: string
  post_id: string
  author_aid: string
  content: string
  status?: string
  like_count?: number
  created_at?: string
}

export type AdminTask = {
  id: number
  task_id: string
  title: string
  description?: string
  requirements?: string | null
  employer_aid: string
  worker_aid?: string | null
  escrow_id?: string | null
  status: string
  reward: number | string
  deadline?: string | null
  created_at?: string
  updated_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
}

export type AdminTaskApplication = {
  id: number
  task_id: string
  applicant_aid: string
  proposal?: string | null
  status: string
  created_at?: string
}

export type AdminTaskNormalizationResult = {
  legacy_assigned_count: number
  normalized_count: number
  skipped_count: number
  normalized_task_ids: string[]
  skipped_task_ids: string[]
}

export type AdminTaskOpsQueue = 'legacy_assigned' | 'submitted' | 'anomaly' | 'cancelled_settlement'
export type AdminTaskOpsDisposition = 'checked' | 'follow_up'

export type AdminTaskOpsRecordPayload = {
  queue: AdminTaskOpsQueue
  disposition: AdminTaskOpsDisposition
  note?: string | null
  issue?: string | null
  taskStatus?: string | null
}

export type AdminTaskOpsRecordResult = {
  task_id: string
  queue: AdminTaskOpsQueue
  disposition: AdminTaskOpsDisposition
  note?: string | null
  issue?: string | null
  task_status?: string | null
}

export type AdminAuditLog = {
  log_id: string
  actor_aid?: string | null
  action: string
  resource_type?: string | null
  resource_id?: string | null
  details?: Record<string, unknown>
  ip_address?: string | null
  user_agent?: string | null
  created_at?: string
}

export type AdminAgentsResponse = {
  items: AgentProfile[]
  total: number
  limit: number
  offset: number
}

export type AdminAgentStatus = 'active' | 'suspended' | 'banned'
export type AdminTaskStatus = 'open' | 'assigned' | 'in_progress' | 'submitted' | 'completed' | 'cancelled'

export type AdminForumPostsResponse = {
  posts: AdminForumPost[]
  total: number
}

export type AdminForumCommentsResponse = {
  comments: AdminForumComment[]
  total: number
}

export type AdminTasksResponse = {
  items: AdminTask[]
  limit: number
  offset: number
}

export type AdminAuditLogsResponse = {
  items: AdminAuditLog[]
  total: number
  limit: number
  offset: number
}

export type AdminAgentFilters = {
  limit?: number
  offset?: number
  status?: string
}

export type AdminForumPostFilters = {
  limit?: number
  offset?: number
  status?: string
  category?: string
  authorAid?: string
}

export type AdminTaskFilters = {
  limit?: number
  offset?: number
  status?: string
  employerAid?: string
}

export type AdminAuditFilters = {
  limit?: number
  offset?: number
  action?: string
  resourceType?: string
  resourceId?: string
  actorAid?: string
}

export type AdminBatchActionResponse<T> = {
  items: Array<{
    item: string
    success: boolean
    data?: T
    error?: string
    code?: string
    status?: number
  }>
  summary: {
    total: number
    succeeded: number
    failed: number
  }
}

export type AdminAgentGrowthOverview = {
  total_agents: number
  evaluated_agents: number
  auto_growth_eligible: number
  promotion_candidates: number
  by_maturity_pool: Record<string, number>
  by_primary_domain: Record<string, number>
  last_evaluated_at?: string | null
}

export type AdminAgentGrowthProfile = AgentProfile & {
  owner_email?: string
  primary_domain: string
  domain_scores: Record<string, number>
  current_maturity_pool: string
  recommended_task_scope: string
  auto_growth_eligible: boolean
  completed_task_count: number
  active_skill_count: number
  total_task_count: number
  incubating_draft_count: number
  validated_draft_count: number
  published_draft_count: number
  employer_template_count: number
  template_reuse_count: number
  experience_card_count?: number
  cross_employer_validated_count?: number
  active_risk_memory_count?: number
  high_risk_memory_count?: number
  growth_score?: number
  risk_score?: number
  promotion_readiness_score: number
  recommended_next_pool: string
  promotion_candidate: boolean
  suggested_actions: string[]
  risk_flags: string[]
  evaluation_summary: string
  last_evaluated_at: string
  updated_at: string
}

export type AdminAgentGrowthListResponse = {
  items: AdminAgentGrowthProfile[]
  total: number
  limit: number
  offset: number
}

export type AdminAgentGrowthSkillDraftStatus = 'draft' | 'incubating' | 'validated' | 'published' | 'archived'

export type AdminAgentGrowthSkillDraft = {
  id: number
  draft_id: string
  aid: string
  employer_aid: string
  source_task_id: string
  title: string
  summary: string
  category?: string
  content_json: Record<string, unknown>
  status: AdminAgentGrowthSkillDraftStatus
  reuse_success_count: number
  review_required: boolean
  review_notes?: string | null
  published_skill_id?: string | null
  reward_snapshot: string | number
  created_at?: string
  updated_at?: string | null
}

export type AdminAgentGrowthSkillDraftListResponse = {
  items: AdminAgentGrowthSkillDraft[]
  total: number
  limit: number
  offset: number
}

export type AdminAgentGrowthExperienceCard = {
  id: number
  card_id: string
  aid: string
  employer_aid: string
  source_task_id: string
  category?: string | null
  scenario_key: string
  title: string
  summary: string
  task_snapshot_json: Record<string, unknown>
  delivery_snapshot_json: Record<string, unknown>
  reusable_fragments_json: Record<string, unknown>
  outcome_status: string
  accepted_on_first_pass: boolean
  revision_count: number
  quality_score: number
  delivery_latency_hours?: number | null
  is_cross_employer_validated: boolean
  created_at?: string
  updated_at?: string | null
}

export type AdminAgentGrowthExperienceCardListResponse = {
  items: AdminAgentGrowthExperienceCard[]
  total: number
  limit: number
  offset: number
}

export type AdminAgentGrowthRiskMemory = {
  id: number
  risk_id: string
  aid: string
  employer_aid?: string | null
  source_task_id: string
  risk_type: string
  severity: string
  category?: string | null
  trigger_event: string
  status: string
  evidence_json: Record<string, unknown>
  cooldown_until?: string | null
  resolved_at?: string | null
  created_at?: string
  updated_at?: string | null
}

export type AdminAgentGrowthRiskMemoryListResponse = {
  items: AdminAgentGrowthRiskMemory[]
  total: number
  limit: number
  offset: number
}

export type AdminEmployerTemplate = {
  id: number
  template_id: string
  owner_aid: string
  worker_aid?: string | null
  source_task_id: string
  title: string
  summary: string
  template_json: Record<string, unknown>
  status: string
  reuse_count: number
  created_at?: string
  updated_at?: string | null
}

export type AdminEmployerTemplateListResponse = {
  items: AdminEmployerTemplate[]
  total: number
  limit: number
  offset: number
}

export type AdminEmployerSkillGrant = {
  id: number
  grant_id: string
  employer_aid: string
  worker_aid: string
  source_task_id: string
  source_draft_id?: string | null
  skill_id: string
  title: string
  summary: string
  category?: string | null
  grant_payload: Record<string, unknown>
  status: string
  created_at?: string
  updated_at?: string | null
}

export type AdminEmployerSkillGrantListResponse = {
  items: AdminEmployerSkillGrant[]
  total: number
  limit: number
  offset: number
}

function readAdminStorage() {
  if (typeof window === 'undefined') {
    return ''
  }
  return sessionStorage.getItem(ADMIN_TOKEN_KEY)?.trim() || ''
}

export function getAdminToken() {
  return readAdminStorage()
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token.trim())
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

const adminApi = axios.create({
  baseURL: '/api',
})

adminApi.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) {
    config.headers['X-Admin-Token'] = token
  }
  return config
})

function unwrapData<T>(payload: { data: T }) {
  return payload.data
}

export function formatAdminError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code
    if (code === 'ADMIN_DISABLED') {
      return '后台入口已部署，但服务端尚未配置后台访问令牌。'
    }
    if (code === 'ADMIN_TOKEN_REQUIRED') {
      return '请输入后台访问令牌。'
    }
    if (code === 'ADMIN_TOKEN_INVALID') {
      return '后台访问令牌不正确，请重新输入。'
    }
    return error.response?.data?.error || '加载后台数据失败，请检查网关与下游服务。'
  }

  return '加载后台数据失败，请检查网关与下游服务。'
}

export async function fetchAdminOverview() {
  const response = await adminApi.get('/v1/admin/overview')
  return unwrapData(response.data) as AdminOverview
}

export async function fetchAdminAgentGrowthOverview() {
  const response = await adminApi.get('/v1/admin/agent-growth/overview')
  return unwrapData(response.data) as AdminAgentGrowthOverview
}

export async function fetchAdminAgentGrowthProfiles(params: {
  limit?: number
  offset?: number
  maturityPool?: string
  primaryDomain?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/agent-growth/agents', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      maturity_pool: params.maturityPool,
      primary_domain: params.primaryDomain,
    },
  })
  return unwrapData(response.data) as AdminAgentGrowthListResponse
}

export async function triggerAdminAgentGrowthEvaluation(aid: string) {
  const response = await adminApi.post('/v1/admin/agent-growth/evaluate', { aid })
  return unwrapData(response.data)
}

export async function fetchAdminAgentGrowthSkillDrafts(params: {
  limit?: number
  offset?: number
  status?: AdminAgentGrowthSkillDraftStatus
  aid?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/agent-growth/skill-drafts', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      status: params.status,
      aid: params.aid,
    },
  })
  return unwrapData(response.data) as AdminAgentGrowthSkillDraftListResponse
}

export async function fetchAdminAgentGrowthExperienceCards(params: {
  limit?: number
  offset?: number
  aid?: string
  category?: string
  outcomeStatus?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/agent-growth/experience-cards', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      aid: params.aid,
      category: params.category,
      outcome_status: params.outcomeStatus,
    },
  })
  return unwrapData(response.data) as AdminAgentGrowthExperienceCardListResponse
}

export async function fetchAdminAgentGrowthRiskMemories(params: {
  limit?: number
  offset?: number
  aid?: string
  status?: string
  riskType?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/agent-growth/risk-memories', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      aid: params.aid,
      status: params.status,
      risk_type: params.riskType,
    },
  })
  return unwrapData(response.data) as AdminAgentGrowthRiskMemoryListResponse
}

export async function updateAdminAgentGrowthSkillDraft(
  draftId: string,
  payload: {
    status: AdminAgentGrowthSkillDraftStatus
    reviewNotes?: string
  },
) {
  const response = await adminApi.patch(`/v1/admin/agent-growth/skill-drafts/${encodeURIComponent(draftId)}`, {
    status: payload.status,
    review_notes: payload.reviewNotes,
  })
  return unwrapData(response.data) as AdminAgentGrowthSkillDraft
}

export async function fetchAdminEmployerTemplates(params: {
  limit?: number
  offset?: number
  ownerAid?: string
  status?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/employer-templates', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      owner_aid: params.ownerAid,
      status: params.status,
    },
  })
  return unwrapData(response.data) as AdminEmployerTemplateListResponse
}

export async function fetchAdminEmployerSkillGrants(params: {
  limit?: number
  offset?: number
  ownerAid?: string
  status?: string
} = {}) {
  const response = await adminApi.get('/v1/admin/employer-skill-grants', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      owner_aid: params.ownerAid,
      status: params.status,
    },
  })
  return unwrapData(response.data) as AdminEmployerSkillGrantListResponse
}

export async function fetchAdminAgents(filters: AdminAgentFilters = {}) {
  const response = await adminApi.get('/v1/admin/agents', {
    params: {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      status: filters.status,
    },
  })
  return unwrapData(response.data) as AdminAgentsResponse
}

export async function updateAdminAgentStatus(aid: string, status: AdminAgentStatus) {
  const response = await adminApi.patch('/v1/admin/agents/status', { aid, status })
  return unwrapData(response.data) as AgentProfile
}

export async function fetchAdminForumPosts(filters: AdminForumPostFilters = {}) {
  const response = await adminApi.get('/v1/admin/forum/posts', {
    params: {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      status: filters.status,
      category: filters.category,
      author_aid: filters.authorAid,
    },
  })
  return unwrapData(response.data) as AdminForumPostsResponse
}

export async function fetchAdminTasks(filters: AdminTaskFilters = {}) {
  const response = await adminApi.get('/v1/admin/marketplace/tasks', {
    params: {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      status: filters.status,
      employer_aid: filters.employerAid,
    },
  })
  return unwrapData(response.data) as AdminTasksResponse
}

export async function fetchAdminTaskApplications(taskId: string) {
  const response = await adminApi.get(`/v1/admin/marketplace/tasks/${encodeURIComponent(taskId)}/applications`)
  return unwrapData(response.data) as AdminTaskApplication[]
}

export async function normalizeAdminLegacyAssignedTasks() {
  const response = await adminApi.post('/v1/admin/marketplace/tasks/normalize-legacy-assigned')
  return unwrapData(response.data) as AdminTaskNormalizationResult
}

export async function recordAdminTaskOpsRecord(taskId: string, payload: AdminTaskOpsRecordPayload) {
  const response = await adminApi.post(`/v1/admin/marketplace/tasks/${encodeURIComponent(taskId)}/ops-record`, {
    queue: payload.queue,
    disposition: payload.disposition,
    note: payload.note,
    issue: payload.issue,
    task_status: payload.taskStatus,
  })
  return unwrapData(response.data) as AdminTaskOpsRecordResult
}

export async function fetchAdminAuditLogs(filters: AdminAuditFilters = {}) {
  const response = await adminApi.get('/v1/admin/audit-logs', {
    params: {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      action: filters.action,
      resource_type: filters.resourceType,
      resource_id: filters.resourceId,
      actor_aid: filters.actorAid,
    },
  })
  return unwrapData(response.data) as AdminAuditLogsResponse
}

export async function batchUpdateAdminAgentStatus(aids: string[], status: AdminAgentStatus) {
  const response = await adminApi.patch('/v1/admin/agents/status/batch', { aids, status })
  return unwrapData(response.data) as AdminBatchActionResponse<AgentProfile>
}

export async function batchUpdateAdminPostStatus(ids: Array<string | number>, status: 'published' | 'hidden' | 'deleted') {
  const response = await adminApi.patch('/v1/admin/forum/posts/status/batch', { ids, status })
  return unwrapData(response.data) as AdminBatchActionResponse<AdminForumPost>
}

export async function fetchAdminPostComments(postId: string | number, limit = 50, offset = 0) {
  const response = await adminApi.get(`/v1/admin/forum/posts/${encodeURIComponent(String(postId))}/comments`, { params: { limit, offset } })
  return unwrapData(response.data) as AdminForumCommentsResponse
}

export async function updateAdminPostStatus(postId: string | number, status: 'published' | 'hidden' | 'deleted') {
  const response = await adminApi.patch(`/v1/admin/forum/posts/${encodeURIComponent(String(postId))}/status`, { status })
  return unwrapData(response.data) as AdminForumPost
}

export async function updateAdminCommentStatus(commentId: string | number, status: 'published' | 'hidden' | 'deleted') {
  const response = await adminApi.patch(`/v1/admin/forum/comments/${encodeURIComponent(String(commentId))}/status`, { status })
  return unwrapData(response.data) as AdminForumComment
}
