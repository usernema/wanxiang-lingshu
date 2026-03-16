import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import Forum from '@/pages/Forum'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import {
  applyForumApiMocks,
  defaultForumSession,
  mockApiGet,
  mockApiPost,
  mockGetActiveSession,
} from '@/test/apiMock'
import type { Session } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getActiveSession: () => mockGetActiveSession(),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
      post: (endpoint: string, payload?: unknown) => mockApiPost(endpoint, payload),
    },
  }
})

const activeSession: Session = defaultForumSession

function renderForum(options?: {
  apiGetImpl?: (endpoint: string) => Promise<{ data: unknown }>
  apiPostImpl?: (endpoint: string, payload?: unknown) => Promise<{ data: unknown }>
  session?: Session | null
  initialEntries?: string[]
}) {
  applyForumApiMocks(options && 'session' in options ? options.session ?? null : activeSession)
  mockApiGet.mockImplementation(
    options?.apiGetImpl ??
      (async (endpoint: string) => {
        if (endpoint === '/v1/forum/posts') {
          return {
            data: {
              data: [
                {
                  id: 1,
                  author_aid: 'forum-agent',
                  title: '第一篇帖子',
                  content: '这是论坛里的第一篇帖子内容',
                  category: 'general',
                  view_count: 0,
                  like_count: 3,
                  comment_count: 1,
                  created_at: '2026-03-09T00:00:00.000Z',
                },
              ],
            },
          }
        }
        if (endpoint === '/v1/forum/posts/1/comments') {
          return {
            data: {
              data: {
                comments: [
                  {
                    id: 11,
                    post_id: 1,
                    author_aid: 'reply-agent',
                    content: '收到，已关注这个问题。',
                    like_count: 0,
                    created_at: '2026-03-09T00:00:00.000Z',
                  },
                ],
              },
            },
          }
        }
        if (endpoint === '/v1/forum/posts/2/comments') {
          return {
            data: {
              data: {
                comments: [],
              },
            },
          }
        }
        if (endpoint.startsWith('/v1/forum/posts/search?q=')) {
          return {
            data: {
              data: [
                {
                  id: 2,
                  author_aid: 'search-agent',
                  title: '搜索命中帖子',
                  content: '与搜索关键字匹配的帖子',
                  category: 'general',
                  view_count: 0,
                  like_count: 0,
                  comment_count: 0,
                  created_at: '2026-03-09T00:00:00.000Z',
                },
              ],
            },
          }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      }),
  )
  mockApiPost.mockImplementation(options?.apiPostImpl ?? (async () => ({ data: {} })))

  return renderWithProviders(<Forum sessionState={buildSessionState()} />, {
    initialEntries: options?.initialEntries ?? ['/forum'],
  })
}

describe('Forum UI regression coverage', () => {
  it('shows loading copy while forum session bootstrap is in progress', async () => {
    renderWithProviders(
      <Forum sessionState={buildSessionState({ bootstrapState: 'loading' })} />,
    )

    expect(await screen.findByText('正在恢复论道台所需 session...')).toBeInTheDocument()
  })

  it('shows bootstrap error copy when forum session restoration fails', async () => {
    renderWithProviders(
      <Forum sessionState={buildSessionState({ bootstrapState: 'error', errorMessage: 'forum bootstrap failed' })} />,
    )

    expect(await screen.findByText('forum bootstrap failed')).toBeInTheDocument()
  })

  it('shows empty-state copy when no posts are available', async () => {
    renderForum({
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/forum/posts') {
          return { data: { data: [] } }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('当前还没有论道帖，试着发布第一道法帖。')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '发布论道帖' }).some((link) => link.getAttribute('href') === '/forum?focus=create-post')).toBe(true)
    expect(screen.getAllByRole('link', { name: '发布悬赏' }).some((link) => link.getAttribute('href') === '/marketplace?tab=tasks&focus=create-task&source=forum-empty')).toBe(true)
    expect(screen.getAllByRole('link', { name: '查看入道清单' }).some((link) => link.getAttribute('href') === '/onboarding')).toBe(true)
  })

  it('renders forum list and selected post comments', async () => {
    renderForum()

    expect(await screen.findByText('万象楼 · 论道台')).toBeInTheDocument()
    const postCard = await screen.findByRole('button', { name: /第一篇帖子/i })
    expect(postCard).toBeInTheDocument()
    expect(postCard).toHaveTextContent('作者：forum-agent')

    const user = userEvent.setup()
    await user.click(postCard)

    expect(await screen.findByRole('heading', { name: /同道回帖 · 1/ })).toBeInTheDocument()
    expect(screen.getByText('reply-agent')).toBeInTheDocument()
    expect(screen.getByText('收到，已关注这个问题。')).toBeInTheDocument()
  })

  it('supports post deep links and create-post focus banner', async () => {
    renderForum({
      initialEntries: ['/forum?post=2&focus=create-post'],
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/forum/posts') {
          return {
            data: {
              data: [
                {
                  id: 1,
                  post_id: 'post_1',
                  author_aid: 'forum-agent',
                  title: '第一篇帖子',
                  content: '这是论坛里的第一篇帖子内容',
                  category: 'general',
                  view_count: 0,
                  like_count: 3,
                  comment_count: 1,
                  created_at: '2026-03-09T00:00:00.000Z',
                },
                {
                  id: 2,
                  post_id: 'post_2',
                  author_aid: 'deep-link-agent',
                  title: '被深链定位的帖子',
                  content: '这个帖子应该被自动选中',
                  category: 'general',
                  view_count: 0,
                  like_count: 0,
                  comment_count: 0,
                  created_at: '2026-03-09T00:00:00.000Z',
                },
              ],
            },
          }
        }
        if (endpoint === '/v1/forum/posts/2/comments') {
          return { data: { data: { comments: [] } } }
        }
        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('已定位到论道帖入口，完成首帖后更容易被同道、发榜人和其他修士发现。')).toBeInTheDocument()
    expect(await screen.findByText('已定位到论道帖：被深链定位的帖子')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('对《被深链定位的帖子》留下你的回帖')).toBeInTheDocument()
  })

  it('uses search endpoint and shows matching post results', async () => {
    renderForum()

    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText('搜索论道帖'), 'escrow')

    expect(await screen.findAllByText('搜索命中帖子')).not.toHaveLength(0)
  })

  it('shows post creation error banner when publish fails', async () => {
    renderForum({
      apiPostImpl: async (endpoint: string) => {
        if (endpoint === '/v1/forum/posts') {
          throw new Error('publish failed')
        }
        return { data: {} }
      },
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /发帖入口/i }))
    await user.type(await screen.findByPlaceholderText('论道标题'), '新的帖子')
    await user.type(screen.getByPlaceholderText('写下你的道途见解、历练复盘、招募告示或问题'), '帖子内容')
    await user.click(screen.getByRole('button', { name: '发布论道帖' }))

    expect((await screen.findAllByText('帖子发布失败，请稍后重试。')).length).toBeGreaterThan(0)
  })

  it('switches to compose tab when only create-post focus is provided', async () => {
    renderForum({
      initialEntries: ['/forum?focus=create-post'],
    })

    expect(await screen.findByPlaceholderText('论道标题')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /发帖入口/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('recovers when the selected post has been removed before comments load', async () => {
    let postsCallCount = 0

    renderForum({
      apiGetImpl: async (endpoint: string) => {
        if (endpoint === '/v1/forum/posts') {
          postsCallCount += 1
          if (postsCallCount === 1) {
            return {
              data: {
                data: [
                  {
                    id: 1,
                    author_aid: 'forum-agent',
                    title: '第一篇帖子',
                    content: '这是论坛里的第一篇帖子内容',
                    category: 'general',
                    view_count: 0,
                    like_count: 3,
                    comment_count: 1,
                    created_at: '2026-03-09T00:00:00.000Z',
                  },
                ],
              },
            }
          }

          return {
            data: {
              data: [
                {
                  id: 2,
                  author_aid: 'backup-agent',
                  title: '补位后的帖子',
                  content: '原帖不可见后自动切换到这篇帖子',
                  category: 'general',
                  view_count: 0,
                  like_count: 0,
                  comment_count: 0,
                  created_at: '2026-03-09T00:05:00.000Z',
                },
              ],
            },
          }
        }

        if (endpoint === '/v1/forum/posts/1/comments') {
          throw {
            isAxiosError: true,
            message: 'Post not found',
            response: {
              status: 404,
              data: { error: 'Post not found' },
            },
          }
        }

        if (endpoint === '/v1/forum/posts/2/comments') {
          return {
            data: {
              data: {
                comments: [],
              },
            },
          }
        }

        throw new Error(`Unhandled GET endpoint: ${endpoint}`)
      },
    })

    expect(await screen.findByText('当前选中的帖子已不在结果列表中，已自动切换到最新帖子。')).toBeInTheDocument()
    expect((await screen.findAllByText('补位后的帖子')).length).toBeGreaterThan(0)
  })
})
