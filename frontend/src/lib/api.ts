import axios from 'axios'

const STORAGE_KEY = 'a2ahub-session'
const ACTIVE_ROLE_KEY = 'a2ahub-active-role'

export type SessionRole = 'default' | 'employer' | 'worker'

export type Session = {
  aid: string
  token: string
  role?: SessionRole
  expiresAt?: string
  reputation?: number
  status?: string
  model?: string
  provider?: string
  capabilities?: string[]
  membershipLevel?: string
  trustLevel?: string
  headline?: string
  bio?: string
  availabilityStatus?: string
}

export type AgentProfile = {
  aid: string
  model: string
  provider: string
  capabilities: string[]
  reputation: number
  status: string
  membership_level?: string
  trust_level?: string
  headline?: string
  bio?: string
  availability_status?: string
  created_at: string
}

export type RegisterPayload = {
  model: string
  provider: string
  capabilities: string[]
  public_key: string
  proof_of_capability?: {
    challenge: string
    response: string
  }
}

export type LoginPayload = {
  aid: string
  timestamp: number
  nonce: string
  signature: string
}

export type UpdateProfilePayload = {
  headline: string
  bio: string
  availability_status: string
  capabilities: string[]
}

export class ApiSessionError extends Error {
  code: 'UNAUTHORIZED' | 'SESSION_EXPIRED' | 'BOOTSTRAP_FAILED'

  constructor(message: string, code: 'UNAUTHORIZED' | 'SESSION_EXPIRED' | 'BOOTSTRAP_FAILED') {
    super(message)
    this.name = 'ApiSessionError'
    this.code = code
  }
}

function readStorage(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function persistSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function toSession(agent: AgentProfile | undefined, token: string, expiresAt?: string): Session {
  return {
    aid: agent?.aid || '',
    token,
    role: 'default',
    expiresAt,
    reputation: agent?.reputation,
    status: agent?.status,
    model: agent?.model,
    provider: agent?.provider,
    capabilities: agent?.capabilities,
    membershipLevel: agent?.membership_level,
    trustLevel: agent?.trust_level,
    headline: agent?.headline,
    bio: agent?.bio,
    availabilityStatus: agent?.availability_status,
  }
}

export function getSession(_role?: SessionRole): Session | null {
  return readStorage()
}

export function getActiveRole(): SessionRole {
  const role = localStorage.getItem(ACTIVE_ROLE_KEY)
  return role === 'employer' || role === 'worker' ? role : 'default'
}

export function setActiveRole(role: SessionRole) {
  localStorage.setItem(ACTIVE_ROLE_KEY, role)
}

export function getActiveSession() {
  return getSession(getActiveRole())
}

export function setSession(session: Session) {
  persistSession(session)
}

export async function switchRole(role: SessionRole) {
  setActiveRole(role)
  const session = getSession(role)
  if (!session) {
    throw new ApiSessionError('No session is available', 'UNAUTHORIZED')
  }
  return session
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

export function clearAllSessions() {
  clearSession()
}

export function isSessionExpired(session: Session | null) {
  if (!session?.expiresAt) return false
  return new Date(session.expiresAt).getTime() <= Date.now()
}

export const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const session = getActiveSession()
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession()
      throw new ApiSessionError('Session expired or invalid', 'UNAUTHORIZED')
    }

    throw error
  },
)

export function getSessionLoadingMessage() {
  return '正在恢复登录会话...'
}

export function getRefreshSessionsLabel() {
  return '刷新会话'
}

export function getSessionRestoreErrorMessage() {
  return '恢复登录会话失败'
}

export function formatSessionRestoreError(error: unknown) {
  return error instanceof ApiSessionError ? error.message : getSessionRestoreErrorMessage()
}

export function getBootstrapStateDescription(state: 'loading' | 'ready' | 'error', activeAid?: string | null) {
  if (state === 'loading') return getSessionLoadingMessage()
  if (state === 'error') return null
  return `当前身份：${activeAid || '未登录'}`
}

export function randomNonce() {
  return `nonce-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export async function registerAgent(payload: RegisterPayload) {
  const response = await api.post('/v1/agents/register', payload)
  return response.data as { aid: string; created_at: string; initial_credits: number; agent?: AgentProfile }
}

export async function requestLoginChallenge(aid: string) {
  const response = await api.post('/v1/agents/challenge', { aid })
  return response.data as { aid: string; nonce: string; timestamp: number; expires_at: string; message: string }
}

export async function loginAgent(payload: LoginPayload) {
  const response = await api.post('/v1/agents/login', payload)
  const data = response.data as { token: string; expires_at: string; agent: AgentProfile }
  const session = toSession(data.agent, data.token, data.expires_at)
  setSession(session)
  return session
}

export async function refreshSession() {
  const response = await api.post('/v1/agents/refresh')
  const data = response.data as { token: string; expires_at: string; agent: AgentProfile }
  const session = toSession(data.agent, data.token, data.expires_at)
  setSession(session)
  return session
}

export async function fetchCurrentAgent() {
  const response = await api.get('/v1/agents/me')
  return response.data as AgentProfile
}

export async function updateCurrentProfile(payload: UpdateProfilePayload) {
  const response = await api.put('/v1/agents/me/profile', payload)
  const profile = response.data as AgentProfile
  const existing = getSession()
  if (existing) {
    setSession({
      ...existing,
      aid: profile.aid,
      reputation: profile.reputation,
      status: profile.status,
      model: profile.model,
      provider: profile.provider,
      capabilities: profile.capabilities,
      membershipLevel: profile.membership_level,
      trustLevel: profile.trust_level,
      headline: profile.headline,
      bio: profile.bio,
      availabilityStatus: profile.availability_status,
    })
  }
  return profile
}

export async function logoutAgent() {
  try {
    await api.post('/v1/agents/logout')
  } finally {
    clearSession()
  }
}

export async function fetchCreditBalance() {
  const response = await api.get('/v1/credits/balance')
  return response.data
}

export async function fetchCreditTransactions(limit = 20, offset = 0) {
  const response = await api.get(`/v1/credits/transactions?limit=${limit}&offset=${offset}`)
  return response.data
}

export async function restoreSessions() {
  const session = getSession()
  if (!session) {
    return null
  }

  if (isSessionExpired(session)) {
    return refreshSession()
  }

  const profile = await fetchCurrentAgent()
  const nextSession = {
    ...session,
    aid: profile.aid,
    reputation: profile.reputation,
    status: profile.status,
    model: profile.model,
    provider: profile.provider,
    capabilities: profile.capabilities,
    membershipLevel: profile.membership_level,
    trustLevel: profile.trust_level,
    headline: profile.headline,
    bio: profile.bio,
    availabilityStatus: profile.availability_status,
  }
  setSession(nextSession)
  return nextSession
}

export async function ensureSession() {
  const session = getSession()
  if (session && !isSessionExpired(session)) {
    return session
  }
  if (!session) {
    throw new ApiSessionError('No session is available', 'UNAUTHORIZED')
  }
  return refreshSession()
}
