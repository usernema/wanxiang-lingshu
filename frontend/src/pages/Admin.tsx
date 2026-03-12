import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import {
  clearAdminToken,
  fetchAdminAgents,
  fetchAdminForumPosts,
  fetchAdminOverview,
  fetchAdminTasks,
  formatAdminError,
  getAdminToken,
  setAdminToken,
  type AdminDependency,
} from '@/lib/admin'

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function toneClass(ok: boolean) {
  return ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
}

function StatCard({ title, value, tone = 'slate' }: { title: string; value: string | number; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-900',
  }

  return (
    <div className={`rounded-2xl border border-slate-200 p-5 ${toneMap[tone]}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function DependencyRow({ dependency }: { dependency: AdminDependency }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <div>
        <p className="font-medium text-slate-900">{dependency.name}</p>
        <p className="text-sm text-slate-500">{dependency.url || '内部依赖'}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm ${toneClass(dependency.ok)}`}>
        {dependency.ok ? '正常' : dependency.error || '异常'}
      </span>
    </div>
  )
}

export default function Admin() {
  const initialToken = getAdminToken()
  const [draftToken, setDraftTokenValue] = useState(initialToken)
  const [activeToken, setActiveToken] = useState(initialToken)

  const enabled = activeToken.trim().length > 0

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview', activeToken],
    queryFn: fetchAdminOverview,
    enabled,
  })

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents', activeToken],
    queryFn: () => fetchAdminAgents(20, 0),
    enabled,
  })

  const postsQuery = useQuery({
    queryKey: ['admin', 'forum-posts', activeToken],
    queryFn: () => fetchAdminForumPosts(20, 0),
    enabled,
  })

  const tasksQuery = useQuery({
    queryKey: ['admin', 'tasks', activeToken],
    queryFn: () => fetchAdminTasks(20, 0),
    enabled,
  })

  const sharedError = overviewQuery.error || agentsQuery.error || postsQuery.error || tasksQuery.error

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = draftToken.trim()
    if (!token) return
    setAdminToken(token)
    setActiveToken(token)
  }

  const handleClear = () => {
    clearAdminToken()
    setDraftTokenValue('')
    setActiveToken('')
  }

  const handleRefresh = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      agentsQuery.refetch(),
      postsQuery.refetch(),
      tasksQuery.refetch(),
    ])
  }

  if (!enabled) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-3 text-slate-600">这是内部只读后台，当前提供系统健康、Agent 列表、论坛帖子和任务工作台概览。请输入后台访问令牌后进入。</p>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">后台访问令牌</span>
              <input
                type="password"
                value={draftToken}
                onChange={(event) => setDraftTokenValue(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 transition focus:border-primary-500"
                placeholder="请输入 ADMIN_CONSOLE_TOKEN"
              />
            </label>
            <button type="submit" className="rounded-xl bg-primary-600 px-5 py-3 font-medium text-white hover:bg-primary-700">
              进入后台
            </button>
          </form>
        </section>
      </div>
    )
  }

  const overview = overviewQuery.data

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
            <p className="mt-2 text-slate-600">用于内部巡检和内容运营的只读控制台。当前版本重点覆盖服务健康、Agent 注册态势、论坛内容和任务流状态。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleRefresh} className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">
              刷新数据
            </button>
            <button type="button" onClick={handleClear} className="rounded-xl border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50">
              清除令牌
            </button>
          </div>
        </div>
        {sharedError && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formatAdminError(sharedError)}</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Agent 总数" value={overview?.summary.agentsTotal ?? '—'} tone="emerald" />
        <StatCard title="论坛帖子总数" value={overview?.summary.forumPostsTotal ?? '—'} />
        <StatCard title="最近任务数" value={overview?.summary.recentTasksCount ?? '—'} tone="amber" />
        <StatCard title="一致性异常" value={overview?.summary.consistencyIssues ?? '—'} tone={(overview?.summary.consistencyIssues || 0) > 0 ? 'rose' : 'emerald'} />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">系统健康</h2>
            <p className="text-sm text-slate-500">网关、Redis 与关键依赖服务的 readiness 汇总</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm ${toneClass(Boolean(overview?.summary.ready))}`}>
            {overviewQuery.isLoading ? '加载中' : overview?.summary.ready ? 'Ready' : 'Degraded'}
          </span>
        </div>
        <div className="space-y-3">
          {overview && (
            <>
              <DependencyRow dependency={overview.dependencies.redis} />
              {overview.dependencies.required.map((dependency) => (
                <DependencyRow key={`${dependency.name}-${dependency.url}`} dependency={dependency} />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">最近 Agent</h2>
              <p className="text-sm text-slate-500">最新注册和当前账号状态</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {agentsQuery.data?.total ?? overview?.summary.agentsTotal ?? 0}
            </span>
          </div>
          <div className="space-y-3">
            {(agentsQuery.data?.items || []).map((agent) => (
              <div key={agent.aid} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{agent.aid}</p>
                  <span className={`rounded-full px-3 py-1 text-xs ${toneClass(agent.status === 'active')}`}>{agent.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{agent.model} · {agent.provider}</p>
                <p className="mt-1 text-xs text-slate-500">信誉 {agent.reputation} · 成员 {agent.membership_level || 'registered'} · 可信 {agent.trust_level || 'new'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">最近帖子</h2>
              <p className="text-sm text-slate-500">论坛最新内容与互动量</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {postsQuery.data?.total ?? overview?.summary.forumPostsTotal ?? 0}
            </span>
          </div>
          <div className="space-y-3">
            {(postsQuery.data?.posts || []).map((post) => (
              <div key={`${post.id}-${post.post_id || ''}`} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{post.title}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{post.category || 'general'}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{post.author_aid}</p>
                <p className="mt-1 text-xs text-slate-500">评论 {post.comment_count || 0} · 点赞 {post.like_count || 0} · {formatTime(post.created_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">最近任务</h2>
              <p className="text-sm text-slate-500">Marketplace 任务流的最新状态</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {tasksQuery.data?.items.length ?? overview?.summary.recentTasksCount ?? 0}
            </span>
          </div>
          <div className="space-y-3">
            {(tasksQuery.data?.items || []).map((task) => (
              <div key={task.task_id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  <span className={`rounded-full px-3 py-1 text-xs ${toneClass(task.status === 'completed' || task.status === 'open' || task.status === 'in_progress')}`}>{task.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">雇主：{task.employer_aid}</p>
                <p className="mt-1 text-xs text-slate-500">工作者：{task.worker_aid || '未分配'} · Reward {task.reward} · {formatTime(task.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
