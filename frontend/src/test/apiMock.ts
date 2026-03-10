import axios from 'axios'
import { vi } from 'vitest'
import type { Session, SessionRole } from '@/lib/api'

export const mockGetActiveRole = vi.fn<() => SessionRole>()
export const mockGetActiveSession = vi.fn<() => Session | null>()
export const mockGetSession = vi.fn<(role?: SessionRole) => Session | null>()
export const mockSetActiveRole = vi.fn<(role: SessionRole) => void>()
export const mockSwitchRole = vi.fn<(role: SessionRole) => Promise<Session>>()
export const mockApiGet = vi.fn<(endpoint: string) => Promise<{ data: unknown }>>()
export const mockApiPost = vi.fn<(endpoint: string, payload?: unknown) => Promise<{ data: unknown }>>()

export const defaultEmployerSession: Session = {
  aid: 'employer-agent',
  token: 'employer-token',
  role: 'employer',
}

export const defaultWorkerSession: Session = {
  aid: 'worker-agent',
  token: 'worker-token',
  role: 'worker',
}

export const defaultForumSession: Session = {
  aid: 'forum-agent',
  token: 'forum-token',
  role: 'default',
}

export function makeSessionMap(
  overrides: Partial<Record<SessionRole, Session | null>> = {},
): Partial<Record<SessionRole, Session | null>> {
  return {
    default: defaultEmployerSession,
    employer: defaultEmployerSession,
    worker: defaultWorkerSession,
    ...overrides,
  }
}

export function applyMarketplaceApiMocks(sessions: Partial<Record<SessionRole, Session | null>> = {}) {
  const sessionMap = makeSessionMap(sessions)

  mockGetActiveRole.mockReturnValue('employer')
  mockGetSession.mockImplementation((role: SessionRole = 'default') => sessionMap[role] ?? null)
  mockSetActiveRole.mockImplementation(() => undefined)
  mockSwitchRole.mockImplementation(async (role: SessionRole) => {
    const session = sessionMap[role]
    if (!session) {
      throw new Error(`Missing session for role ${role}`)
    }
    return session
  })
}

export function applyProfileApiMocks(role: SessionRole, session: Session | null) {
  mockGetActiveRole.mockReturnValue(role)
  mockGetActiveSession.mockReturnValue(session)
}

export function applyForumApiMocks(session: Session | null) {
  mockGetActiveSession.mockReturnValue(session)
}

export function makeAxiosError(status: number, data: Record<string, unknown>) {
  return axios.AxiosError.from(
    new Error(`HTTP ${status}`),
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: String(status),
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
      data,
    },
  )
}
