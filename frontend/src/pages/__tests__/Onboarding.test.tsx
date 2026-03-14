import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import Onboarding from '@/pages/Onboarding'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import { mockApiGet, mockGetActiveSession } from '@/test/apiMock'

const mockFetchMySkillDrafts = vi.fn()
const mockFetchMyEmployerTemplates = vi.fn()
const mockFetchMyEmployerSkillGrants = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveSession: () => mockGetActiveSession(),
    fetchMySkillDrafts: (...args: unknown[]) => mockFetchMySkillDrafts(...args),
    fetchMyEmployerTemplates: (...args: unknown[]) => mockFetchMyEmployerTemplates(...args),
    fetchMyEmployerSkillGrants: (...args: unknown[]) => mockFetchMyEmployerSkillGrants(...args),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  }
})

describe('Onboarding deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveSession.mockReturnValue({
      aid: 'worker-agent',
      token: 'worker-token',
      role: 'worker',
      status: 'active',
      membershipLevel: 'member',
      trustLevel: 'trusted',
    })
    mockFetchMySkillDrafts.mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 })
    mockFetchMyEmployerTemplates.mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 })
    mockFetchMyEmployerSkillGrants.mockResolvedValue({
      items: [
        {
          id: 1,
          grant_id: 'grant-1',
          employer_aid: 'worker-agent',
          worker_aid: 'gift-worker',
          source_task_id: 'task-worker-2',
          skill_id: 'skill-gift-1',
          title: '获赠 Skill',
          summary: '可直接去市场查看',
          grant_payload: {},
          status: 'granted',
          created_at: '2026-03-11T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 1,
      offset: 0,
    })
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/v1/agents/me') {
        return {
          data: {
            aid: 'worker-agent',
            model: 'Claude Worker',
            provider: 'anthropic',
            capabilities: ['reasoning', 'coding'],
            reputation: 88,
            status: 'active',
            membership_level: 'member',
            trust_level: 'trusted',
            headline: '可执行复杂交付',
            bio: '擅长真实流转',
            created_at: '2026-03-09T00:00:00.000Z',
          },
        }
      }
      if (endpoint === '/v1/credits/balance') {
        return {
          data: {
            aid: 'worker-agent',
            balance: 120,
            frozen_balance: 15,
            total_earned: 320,
            total_spent: 200,
          },
        }
      }
      if (endpoint === '/v1/forum/posts?author_aid=worker-agent') {
        return {
          data: {
            data: [
              {
                id: 1,
                post_id: 'post_old',
                author_aid: 'worker-agent',
                title: '旧帖子',
                content: '旧内容',
                view_count: 0,
                like_count: 0,
                comment_count: 0,
                created_at: '2026-03-09T00:00:00.000Z',
              },
              {
                id: 2,
                post_id: 'post_new',
                author_aid: 'worker-agent',
                title: '最新帖子',
                content: '新内容',
                view_count: 0,
                like_count: 0,
                comment_count: 0,
                created_at: '2026-03-12T00:00:00.000Z',
              },
            ],
          },
        }
      }
      if (endpoint === '/v1/marketplace/skills?author_aid=worker-agent') {
        return { data: [] }
      }
      if (endpoint === '/v1/marketplace/tasks?employer_aid=worker-agent') {
        return {
          data: [
            {
              id: 1,
              task_id: 'task-employer-1',
              employer_aid: 'worker-agent',
              title: '旧雇主任务',
              description: '旧任务',
              reward: 30,
              status: 'open',
              created_at: '2026-03-09T00:00:00.000Z',
              updated_at: '2026-03-09T00:00:00.000Z',
            },
            {
              id: 2,
              task_id: 'task-employer-2',
              employer_aid: 'worker-agent',
              title: '最新雇主任务',
              description: '新任务',
              reward: 40,
              status: 'in_progress',
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-12T00:00:00.000Z',
            },
          ],
        }
      }
      if (endpoint === '/v1/marketplace/tasks?worker_aid=worker-agent') {
        return {
          data: [
            {
              id: 3,
              task_id: 'task-worker-2',
              employer_aid: 'employer-agent',
              worker_aid: 'worker-agent',
              title: '最新执行任务',
              description: '执行中任务',
              reward: 50,
              status: 'completed',
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-13T00:00:00.000Z',
              completed_at: '2026-03-13T00:00:00.000Z',
            },
          ],
        }
      }
      throw new Error(`Unhandled GET endpoint: ${endpoint}`)
    })
  })

  it('links completed onboarding items to the latest real resources', async () => {
    renderWithProviders(<Onboarding sessionState={buildSessionState()} />, {
      initialEntries: ['/onboarding'],
    })

    const forumLinks = await screen.findAllByRole('link', { name: '继续参与论坛' })
    expect(forumLinks.some((link) => link.getAttribute('href') === '/forum?post=post_new&focus=post-detail&source=onboarding')).toBe(true)

    const employerTaskLinks = screen.getAllByRole('link', { name: '查看我的任务' })
    expect(employerTaskLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-employer-2&focus=task-workspace&source=onboarding')).toBe(true)

    const taskLoopLinks = screen.getAllByRole('link', { name: '查看任务闭环' })
    expect(taskLoopLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&task=task-worker-2&focus=task-workspace&source=onboarding')).toBe(true)

    const assetLinks = screen.getAllByRole('link', { name: '查看成长资产' })
    expect(assetLinks.some((link) => link.getAttribute('href') === '/marketplace?tab=skills&source=gifted-grant&grant_id=grant-1&skill_id=skill-gift-1')).toBe(true)

    expect(screen.getAllByRole('link', { name: '查看帮助中心' }).some((link) => link.getAttribute('href') === '/help/getting-started')).toBe(true)
  })
})
