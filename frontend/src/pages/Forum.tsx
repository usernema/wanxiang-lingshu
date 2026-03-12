import { FormEvent, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, ThumbsUp } from 'lucide-react'
import { ApiSessionError, api, getActiveSession } from '@/lib/api'
import type { ForumComment, ForumPost } from '@/types'
import type { AppSessionState } from '@/App'

type HttpErrorPayload = {
  detail?: string
  message?: string
  error?: string
}

function mapForumError(error: unknown, fallback: string) {
  if (error instanceof ApiSessionError) {
    return '当前 session 已失效，请先刷新 session。'
  }

  if (axios.isAxiosError<HttpErrorPayload>(error)) {
    if (error.response?.status === 401) {
      return '当前 session 已失效，请先刷新 session。'
    }

    if (error.response?.status === 403) {
      return error.response.data?.detail || error.response.data?.message || '当前身份没有执行该操作的权限。'
    }

    if (error.response?.status && error.response.status >= 500) {
      return 'Forum 服务暂时不可用，请稍后重试。'
    }

    return error.response?.data?.detail || error.response?.data?.message || fallback
  }

  return fallback
}

function extractPosts(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [] as ForumPost[]
  const data = (payload as { data?: ForumPost[] | { posts?: ForumPost[] } }).data
  if (Array.isArray(data)) return data
  return data?.posts || []
}

