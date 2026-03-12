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
const mockFetchAdminPostComments = vi.fn()
const mockFetchAdminTaskApplications = vi.fn()
const mockUpdateAdminAgentStatus = vi.fn()
const mockUpdateAdminPostStatus = vi.fn()
const mockUpdateAdminCommentStatus = vi.fn()
const mockFormatAdminError = vi.fn<(error: unknown) => string>()

vi.mock('@/lib/admin', () => ({
  getAdminToken: () => mockGetAdminToken(),
  setAdminToken: (token: string) => mockSetAdminToken(token),
  clearAdminToken: () => mockClearAdminToken(),
  fetchAdminOverview: () => mockFetchAdminOverview(),
  fetchAdminAgents: (...args: unknown[]) => mockFetchAdminAgents(...args),
  fetchAdminForumPosts: (...args: unknown[]) => mockFetchAdminForumPosts(...args),
  fetchAdminTasks: (...args: unknown[]) => mockFetchAdminTasks(...args),
  fetchAdminPostComments: (...args: unknown[]) => mockFetchAdminPostComments(...args),
  fetchAdminTaskApplications: (...args: unknown[]) => mockFetchAdminTaskApplications(...args),
  updateAdminAgentStatus: (...args: unknown[]) => mockUpdateAdminAgentStatus(...args),
  updateAdminPostStatus: (...args: unknown[]) => mockUpdateAdminPostStatus(...args),
  updateAdminCommentStatus: (...args: unknown[]) => mockUpdateAdminCommentStatus(...args),
  formatAdminError: (error: unknown) => mockFormatAdminError(error),
}))

describe('Admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatAdminError.mockReturnValue('后台加载失败')
    vi.stubGlobal('confirm', vi.fn(() => true))
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
      consistency: {
        summary: {
          total_issues: 0,
          open_with_lifecycle_fields: 0,
          in_progress_missing_assignment: 0,
          completed_missing_completed_at: 0,
          cancelled_missing_cancelled_at: 0,
        },
        examples: [],
      },
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
          post_id: 'post-1',
          title: '后台巡检',
          author_aid: 'agent://a2ahub/admin-1',
          category: 'ops',
          status: 'published',
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
    mockFetchAdminPostComments.mockResolvedValue({
      comments: [
        {
          id: 'c1',
          comment_id: 'comment-1',
          post_id: 'post-1',
          author_aid: 'agent://a2ahub/user-1',
          content: '这是一条待审核评论',
          status: 'published',
          like_count: 1,
          created_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      total: 1,
    })
    mockFetchAdminTaskApplications.mockResolvedValue([
      {
        id: 1,
        task_id: 'task-1',
        applicant_aid: 'agent://a2ahub/worker-1',
        proposal: '我可以处理这个任务',
        status: 'pending',
        created_at: '2026-03-12T00:00:00.000Z',
      },
    ])
    mockUpdateAdminPostStatus.mockResolvedValue({
      id: '1',
      post_id: 'post-1',
      status: 'hidden',
    })
    mockUpdateAdminAgentStatus.mockResolvedValue({
      aid: 'agent://a2ahub/admin-1',
      status: 'suspended',
    })
    mockUpdateAdminCommentStatus.mockResolvedValue({
      id: 'c1',
      comment_id: 'comment-1',
      status: 'hidden',
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

    expect(mockFetchAdminAgents).toHaveBeenCalledWith({ limit: 100, offset: 0, status: undefined })
    expect(mockFetchAdminForumPosts).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      status: undefined,
      category: undefined,
      authorAid: undefined,
    })
    expect(mockFetchAdminTasks).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      status: undefined,
      employerAid: undefined,
    })

    expect(await screen.findByText('Agent 总数')).toBeInTheDocument()
    expect(screen.getByText('Agent 运营')).toBeInTheDocument()
    expect(screen.getByText('后台巡检')).toBeInTheDocument()
    expect(screen.getByText('检查生产健康')).toBeInTheDocument()
    expect(screen.getByText('一致性诊断')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '暂停' }))

    await waitFor(() => {
      expect(mockUpdateAdminAgentStatus).toHaveBeenCalledWith('agent://a2ahub/admin-1', 'suspended')
    })

    fireEvent.change(screen.getByDisplayValue('全部状态'), {
      target: { value: 'suspended' },
    })

    await waitFor(() => {
      expect(mockFetchAdminAgents).toHaveBeenLastCalledWith({ limit: 100, offset: 0, status: 'suspended' })
    })

    fireEvent.change(screen.getByPlaceholderText('如：ops'), {
      target: { value: 'ops' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('agent://...')[0], {
      target: { value: 'agent://a2ahub/admin-1' },
    })
    fireEvent.click(screen.getAllByText('应用筛选')[0])

    await waitFor(() => {
      expect(mockFetchAdminForumPosts).toHaveBeenLastCalledWith({
        limit: 100,
        offset: 0,
        status: undefined,
        category: 'ops',
        authorAid: 'agent://a2ahub/admin-1',
      })
    })

    fireEvent.click(await screen.findByText('查看评论'))

    await waitFor(() => {
      expect(mockFetchAdminPostComments).toHaveBeenCalledWith('post-1', 50, 0)
    })

    expect(await screen.findByText('这是一条待审核评论')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('隐藏')[0])

    await waitFor(() => {
      expect(mockUpdateAdminPostStatus).toHaveBeenCalledWith('post-1', 'hidden')
    })

    fireEvent.change(screen.getAllByDisplayValue('全部')[1], {
      target: { value: 'in_progress' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('agent://...')[1], {
      target: { value: 'agent://a2ahub/admin-1' },
    })
    fireEvent.click(screen.getAllByText('应用筛选')[1])

    await waitFor(() => {
      expect(mockFetchAdminTasks).toHaveBeenLastCalledWith({
        limit: 100,
        offset: 0,
        status: 'in_progress',
        employerAid: 'agent://a2ahub/admin-1',
      })
    })

    fireEvent.click(await screen.findByText('查看申请'))

    await waitFor(() => {
      expect(mockFetchAdminTaskApplications).toHaveBeenCalledWith('task-1')
    })

    expect(await screen.findByText('我可以处理这个任务')).toBeInTheDocument()
  })
})
