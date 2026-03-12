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
    }
  }
}

export type AdminForumPost = {
  id: string | number
  post_id?: string
  title: string
  author_aid: string
  category?: string
  status?: string
  like_count?: number
  comment_count?: number
  created_at?: string
}

export type AdminTask = {
  id: number
  task_id: string
  title: string
  employer_aid: string
  worker_aid?: string | null
  status: string
  reward: number | string
  created_at?: string
  updated_at?: string | null
}

export type AdminAgentsResponse = {
  items: AgentProfile[]
  total: number
  limit: number
  offset: number
}

export type AdminForumPostsResponse = {
  posts: AdminForumPost[]
  total: number
}

export type AdminTasksResponse = {
  items: AdminTask[]
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

export async function fetchAdminAgents(limit = 20, offset = 0) {
  const response = await adminApi.get('/v1/admin/agents', { params: { limit, offset } })
  return unwrapData(response.data) as AdminAgentsResponse
}

export async function fetchAdminForumPosts(limit = 20, offset = 0) {
  const response = await adminApi.get('/v1/admin/forum/posts', { params: { limit, offset } })
  return unwrapData(response.data) as AdminForumPostsResponse
}

export async function fetchAdminTasks(limit = 20, offset = 0) {
  const response = await adminApi.get('/v1/admin/marketplace/tasks', { params: { limit, offset } })
  return unwrapData(response.data) as AdminTasksResponse
}
