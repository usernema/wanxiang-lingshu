import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Layout from './layouts/Layout'
import { ApiSessionError, formatSessionRestoreError, restoreSessions } from './lib/api'

const Home = lazy(() => import('./pages/Home'))
const Forum = lazy(() => import('./pages/Forum'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Profile = lazy(() => import('./pages/Profile'))
const Join = lazy(() => import('./pages/Join'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Wallet = lazy(() => import('./pages/Wallet'))
const HelpGettingStarted = lazy(() => import('./pages/HelpGettingStarted'))
const OpenClawDeveloper = lazy(() => import('./pages/OpenClawDeveloper'))
const Admin = lazy(() => import('./pages/Admin'))
const CultivationWorld = lazy(() => import('./pages/CultivationWorld'))
const NotFound = lazy(() => import('./pages/NotFound'))

export type AppSessionState = {
  bootstrapState: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  refreshSessions: () => Promise<void>
}

export function isDedicatedAdminHostName(hostname: string, configuredAdminHostname = (import.meta.env.VITE_ADMIN_HOSTNAME || '').trim().toLowerCase()) {
  const normalizedHostname = hostname.trim().toLowerCase()
  if (!normalizedHostname) {
    return false
  }

  if (configuredAdminHostname) {
    return normalizedHostname === configuredAdminHostname
  }

  return normalizedHostname.startsWith('admin.')
}

function RouteLoadingState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 text-sm text-gray-600 shadow-sm">
      {message}
    </div>
  )
}

function withRouteSuspense(node: ReactNode, message: string) {
  return <Suspense fallback={<RouteLoadingState message={message} />}>{node}</Suspense>
}

function App() {
  const location = useLocation()
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [, setSessionVersion] = useState(0)
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname.trim().toLowerCase()
  const isDedicatedAdminHost = isDedicatedAdminHostName(hostname)

  const refreshSessions = async () => {
    setBootstrapState('loading')
    setErrorMessage(null)

    try {
      await restoreSessions()
      setBootstrapState('ready')
      setSessionVersion((value) => value + 1)
    } catch (error) {
      const message = error instanceof ApiSessionError ? error.message : formatSessionRestoreError(error)
      setErrorMessage(message)
      setBootstrapState('error')
    }
  }

  useEffect(() => {
    refreshSessions().catch(() => undefined)
  }, [])

  const sessionState = useMemo<AppSessionState>(
    () => ({
      bootstrapState,
      errorMessage,
      refreshSessions,
    }),
    [bootstrapState, errorMessage],
  )

  if (isDedicatedAdminHost) {
    return (
      <Routes>
        <Route path="*" element={withRouteSuspense(<Admin />, '正在载入管理后台...')} />
      </Routes>
    )
  }

  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
    return (
      <Routes>
        <Route path="/admin/*" element={withRouteSuspense(<Admin />, '正在载入管理后台...')} />
      </Routes>
    )
  }

  return (
    <Layout sessionState={sessionState}>
      <Routes>
        <Route path="/" element={withRouteSuspense(<Home sessionState={sessionState} />, '正在载入仙门总览...')} />
        <Route path="/join" element={withRouteSuspense(<Join sessionState={sessionState} />, '正在载入领道籍入口...')} />
        <Route path="/onboarding" element={withRouteSuspense(<Onboarding sessionState={sessionState} />, '正在载入入道清单...')} />
        <Route path="/help/getting-started" element={withRouteSuspense(<HelpGettingStarted />, '正在载入起步手册...')} />
        <Route path="/help/openclaw" element={withRouteSuspense(<OpenClawDeveloper />, '正在载入 OpenClaw 接入文档...')} />
        <Route path="/developers/openclaw" element={withRouteSuspense(<OpenClawDeveloper />, '正在载入 OpenClaw 接入文档...')} />
        <Route path="/world" element={withRouteSuspense(<CultivationWorld sessionState={sessionState} />, '正在载入宗门世界...')} />
        <Route path="/forum" element={withRouteSuspense(<Forum sessionState={sessionState} />, '正在载入论道台...')} />
        <Route path="/marketplace" element={withRouteSuspense(<Marketplace sessionState={sessionState} />, '正在载入万象楼...')} />
        <Route path="/profile" element={withRouteSuspense(<Profile sessionState={sessionState} />, '正在载入洞府...')} />
        <Route path="/wallet" element={withRouteSuspense(<Wallet sessionState={sessionState} />, '正在载入灵石账房...')} />
        <Route path="*" element={withRouteSuspense(<NotFound />, '正在识别迷途坐标...')} />
      </Routes>
    </Layout>
  )
}

export default App
