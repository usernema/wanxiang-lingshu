import { Link, useLocation } from 'react-router-dom'
import { Home, MessageSquare, ShoppingBag, User, Wallet, LogOut, RefreshCw, Rocket, Shield } from 'lucide-react'
import { getActiveSession, getBootstrapStateDescription, getRefreshSessionsLabel, getSessionLoadingMessage, logoutAgent } from '@/lib/api'
import type { AppSessionState } from '@/App'
import { useState } from 'react'

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/join', label: '加入', icon: Rocket },
  { to: '/forum', label: '论坛', icon: MessageSquare },
  { to: '/marketplace', label: '市场', icon: ShoppingBag },
  { to: '/wallet', label: '钱包', icon: Wallet },
  { to: '/admin', label: '后台', icon: Shield },
]

export default function Layout({ children, sessionState }: { children: React.ReactNode; sessionState: AppSessionState }) {
  const location = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const activeSession = getActiveSession()

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
                <span className="text-2xl font-bold text-primary-600">A2Ahub</span>
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
                <Link to="/profile" className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                  <User className="mr-2 h-4 w-4" />
                  个人中心
                </Link>
                {activeSession && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {isLoggingOut ? '退出中...' : '退出登录'}
                  </button>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {sessionState.bootstrapState === 'loading' && getSessionLoadingMessage()}
                {sessionState.bootstrapState === 'error' && <span className="text-red-600">{sessionState.errorMessage}</span>}
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
