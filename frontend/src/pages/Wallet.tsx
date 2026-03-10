import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCreditBalance, fetchCreditTransactions, getActiveSession } from '@/lib/api'
import type { CreditBalance, CreditTransaction, CreditTransactionListResponse } from '@/types'
import type { AppSessionState } from '@/App'

const PAGE_SIZE = 20

export default function Wallet({ sessionState }: { sessionState: AppSessionState }) {
  const session = getActiveSession()
  const [offset, setOffset] = useState(0)

  const balanceQuery = useQuery({
    queryKey: ['wallet-balance', session?.aid],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.token),
    queryFn: async () => (await fetchCreditBalance()) as CreditBalance,
  })

  const transactionsQuery = useQuery({
    queryKey: ['wallet-transactions', session?.aid, offset],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.token),
    queryFn: async () => (await fetchCreditTransactions(PAGE_SIZE, offset)) as CreditTransactionListResponse,
  })

  const transactions = transactionsQuery.data?.transactions || []
  const hasPreviousPage = offset > 0
  const hasNextPage = transactions.length === PAGE_SIZE
  const flowSummary = useMemo(() => summarizeTransactions(transactions, session?.aid), [transactions, session?.aid])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">钱包与积分</h1>
        <p className="mt-3 text-gray-600">查看可用余额、冻结积分，以及试运行期间的 purchase / escrow / settlement 账本变化。</p>
      </section>

      {balanceQuery.isLoading && <div className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">正在加载钱包...</div>}
      {(balanceQuery.isError || transactionsQuery.isError) && <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">加载钱包失败，请检查 gateway 与 credit service。</div>}

      {balanceQuery.data && (
        <section className="grid gap-6 md:grid-cols-4">
          <Card label="Balance" value={balanceQuery.data.balance} tone="primary" />
          <Card label="Frozen" value={balanceQuery.data.frozen_balance} tone="amber" />
          <Card label="Earned" value={balanceQuery.data.total_earned} tone="green" />
          <Card label="Spent" value={balanceQuery.data.total_spent} tone="slate" />
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <Card label="Incoming tx" value={flowSummary.incoming} tone="green" />
        <Card label="Outgoing tx" value={flowSummary.outgoing} tone="slate" />
        <Card label="Escrow-related" value={flowSummary.escrowRelated} tone="amber" />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Transaction history</h2>
            <p className="mt-1 text-sm text-gray-600">按时间倒序展示与你当前 agent 相关的积分流转，帮助核对购买、托管与结算是否一致。</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-gray-700 disabled:opacity-50"
              disabled={!hasPreviousPage || transactionsQuery.isFetching}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-gray-700 disabled:opacity-50"
              disabled={!hasNextPage || transactionsQuery.isFetching}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              下一页
            </button>
          </div>
        </div>

        {transactionsQuery.isLoading ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载 transaction history...</div>
        ) : transactions.length === 0 ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">当前还没有积分流水。先去 Marketplace 购买 skill、发布任务或完成 escrow。</div>
        ) : (
          <div className="mt-6 space-y-3">
            {transactions.map((transaction) => {
              const direction = getDirection(transaction, session?.aid)
              const meta = parseMetadata(transaction.metadata)
              return (
                <div key={transaction.transaction_id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getDirectionTone(direction)}`}>{direction}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{formatTransactionType(transaction.type)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(transaction.status)}`}>{transaction.status}</span>
                      </div>
                      <div className="mt-3 text-sm text-gray-700">Transaction ID: {transaction.transaction_id}</div>
                      <div className="mt-1 text-sm text-gray-600">From: {transaction.from_aid || '—'}</div>
                      <div className="mt-1 text-sm text-gray-600">To: {transaction.to_aid || '—'}</div>
                      {meta.memo && <div className="mt-1 text-sm text-gray-600">Memo: {meta.memo}</div>}
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${direction === 'incoming' ? 'text-green-600' : 'text-slate-700'}`}>
                        {direction === 'incoming' ? '+' : '-'}{transaction.amount}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">Fee: {transaction.fee}</div>
                      <div className="mt-2 text-xs text-gray-500">{formatDateTime(transaction.created_at)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Card({ label, value, tone = 'primary' }: { label: string; value: string | number; tone?: 'primary' | 'green' | 'amber' | 'slate' }) {
  const toneClass = {
    primary: 'text-primary-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
    slate: 'text-slate-700',
  }[tone]

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
      <div className="mt-2 text-sm text-gray-600">{label}</div>
    </div>
  )
}

function summarizeTransactions(transactions: CreditTransaction[], aid?: string) {
  return transactions.reduce(
    (summary, transaction) => {
      const direction = getDirection(transaction, aid)
      if (direction === 'incoming') summary.incoming += 1
      if (direction === 'outgoing') summary.outgoing += 1
      if (transaction.type.includes('escrow')) summary.escrowRelated += 1
      return summary
    },
    { incoming: 0, outgoing: 0, escrowRelated: 0 },
  )
}

function getDirection(transaction: CreditTransaction, aid?: string) {
  if (aid && transaction.to_aid === aid && transaction.from_aid !== aid) return 'incoming'
  if (aid && transaction.from_aid === aid && transaction.to_aid !== aid) return 'outgoing'
  return 'internal'
}

function parseMetadata(metadata?: string) {
  if (!metadata) return {} as Record<string, string>
  try {
    return JSON.parse(metadata) as Record<string, string>
  } catch {
    return {} as Record<string, string>
  }
}

function formatTransactionType(type: string) {
  return type.replace(/_/g, ' ')
}

function getDirectionTone(direction: string) {
  if (direction === 'incoming') return 'bg-green-100 text-green-800'
  if (direction === 'outgoing') return 'bg-slate-100 text-slate-800'
  return 'bg-blue-100 text-blue-800'
}

function getStatusTone(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'processing' || status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'failed' || status === 'cancelled') return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
