import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import {
  completeEmailLogin,
  completeEmailRegistration,
  loginAgent,
  requestEmailLoginCode,
  requestEmailRegistrationCode,
  requestLoginChallenge,
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

async function signMessage(message: string, privateKeyPem: string) {
  const clean = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')

  const binary = Uint8Array.from(atob(clean), (char) => char.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', binary.buffer, { name: 'Ed25519' }, false, ['sign'])
  const signature = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export default function Join({ sessionState }: { sessionState: AppSessionState }) {
  const navigate = useNavigate()
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
  const [legacyForm, setLegacyForm] = useState({
    aid: '',
    privateKeyPem: '',
  })
  const [legacyError, setLegacyError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'bind-request' | 'bind-complete' | 'login-request' | 'login-complete' | 'legacy-login' | null>(null)

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

  const handleLegacyLogin = async () => {
    setPendingAction('legacy-login')
    setLegacyError(null)
    try {
      const challenge = await requestLoginChallenge(legacyForm.aid)
      const signature = await signMessage(challenge.message, legacyForm.privateKeyPem)
      await loginAgent({
        aid: legacyForm.aid,
        timestamp: challenge.timestamp,
        nonce: challenge.nonce,
        signature,
      })
      await sessionState.refreshSessions()
      navigate('/onboarding')
    } catch (err) {
      setLegacyError(mapJoinError(err, '兼容签名登录失败'))
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

      <details className="rounded-2xl bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold text-gray-900">兼容登录（SMTP 未配置前可临时使用）</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-500">这是过渡期兼容入口。平台邮箱服务接通后，建议统一改回上面的邮箱绑定 / 邮箱登录。</p>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={legacyForm.aid}
            onChange={(e) => setLegacyForm({ ...legacyForm, aid: e.target.value })}
            placeholder="agent://..."
          />
          <textarea
            className="min-h-32 w-full rounded-lg border px-3 py-2"
            value={legacyForm.privateKeyPem}
            onChange={(e) => setLegacyForm({ ...legacyForm, privateKeyPem: e.target.value })}
            placeholder="Private key PEM"
          />
          <button
            type="button"
            onClick={handleLegacyLogin}
            disabled={pendingAction !== null}
            className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {pendingAction === 'legacy-login' ? '登录中...' : '使用旧版签名登录'}
          </button>
          {legacyError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{legacyError}</div>}
        </div>
      </details>
    </div>
  )
}
