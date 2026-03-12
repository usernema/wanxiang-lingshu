import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Admin from '@/pages/Admin'
import { renderWithProviders } from '@/test/renderWithProviders'

const mockGetAdminToken = vi.fn<() => string>()
const mockSetAdminToken = vi.fn<(token: string) => void>()
const mockClearAdminToken = vi.fn<() => void>()
const mockFetchAdminOverview = vi.fn()
const mockFetchAdminAgents = vi.fn()
const mockFetchAdminForumPosts = vi.fn()
const mockFetchAdminTasks = vi.fn()
const mockFormatAdminError = vi.fn<(error: unknown) => string>()

vi.mock('@/lib/admin', () => ({
  getAdminToken: () => mockGetAdminToken(),
  setAdminToken: (token: string) => mockSetAdminToken(token),
  clearAdminToken: () => mockClearAdminToken(),
  fetchAdminOverview: () => mockFetchAdminOverview(),
  fetchAdminAgents: () => mockFetchAdminAgents(),
  fetchAdminForumPosts: () => mockFetchAdminForumPosts(),
  fetchAdminTasks: () => mockFetchAdminTasks(),
  formatAdminError: (error: unknown) => mockFormatAdminError(error),
}))

describe('Admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatAdminError.mockReturnValue('后台加载失败')
  })

  it('shows token gate when no admin token is present', async () => {
    mockGetAdminToken.mockReturnValue('')

    renderWithProviders(<Admin />, { initialEntries: ['/admin'] })

    expect(await screen.findByText('管理后台')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请输入 ADMIN_CONSOLE_TOKEN')).toBeInTheDocument()
    expect(mockFetchAdminOverview).not.toHaveBeenCalled()
  })

  it('loads admin sections after token submission', async () => {
    mockGetAdminToken
      .mockReturnValueOnce('')
      .mockReturnValue('secret-admin-token')

    mockFetchAdminOverview.mockResolvedValue({
      summary: {
        agentsTotal: 12,
        forumPostsTotal: 8,
        recentTasksCount: 3,
        consistencyIssues: 0,
        ready: true,
      },
      dependencies: {
        redis: { name: 'redis', required: true, ok: true },
        required: [{ name: 'identity', required: true, ok: true, url: 'http://identity-service:8001' }],
        optional: [],
      },
      agents: [],
      forumPosts: [],
      tasks: [],
    })
    mockFetchAdminAgents.mockResolvedValue({
      items: [
        {
          aid: 'agent://a2ahub/admin-1',
          model: 'GPT-5',
          provider: 'openai',
          capabilities: ['ops'],
          reputation: 120,
          status: 'active',
          membership_level: 'member',
          trust_level: 'active',
          created_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      total: 12,
      limit: 20,
      offset: 0,
    })
    mockFetchAdminForumPosts.mockResolvedValue({
      posts: [
        {
          id: '1',
          title: '后台巡检',
          author_aid: 'agent://a2ahub/admin-1',
          category: 'ops',
          comment_count: 2,
          like_count: 5,
          created_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      total: 8,
    })
    mockFetchAdminTasks.mockResolvedValue({
      items: [
        {
          id: 1,
          task_id: 'task-1',
          title: '检查生产健康',
          employer_aid: 'agent://a2ahub/admin-1',
          worker_aid: 'agent://a2ahub/worker-1',
          status: 'in_progress',
          reward: 10,
          created_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      limit: 20,
      offset: 0,
    })

    renderWithProviders(<Admin />, { initialEntries: ['/admin'] })

    fireEvent.change(screen.getByPlaceholderText('请输入 ADMIN_CONSOLE_TOKEN'), {
      target: { value: 'secret-admin-token' },
    })
    fireEvent.click(screen.getByText('进入后台'))

    await waitFor(() => {
      expect(mockSetAdminToken).toHaveBeenCalledWith('secret-admin-token')
      expect(mockFetchAdminOverview).toHaveBeenCalled()
    })

    expect(await screen.findByText('Agent 总数')).toBeInTheDocument()
    expect(screen.getByText('最近 Agent')).toBeInTheDocument()
    expect(screen.getByText('后台巡检')).toBeInTheDocument()
    expect(screen.getByText('检查生产健康')).toBeInTheDocument()
  })
})
