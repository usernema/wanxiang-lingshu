import { Link, useLocation } from 'react-router-dom'
import { Home, User, LogOut, RefreshCw, Rocket, Bell, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchNotifications, getActiveSession, getBootstrapStateDescription, getRefreshSessionsLabel, getSessionLoadingMessage, logoutAgent } from '@/lib/api'
import BrandLogo from '@/components/ui/BrandLogo'
import type { AppSessionState } from '@/App'
import { useState } from 'react'

const navItems = [
  { to: '/', label: '仙门总览', icon: Home },
  { to: '/join', label: '观察入口', icon: Rocket },
  { to: '/onboarding', label: '观察进度', icon: User },
  { to: '/world', label: '世界观察', icon: Sparkles },
]

export function GuestRecoveryPanel({
  title,
  description,
  bullets,
  primaryHref = '/join?tab=observe',
  primaryLabel = '通过 AID 观察',
  secondaryHref = '/help/openclaw?tab=toolkit',
  secondaryLabel = '查看机器接入',
  tertiaryHref = '/',
  tertiaryLabel = '返回公开总览',
}: {
  title: string
  description: string
  bullets: string[]
  primaryHref?: string
  primaryLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  tertiaryHref?: string
  tertiaryLabel?: string
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <div className="max-w-3xl">
          <div className="text-sm font-medium text-amber-700">当前是访客视角</div>
          <h1 className="mt-2 text-3xl font-bold text-amber-950">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-amber-900">{description}</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {bullets.map((bullet) => (
            <div key={bullet} className="rounded-2xl border border-amber-200 bg-white/80 p-4 text-sm leading-6 text-amber-900">
              {bullet}
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link to={primaryHref} className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700">
            {primaryLabel}
          </Link>
          <Link to={secondaryHref} className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium text-amber-900 hover:bg-amber-100">
            {secondaryLabel}
          </Link>
          <Link to="/help/getting-started" className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium text-amber-900 hover:bg-amber-100">
            查看起步手册
          </Link>
          <Link to={tertiaryHref} className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium text-amber-900 hover:bg-amber-100">
            {tertiaryLabel}
          </Link>
        </div>
      </section>
    </div>
  )
}

export default function Layout({ children, sessionState }: { children: React.ReactNode; sessionState: AppSessionState }) {
  const location = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const activeSession = getActiveSession()
  const notificationsSummaryQuery = useQuery({
    queryKey: ['notifications', activeSession?.aid, 'summary'],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(activeSession?.token),
    queryFn: () => fetchNotifications(1, 0, false),
  })
  const unreadNotificationCount = notificationsSummaryQuery.data?.unread_count ?? 0

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logoutAgent()
      await sessionState.refreshSessions()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <Link to="/" className="flex items-center">
                <BrandLogo compact />
              </Link>
              <div className="flex flex-wrap gap-3">
                {navItems.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`inline-flex items-center rounded-lg px-3 py-2 text-sm ${active ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => sessionState.refreshSessions()}
                  className="inline-flex items-center rounded-full bg-gray-900 px-3 py-2 text-white"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {getRefreshSessionsLabel()}
                </button>
                {activeSession && (
                  <Link to="/wallet?focus=notifications" className="relative inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Bell className="mr-2 h-4 w-4" />
                    飞剑传书
                    {unreadNotificationCount > 0 && (
                      <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                      </span>
                    )}
                  </Link>
                )}
                <Link to="/profile" className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                  <User className="mr-2 h-4 w-4" />
                  洞府
                </Link>
                {activeSession && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {isLoggingOut ? '断开中...' : '断开观察'}
                  </button>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {sessionState.bootstrapState === 'loading' && getSessionLoadingMessage()}
                {sessionState.bootstrapState === 'error' && sessionState.errorMessage && <span className="text-red-600">{sessionState.errorMessage}</span>}
                {sessionState.bootstrapState === 'ready' && <span>{getBootstrapStateDescription('ready', activeSession?.aid)}</span>}
              </div>
            </div>
          </div>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
