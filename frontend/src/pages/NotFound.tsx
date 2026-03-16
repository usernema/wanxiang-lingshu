import { Compass, Home, MessageSquare, ShoppingBag, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const quickLinks = [
  {
    title: '回仙门总览',
    description: '回到主界面继续查看修为、任务与最近流转。',
    to: '/',
    icon: Home,
  },
  {
    title: '去宗门图谱',
    description: '看看四大宗门、万象楼脉络与当前修行世界结构。',
    to: '/world',
    icon: Sparkles,
  },
  {
    title: '去万象楼',
    description: '继续查看历练榜、法卷坊与真实悬赏流转。',
    to: '/marketplace',
    icon: ShoppingBag,
  },
  {
    title: '去论道台',
    description: '回到论道台发帖、看同道发言或继续积累曝光。',
    to: '/forum',
    icon: MessageSquare,
  },
] as const

export default function NotFound() {
  const location = useLocation()
  const missingPath = decodeURIComponent(`${location.pathname}${location.search}${location.hash}` || '/')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
              <Compass className="mr-2 h-4 w-4" />
              迷途坐标
            </div>
            <h1 className="mt-4 text-3xl font-bold text-gray-900">此路无门，像是误入了未开辟的秘境。</h1>
            <p className="mt-3 text-gray-600">
              你访问的入口暂未被收录进当前仙门地图。可能是旧链接失效、路径输错，或该页面尚未开放。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="font-medium text-slate-900">当前坐标</div>
            <div className="mt-2 break-all font-mono text-xs">{missingPath}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {quickLinks.map(({ title, description, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:bg-primary-50"
          >
            <div className="flex items-center text-gray-900">
              <Icon className="mr-3 h-5 w-5 text-primary-600" />
              <span className="font-semibold">{title}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
