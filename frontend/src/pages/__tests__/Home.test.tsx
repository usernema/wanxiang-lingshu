import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import Home from '@/pages/Home'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import { mockApiGet, mockGetActiveSession } from '@/test/apiMock'
import type { Session } from '@/lib/api'

const mockFetchNotifications = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveSession: () => mockGetActiveSession(),
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  }
})

const activeSession: Session = {
  aid: 'worker-agent',
  token: 'worker-token',
  role: 'worker',
  status: 'active',
  membershipLevel: 'member',
  trustLevel: 'verified',
}

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the landing page for guests', async () => {
    mockGetActiveSession.mockReturnValue(null)
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/health/ready') {
        return { data: { status: 'ready' } }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByRole('link', { name: '注册 / 登录' })).toHaveAttribute('href', '/join')
    expect(screen.queryByText('本周继续做什么')).not.toBeInTheDocument()
    expect(await screen.findByText('正式版主链路说明')).toBeInTheDocument()
  })

  it('renders logged-in next actions and growth roadmap', async () => {
    mockGetActiveSession.mockReturnValue(activeSession)
    mockFetchNotifications.mockResolvedValue({
      items: [
        {
          notification_id: 'notif_1',
          recipient_aid: 'worker-agent',
          type: 'escrow_created',
          title: '托管已创建',
          content: '请回到任务工作台继续推进。',
          link: '/wallet?focus=notifications',
          is_read: false,
          metadata: null,
          created_at: '2026-03-14T00:00:00.000Z',
        },
      ],
      total: 1,
      unread_count: 1,
      limit: 5,
      offset: 0,
    })
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/health/ready') {
        return { data: { status: 'ready' } }
      }
      if (endpoint === '/v1/agents/me') {
        return {
          data: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['coding'],
            reputation: 88,
            status: 'active',
            membership_level: 'member',
            trust_level: 'verified',
            headline: '',
            bio: '',
            created_at: '2026-03-14T00:00:00.000Z',
          },
        }
      }
      if (endpoint === '/v1/credits/balance') {
        return {
          data: {
            aid: 'worker-agent',
            balance: 120,
            frozen_balance: 10,
            total_earned: 150,
            total_spent: 30,
          },
        }
      }
      if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
        return { data: { data: [] } }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
        return {
          data: [
            {
              id: 1,
              task_id: 'task_123',
              employer_aid: 'employer-agent',
              worker_aid: 'worker-agent',
              title: '真实任务验收',
              description: '回到工作台继续处理',
              reward: 25,
              status: 'submitted',
              created_at: '2026-03-14T00:00:00.000Z',
              updated_at: '2026-03-14T01:00:00.000Z',
            },
          ],
        }
      }

      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })

    renderWithProviders(<Home sessionState={buildSessionState()} />, { initialEntries: ['/'] })

    expect(await screen.findByText('本周继续做什么')).toBeInTheDocument()
    const taskWorkspaceLinks = await screen.findAllByRole('link', { name: '回到任务工作台' })
    expect(taskWorkspaceLinks.length).toBeGreaterThan(0)
    taskWorkspaceLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/marketplace?tab=tasks&task=task_123&focus=task-workspace&source=home')
    })
    const taskActionTitles = await screen.findAllByText('继续当前任务流转')
    expect(taskActionTitles.length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去看通知中心' })).toHaveAttribute(
      'href',
      '/wallet?focus=notifications&source=home',
    )
    expect(screen.getByText('7 天成长路径')).toBeInTheDocument()
    expect(screen.getByText('Day 7')).toBeInTheDocument()
    expect(screen.getByText('沉淀并发布首个 Skill')).toBeInTheDocument()
  })
})
