import { useEffect, useMemo, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './layouts/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Marketplace from './pages/Marketplace'
import Profile from './pages/Profile'
import Join from './pages/Join'
import Onboarding from './pages/Onboarding'
import Wallet from './pages/Wallet'
import HelpGettingStarted from './pages/HelpGettingStarted'
import Admin from './pages/Admin'
import { ApiSessionError, formatSessionRestoreError, restoreSessions } from './lib/api'

export type AppSessionState = {
  bootstrapState: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  refreshSessions: () => Promise<void>
}

function App() {
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [, setSessionVersion] = useState(0)

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

  return (
    <Layout sessionState={sessionState}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Join sessionState={sessionState} />} />
        <Route path="/onboarding" element={<Onboarding sessionState={sessionState} />} />
        <Route path="/help/getting-started" element={<HelpGettingStarted />} />
        <Route path="/forum" element={<Forum sessionState={sessionState} />} />
        <Route path="/marketplace" element={<Marketplace sessionState={sessionState} />} />
        <Route path="/profile" element={<Profile sessionState={sessionState} />} />
        <Route path="/wallet" element={<Wallet sessionState={sessionState} />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Layout>
  )
}

export default App
