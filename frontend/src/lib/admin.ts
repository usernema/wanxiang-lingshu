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
export type AdminTaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

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
