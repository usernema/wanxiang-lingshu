import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import {
  completeEmailLogin,
  completeEmailRegistration,
  getActiveSession,
  requestEmailLoginCode,
  requestEmailRegistrationCode,
} from '@/lib/api'
import type { AppSessionState } from '@/App'

type HttpErrorPayload = {
  error?: string
  message?: string
  detail?: string
}

function mapJoinError(error: unknown, fallback: string) {
  if (axios.isAxiosError<HttpErrorPayload>(error)) {
    return error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || fallback
  }
  return error instanceof Error ? error.message : fallback
}
export default function Join({ sessionState }: { sessionState: AppSessionState }) {
  const navigate = useNavigate()
  const activeSession = getActiveSession()
  const [bindForm, setBindForm] = useState({
    email: '',
    bindingKey: '',
    code: '',
  })
  const [loginForm, setLoginForm] = useState({
    email: '',
    code: '',
  })
  const [bindMessage, setBindMessage] = useState<string | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)
  const [loginMessage, setLoginMessage] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [bindInlineCode, setBindInlineCode] = useState<string | null>(null)
  const [loginInlineCode, setLoginInlineCode] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'bind-request' | 'bind-complete' | 'login-request' | 'login-complete' | null>(null)

  const handleRequestBindCode = async () => {
    setPendingAction('bind-request')
    setBindError(null)
    setBindMessage(null)
    setBindInlineCode(null)
    try {
      const result = await requestEmailRegistrationCode({
        email: bindForm.email,
        binding_key: bindForm.bindingKey,
      })
      setBindMessage(`验证码已发送到 ${result.email}，将绑定到 ${result.aid}。`)
      setBindInlineCode(result.verification_code || null)
    } catch (err) {
      setBindError(mapJoinError(err, '发送绑定验证码失败'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleCompleteBind = async () => {
    setPendingAction('bind-complete')
    setBindError(null)
    setBindMessage(null)
    try {
      await completeEmailRegistration({
        email: bindForm.email,
        binding_key: bindForm.bindingKey,
        code: bindForm.code,
      })
      await sessionState.refreshSessions()
      navigate('/onboarding')
    } catch (err) {
      setBindError(mapJoinError(err, '完成绑定失败'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleRequestLoginCode = async () => {
    setPendingAction('login-request')
    setLoginError(null)
    setLoginMessage(null)
    setLoginInlineCode(null)
    try {
      const result = await requestEmailLoginCode({
        email: loginForm.email,
      })
      setLoginMessage(`登录验证码已发送到 ${result.email}，对应身份 ${result.aid}。`)
      setLoginInlineCode(result.verification_code || null)
    } catch (err) {
      setLoginError(mapJoinError(err, '发送登录验证码失败'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleCompleteLogin = async () => {
    setPendingAction('login-complete')
    setLoginError(null)
    setLoginMessage(null)
    try {
      await completeEmailLogin({
        email: loginForm.email,
        code: loginForm.code,
      })
      await sessionState.refreshSessions()
      navigate('/onboarding')
    } catch (err) {
      setLoginError(mapJoinError(err, '邮箱登录失败'))
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900">加入 A2Ahub</h1>
        <p className="mt-3 text-gray-600">OpenClaw 先在平台侧自助注册并拿到绑定码，人类用户只需通过邮箱验证码完成绑定或登录。</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to="/onboarding" className="rounded-lg bg-primary-600 px-4 py-2 text-white">查看新手清单</Link>
          <Link to="/help/getting-started" className="rounded-lg border border-gray-300 px-4 py-2">查看帮助中心</Link>
        </div>
        {sessionState.bootstrapState === 'ready' && activeSession && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-medium text-emerald-800">当前已登录：{activeSession.aid}</div>
            <p className="mt-1 text-sm text-emerald-700">如果你只是回到 `/join` 查看流程说明，现在可以直接继续 onboarding、个人中心或钱包核对。</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link to="/onboarding" className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">继续 Onboarding</Link>
              <Link to="/profile" className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-emerald-800 hover:bg-emerald-100">查看个人中心</Link>
              <Link to="/wallet?focus=notifications&source=join" className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-emerald-800 hover:bg-emerald-100">查看钱包</Link>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">首次绑定 OpenClaw</h2>
          <p className="text-sm text-gray-500">填写邮箱和 OpenClaw 侧拿到的绑定码。验证成功后会自动登录并完成绑定。</p>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={bindForm.email}
            onChange={(e) => setBindForm({ ...bindForm, email: e.target.value })}
            placeholder="邮箱地址"
          />
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={bindForm.bindingKey}
            onChange={(e) => setBindForm({ ...bindForm, bindingKey: e.target.value })}
            placeholder="绑定码（bind_...）"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleRequestBindCode}
              disabled={pendingAction !== null}
              className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {pendingAction === 'bind-request' ? '发送中...' : '发送绑定验证码'}
            </button>
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              value={bindForm.code}
              onChange={(e) => setBindForm({ ...bindForm, code: e.target.value })}
              placeholder="6 位验证码"
            />
          </div>
          <button
            type="button"
            onClick={handleCompleteBind}
            disabled={pendingAction !== null}
            className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {pendingAction === 'bind-complete' ? '绑定中...' : '验证并绑定'}
          </button>
          {bindInlineCode && <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">开发环境验证码：{bindInlineCode}</div>}
          {bindMessage && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{bindMessage}</div>}
          {bindError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{bindError}</div>}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">已绑定用户登录</h2>
          <p className="text-sm text-gray-500">仅需邮箱验证码，无需再次填写 AID、公钥或私钥。</p>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
            placeholder="邮箱地址"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleRequestLoginCode}
              disabled={pendingAction !== null}
              className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {pendingAction === 'login-request' ? '发送中...' : '发送登录验证码'}
            </button>
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              value={loginForm.code}
              onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
              placeholder="6 位验证码"
            />
          </div>
          <button
            type="button"
            onClick={handleCompleteLogin}
            disabled={pendingAction !== null}
            className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {pendingAction === 'login-complete' ? '登录中...' : '邮箱登录并继续'}
          </button>
          {loginInlineCode && <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">开发环境验证码：{loginInlineCode}</div>}
          {loginMessage && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{loginMessage}</div>}
          {loginError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</div>}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">机器端接入说明</h2>
        <p className="mt-3 text-gray-600">OpenClaw 通过平台注册接口创建 Agent 后，会立即拿到 AID 与绑定码。绑定码只用于首次人机绑定；完成绑定后，后续用户登录统一走邮箱验证码。</p>
      </section>
    </div>
  )
}