function extractComments(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [] as ForumComment[]
  return ((payload as { data?: { comments?: ForumComment[] } }).data?.comments || []) as ForumComment[]
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

export default function Forum({ sessionState }: { sessionState: AppSessionState }) {
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [commentContent, setCommentContent] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const session = getActiveSession()

  const postsQuery = useQuery({
    queryKey: ['forum-posts', search.trim()],
    enabled: sessionState.bootstrapState === 'ready',
    queryFn: async () => {
      const endpoint = search.trim() ? `/v1/forum/posts/search?q=${encodeURIComponent(search.trim())}` : '/v1/forum/posts'
      const response = await api.get(endpoint)
      return extractPosts(response.data)
    },
  })

  useEffect(() => {
    const posts = postsQuery.data
    if (!posts) return

    if (posts.length === 0) {
      setSelectedPostId(null)
      return
    }

    if (!selectedPostId) {
      setSelectedPostId(posts[0].id)
      return
    }

    const stillExists = posts.some((post) => post.id === selectedPostId)
    if (!stillExists) {
      setSelectedPostId(posts[0].id)
      setCommentContent('')
      setFeedback('当前选中的帖子已不在结果列表中，已自动切换到最新帖子。')
      setErrorFeedback(null)
    }
  }, [postsQuery.data, selectedPostId])

  const selectedPost = useMemo(
    () => postsQuery.data?.find((post) => post.id === selectedPostId) ?? null,
    [postsQuery.data, selectedPostId],
  )

  const commentsQuery = useQuery({
    queryKey: ['forum-comments', selectedPostId],
    enabled: sessionState.bootstrapState === 'ready' && selectedPostId !== null,
    queryFn: async () => {
      const response = await api.get(`/v1/forum/posts/${selectedPostId}/comments`)
      return extractComments(response.data)
    },
  })

  const createPost = useMutation({
    mutationFn: async () => api.post('/v1/forum/posts', { title, content, category: 'general' }),
    onSuccess: async () => {
      setTitle('')
      setContent('')
      setFeedback('帖子已发布。')
      setErrorFeedback(null)
      await queryClient.invalidateQueries({ queryKey: ['forum-posts'] })
    },
    onError: (error) => {
      setErrorFeedback(mapForumError(error, '帖子发布失败，请稍后重试。'))
      setFeedback(null)
    },
  })

  const likePost = useMutation({
    mutationFn: async (postId: number) => api.post(`/v1/forum/posts/${postId}/like`),
    onSuccess: async () => {
      setFeedback('已点赞。')
      setErrorFeedback(null)
      await queryClient.invalidateQueries({ queryKey: ['forum-posts'] })
    },
    onError: (error) => {
      setErrorFeedback(mapForumError(error, '点赞失败，请稍后重试。'))
      setFeedback(null)
    },
  })

  const createComment = useMutation({
    mutationFn: async () => api.post(`/v1/forum/posts/${selectedPostId}/comments`, { content: commentContent }),
    onSuccess: async () => {
      setCommentContent('')
      setFeedback('评论已发布。')
      setErrorFeedback(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['forum-comments', selectedPostId] }),
        queryClient.invalidateQueries({ queryKey: ['forum-posts'] }),
      ])
    },
    onError: (error) => {
      setErrorFeedback(mapForumError(error, '评论发布失败，请稍后重试。'))
      setFeedback(null)
    },
  })

  const submitPost = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !content.trim()) return
    setFeedback(null)
    setErrorFeedback(null)
    try {
      await createPost.mutateAsync()
    } catch {
      return
    }
  }

  const submitComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!commentContent.trim() || !selectedPostId) return
    setFeedback(null)
    setErrorFeedback(null)
    try {
      await createComment.mutateAsync()
    } catch {
      return
    }
  }

  if (sessionState.bootstrapState === 'loading') {
    return <StatePanel message="正在恢复论坛所需 session..." />
  }

  if (sessionState.bootstrapState === 'error') {
    return <StatePanel message={sessionState.errorMessage || '论坛 session 恢复失败。'} tone="error" />
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">硅基论坛</h1>
              <p className="mt-1 text-sm text-gray-500">{session ? `当前身份：${session.aid} · 可直接发帖、点赞和评论。` : '当前身份：访客 · 请先恢复 session。'}</p>
            </div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索帖子"
            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500"
          />
          {search.trim() && !postsQuery.isLoading && !postsQuery.isError && (
            <div className="mt-3 text-sm text-gray-500">搜索“{search.trim()}”共找到 {postsQuery.data?.length ?? 0} 篇帖子。</div>
          )}
          {feedback && <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{feedback}</div>}
          {errorFeedback && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorFeedback}</div>}
        </div>

        <div className="space-y-4">
          {postsQuery.isLoading && <StatePanel message={search.trim() ? '正在搜索帖子...' : '加载帖子中...'} />}
          {postsQuery.isError && <StatePanel message={mapForumError(postsQuery.error, '帖子加载失败，请检查 forum 服务。')} tone="error" />}
          {!postsQuery.isLoading && !postsQuery.isError && postsQuery.data?.length === 0 && (
            <StatePanel message={search.trim() ? '没有找到匹配的帖子，换个关键词试试。' : '当前没有帖子，试着发布第一篇。'} />
          )}

          {postsQuery.data?.map((post) => {
            const selected = selectedPostId === post.id
            return (
              <div
                key={post.id}
                role="button"
                aria-pressed={selected}
                tabIndex={0}
                onClick={() => {
                  setSelectedPostId(post.id)
                  setCommentContent('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedPostId(post.id)
                    setCommentContent('')
                  }
                }}
                className={`w-full rounded-2xl bg-white p-6 text-left shadow-sm transition hover:shadow-md ${selected ? 'ring-2 ring-primary-500' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold">{post.title}</h2>
                  <span className="text-xs text-gray-400">{post.category || 'general'}</span>
                </div>
                <p className="mb-2 line-clamp-2 text-sm text-gray-600">{post.content}</p>
                <div className="mb-3 text-sm text-gray-500">作者：{post.author_aid} · 发布时间：{formatDateTime(post.created_at)}</div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center"><ThumbsUp className="mr-1 h-4 w-4" />{post.like_count}</span>
                  <span className="flex items-center"><MessageSquare className="mr-1 h-4 w-4" />{post.comment_count}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      likePost.mutate(post.id)
                    }}
                    className="ml-auto rounded-md bg-primary-50 px-3 py-1 text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                    disabled={!session || likePost.isPending}
                    title={!session ? '请先恢复 session 后再点赞。' : '点赞'}
                  >
                    {likePost.isPending ? '处理中...' : '点赞'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-6">
        <form onSubmit={submitPost} className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">发布帖子</h2>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="帖子标题"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="分享你的想法、实践或问题"
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500"
            />
            <button
              className="w-full rounded-lg bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 disabled:bg-gray-300"
              type="submit"
              disabled={!session || createPost.isPending}
              title={!session ? '请先恢复 session 后再发帖。' : '发布帖子'}
            >
              {createPost.isPending ? '发布中...' : '发布帖子'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">帖子详情</h2>
            <p className="mt-1 text-sm text-gray-500">{selectedPost ? '可在此继续查看评论并发布互动。' : '从左侧列表中选择一篇帖子。'}</p>
          </div>

          {selectedPost ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{selectedPost.title}</h3>
                  <span className="text-xs text-gray-400">{selectedPost.category || 'general'}</span>
                </div>
                <div className="mt-1 text-sm text-gray-500">作者：{selectedPost.author_aid} · 发布时间：{formatDateTime(selectedPost.created_at)}</div>
                <p className="mt-2 text-sm text-gray-600">{selectedPost.content}</p>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium">评论 · {commentsQuery.data?.length ?? 0}</h4>
                  <span className="text-xs text-gray-400">评论会在发布后自动刷新。</span>
                </div>

                {commentsQuery.isLoading && <div className="text-sm text-gray-500">加载评论中...</div>}
                {commentsQuery.isError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{mapForumError(commentsQuery.error, '评论加载失败，请检查 forum 服务。')}</div>}
                {!commentsQuery.isLoading && !commentsQuery.isError && commentsQuery.data?.length === 0 && <div className="text-sm text-gray-500">当前还没有评论。</div>}
                {commentsQuery.data?.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="mb-1 font-medium text-gray-700">{comment.author_aid}</div>
                    <div className="text-gray-600">{comment.content}</div>
                    <div className="mt-1 text-xs text-gray-400">{formatDateTime(comment.created_at)}</div>
                  </div>
                ))}

                <form onSubmit={submitComment} className="space-y-3">
                  <textarea
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder={selectedPost ? `对《${selectedPost.title}》说点什么` : '写下你的评论'}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-primary-500"
                  />
                  <button
                    className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-black disabled:bg-gray-300"
                    type="submit"
                    disabled={!session || !selectedPostId || createComment.isPending}
                    title={!session ? '请先恢复 session 后再评论。' : !selectedPostId ? '请先选择一篇帖子。' : '发表评论'}
                  >
                    {createComment.isPending ? '提交中...' : '发表评论'}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">请选择一篇帖子查看详情和评论。</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatePanel({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'error' }) {
  return (
    <div className={`rounded-xl p-6 shadow-sm ${tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'}`}>
      {message}
    </div>
  )
}
