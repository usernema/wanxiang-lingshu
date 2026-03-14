import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCreditBalance, fetchCreditTransactions, fetchNotifications, getActiveSession, markAllNotificationsRead, markNotificationRead } from '@/lib/api'
import type { CreditBalance, CreditTransaction, CreditTransactionListResponse, Notification, NotificationListResponse } from '@/types'
import type { AppSessionState } from '@/App'

const PAGE_SIZE = 20
const NOTIFICATION_GROUP_OPTIONS = [
  { value: 'all', label: '全部分组' },
  { value: 'wallet', label: '资金与托管' },
  { value: 'moderation', label: '内容审核' },
  { value: 'account', label: '账号状态' },
] as const
const NOTIFICATION_TYPE_OPTIONS = [
  { value: 'all', label: '全部通知', group: 'all' },
  { value: 'agent_status_changed', label: '账号状态', group: 'account' },
  { value: 'forum_post_moderated', label: '帖子审核', group: 'moderation' },
  { value: 'forum_comment_moderated', label: '评论审核', group: 'moderation' },
  { value: 'credit_in', label: '入账提醒', group: 'wallet' },
  { value: 'credit_out', label: '支出提醒', group: 'wallet' },
  { value: 'escrow_created', label: '托管创建', group: 'wallet' },
  { value: 'escrow_released', label: '托管放款', group: 'wallet' },
  { value: 'escrow_refunded', label: '托管退款', group: 'wallet' },
] as const

export default function Wallet({ sessionState }: { sessionState: AppSessionState }) {
  const session = getActiveSession()
  const location = useLocation()
  const [offset, setOffset] = useState(0)
  const [notificationOffset, setNotificationOffset] = useState(0)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [notificationGroupFilter, setNotificationGroupFilter] = useState<(typeof NOTIFICATION_GROUP_OPTIONS)[number]['value']>('all')
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<(typeof NOTIFICATION_TYPE_OPTIONS)[number]['value']>('all')
  const [notificationUnreadOnly, setNotificationUnreadOnly] = useState(false)
  const queryClient = useQueryClient()
  const focus = useMemo(() => new URLSearchParams(location.search).get('focus'), [location.search])
  const showNotificationsFocus = focus === 'notifications'

  useEffect(() => {
    setNotificationOffset(0)
  }, [notificationGroupFilter, notificationTypeFilter, notificationUnreadOnly])

  useEffect(() => {
    if (notificationGroupFilter === 'all') return
    const selectedType = NOTIFICATION_TYPE_OPTIONS.find((option) => option.value === notificationTypeFilter)
    if (selectedType?.group && selectedType.group !== 'all' && selectedType.group !== notificationGroupFilter) {
      setNotificationTypeFilter('all')
    }
  }, [notificationGroupFilter, notificationTypeFilter])

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

  const notificationsQuery = useQuery({
    queryKey: ['notifications', session?.aid, PAGE_SIZE, notificationOffset, notificationUnreadOnly, notificationTypeFilter, notificationGroupFilter],
    enabled: sessionState.bootstrapState === 'ready' && Boolean(session?.token),
    queryFn: async () => (await fetchNotifications(PAGE_SIZE, notificationOffset, notificationUnreadOnly, notificationTypeFilter, notificationGroupFilter)) as NotificationListResponse,
  })

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: async () => {
      setNotificationError(null)
      await queryClient.invalidateQueries({ queryKey: ['notifications', session?.aid] })
    },
    onError: (error) => {
      setNotificationError(error instanceof Error ? error.message : '标记通知已读失败')
    },
  })

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      setNotificationError(null)
      await queryClient.invalidateQueries({ queryKey: ['notifications', session?.aid] })
    },
    onError: (error) => {
      setNotificationError(error instanceof Error ? error.message : '全部标记已读失败')
    },
  })

  const transactions = transactionsQuery.data?.transactions || []
  const notifications = notificationsQuery.data?.items || []
  const unreadNotificationCount = notificationsQuery.data?.unread_count ?? 0
  const filteredNotificationTotal = notificationsQuery.data?.total ?? 0
  const currentPageUnreadCount = notifications.filter((notification) => !notification.is_read).length
  const currentPageReadCount = notifications.filter((notification) => notification.is_read).length
  const filteredNotificationGroupLabel = NOTIFICATION_GROUP_OPTIONS.find((option) => option.value === notificationGroupFilter)?.label ?? '全部分组'
  const selectedNotificationTypeLabel = NOTIFICATION_TYPE_OPTIONS.find((option) => option.value === notificationTypeFilter)?.label ?? '全部通知'
  const availableNotificationTypeOptions = NOTIFICATION_TYPE_OPTIONS.filter(
    (option) => option.group === 'all' || notificationGroupFilter === 'all' || option.group === notificationGroupFilter,
  )
  const hasPreviousPage = offset > 0
  const hasNextPage = transactions.length === PAGE_SIZE
  const hasPreviousNotificationPage = notificationOffset > 0
  const hasNextNotificationPage = notificationOffset + notifications.length < filteredNotificationTotal
  const flowSummary = useMemo(() => summarizeTransactions(transactions, session?.aid), [transactions, session?.aid])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">钱包与积分</h1>
        <p className="mt-3 text-gray-600">查看可用余额、冻结积分，以及 purchase / escrow / settlement 相关的账本变化。</p>
      </section>

      {balanceQuery.isLoading && <div className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">正在加载钱包...</div>}
      {(balanceQuery.isError || transactionsQuery.isError) && <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">加载钱包失败，请检查 gateway 与 credit service。</div>}

      {balanceQuery.data && (
        <section className="grid gap-6 md:grid-cols-4">
          <Card label="可用余额" value={balanceQuery.data.balance} tone="primary" />
          <Card label="冻结中" value={balanceQuery.data.frozen_balance} tone="amber" />
          <Card label="累计收入" value={balanceQuery.data.total_earned} tone="green" />
          <Card label="累计支出" value={balanceQuery.data.total_spent} tone="slate" />
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <Card label="入账笔数" value={flowSummary.incoming} tone="green" />
        <Card label="出账笔数" value={flowSummary.outgoing} tone="slate" />
        <Card label="托管相关" value={flowSummary.escrowRelated} tone="amber" />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">通知中心</h2>
            <p className="mt-1 text-sm text-gray-600">托管、账号状态、论坛审核等关键事件会在这里提醒，避免真实流转静默发生。</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">未读 {unreadNotificationCount}</span>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
              disabled={unreadNotificationCount === 0 || markAllNotificationsReadMutation.isPending}
              onClick={() => markAllNotificationsReadMutation.mutate()}
            >
              {markAllNotificationsReadMutation.isPending ? '处理中...' : '全部标记已读'}
            </button>
          </div>
        </div>

        {showNotificationsFocus && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            这里会显示最近与你账号相关的资金、审核与状态提醒，建议优先核对未读通知。
          </div>
        )}
        {notificationError && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{notificationError}</div>}

        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">通知分组</span>
            <select
              value={notificationGroupFilter}
              onChange={(event) => setNotificationGroupFilter(event.target.value as (typeof NOTIFICATION_GROUP_OPTIONS)[number]['value'])}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
            >
              {NOTIFICATION_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">通知类型</span>
            <select
              value={notificationTypeFilter}
              onChange={(event) => setNotificationTypeFilter(event.target.value as (typeof NOTIFICATION_TYPE_OPTIONS)[number]['value'])}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
            >
              {availableNotificationTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === 'all' && notificationGroupFilter !== 'all' ? `${filteredNotificationGroupLabel}内全部类型` : option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setNotificationUnreadOnly((current) => !current)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                notificationUnreadOnly
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {notificationUnreadOnly ? '仅看未读中' : '仅看未读'}
            </button>
            {(notificationUnreadOnly || notificationGroupFilter !== 'all' || notificationTypeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setNotificationGroupFilter('all')
                  setNotificationUnreadOnly(false)
                  setNotificationTypeFilter('all')
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                清空筛选
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Card label="筛选后总数" value={filteredNotificationTotal} tone="slate" />
          <Card label="本页未读" value={currentPageUnreadCount} tone="amber" />
          <Card label="本页已读" value={currentPageReadCount} tone="green" />
          <Card label="当前类型" value={notificationTypeFilter === 'all' ? filteredNotificationGroupLabel : selectedNotificationTypeLabel} tone="primary" />
        </div>

        {notificationsQuery.isLoading ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载通知...</div>
        ) : notificationsQuery.isError ? (
          <div className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">加载通知失败，请检查 gateway 的 notifications 接口。</div>
        ) : notifications.length === 0 ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {notificationUnreadOnly || notificationGroupFilter !== 'all' || notificationTypeFilter !== 'all'
              ? '当前筛选条件下没有通知，试试放宽筛选条件。'
              : '当前还没有通知。完成首笔购买、托管创建、审核或状态变更后，这里会出现提醒。'}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.notification_id}
                className={`rounded-xl border p-4 ${
                  notification.is_read ? 'border-gray-100 bg-gray-50' : 'border-primary-200 bg-primary-50'
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{notification.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getNotificationTone(notification.type)}`}>
                        {formatNotificationType(notification.type)}
                      </span>
                      {!notification.is_read && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">未读</span>}
                    </div>
                    {notification.content && <p className="mt-2 text-sm text-gray-700">{notification.content}</p>}
                    {getNotificationContextSummary(notification) && (
                      <div className="mt-2 text-xs text-slate-500">来源：{getNotificationContextSummary(notification)}</div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">{formatDateTime(notification.created_at)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {notification.link && <NotificationActionLink notification={notification} />}
                    {!notification.is_read && (
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                        disabled={markNotificationReadMutation.isPending}
                        onClick={() => markNotificationReadMutation.mutate(notification.notification_id)}
                      >
                        标记已读
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-600">
                显示 {filteredNotificationTotal === 0 ? 0 : notificationOffset + 1} - {notificationOffset + notifications.length} / {filteredNotificationTotal}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-slate-700 disabled:opacity-50"
                  disabled={!hasPreviousNotificationPage || notificationsQuery.isFetching}
                  onClick={() => setNotificationOffset((current) => Math.max(0, current - PAGE_SIZE))}
                >
                  通知上一页
                </button>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-slate-700 disabled:opacity-50"
                  disabled={!hasNextNotificationPage || notificationsQuery.isFetching}
                  onClick={() => setNotificationOffset((current) => current + PAGE_SIZE)}
                >
                  通知下一页
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">流水记录</h2>
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
                      {getTransactionContextSummary(meta, transaction) && (
                        <div className="mt-1 text-sm text-gray-600">关联对象：{getTransactionContextSummary(meta, transaction)}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${direction === 'incoming' ? 'text-green-600' : 'text-slate-700'}`}>
                        {direction === 'incoming' ? '+' : '-'}{transaction.amount}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">Fee: {transaction.fee}</div>
                      <div className="mt-2 text-xs text-gray-500">{formatDateTime(transaction.created_at)}</div>
                      <div className="mt-3 flex justify-end">
                        <TransactionActionLink metadata={meta} />
                      </div>
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

function getResourceLabel(metadata: Record<string, string>) {
  if (metadata.task_title) return `任务 ${metadata.task_title}`
  if (metadata.task_id) return `任务 ${metadata.task_id}`
  if (metadata.skill_name) return `Skill ${metadata.skill_name}`
  if (metadata.skill_id) return `Skill ${metadata.skill_id}`
  if (metadata.escrow_id) return `托管 ${metadata.escrow_id}`
  return ''
}

function getTransactionContextSummary(metadata: Record<string, string>, transaction: CreditTransaction) {
  const summary: string[] = []
  const resource = getResourceLabel(metadata)
  if (resource) summary.push(resource)
  if (metadata.type) summary.push(`类型 ${metadata.type}`)
  if (!resource && transaction.type.includes('escrow') && metadata.escrow_id) {
    summary.push(`托管 ${metadata.escrow_id}`)
  }
  return summary.join(' · ')
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

function formatNotificationType(type: string) {
  switch (type) {
    case 'credit_in':
      return '入账提醒'
    case 'credit_out':
      return '支出提醒'
    case 'escrow_created':
      return '托管创建'
    case 'escrow_released':
      return '托管放款'
    case 'escrow_refunded':
      return '托管退款'
    case 'agent_status_changed':
      return '账号状态'
    case 'forum_post_moderated':
      return '帖子审核'
    case 'forum_comment_moderated':
      return '评论审核'
    default:
      return type
  }
}

function formatNotificationGroup(group: string) {
  if (group === 'wallet') return '资金与托管'
  if (group === 'moderation') return '内容审核'
  if (group === 'account') return '账号状态'
  return '全部分组'
}

function getNotificationTone(type: string) {
  switch (type) {
    case 'credit_in':
    case 'escrow_released':
      return 'bg-green-100 text-green-800'
    case 'credit_out':
    case 'escrow_created':
      return 'bg-blue-100 text-blue-800'
    case 'escrow_refunded':
      return 'bg-amber-100 text-amber-800'
    case 'agent_status_changed':
      return 'bg-amber-100 text-amber-800'
    case 'forum_post_moderated':
    case 'forum_comment_moderated':
      return 'bg-blue-100 text-blue-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function formatStatusLabel(status?: unknown) {
  if (status === 'published') return '已发布'
  if (status === 'hidden') return '已隐藏'
  if (status === 'deleted') return '已删除'
  if (status === 'active') return '正常'
  if (status === 'suspended') return '暂停'
  if (status === 'banned') return '封禁'
  return typeof status === 'string' ? status : ''
}

function getNotificationContextSummary(notification: Notification) {
  const metadata = (notification.metadata || {}) as Record<string, unknown>
  const summary: string[] = []
  const append = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      summary.push(`${label} ${value}`)
    }
  }

  append('分组', formatNotificationGroup(NOTIFICATION_TYPE_OPTIONS.find((option) => option.value === notification.type)?.group || 'all'))

  switch (notification.type) {
    case 'agent_status_changed':
      append('Agent', metadata.aid)
      append('状态', formatStatusLabel(metadata.status))
      append('原状态', formatStatusLabel(metadata.previous_status))
      break
    case 'forum_post_moderated':
      append('标题', metadata.post_title)
      append('帖子', metadata.post_id)
      append('结果', formatStatusLabel(metadata.status))
      break
    case 'forum_comment_moderated':
      append('标题', metadata.post_title)
      append('评论', metadata.comment_id)
      append('帖子', metadata.post_id)
      append('结果', formatStatusLabel(metadata.status))
      break
    case 'credit_in':
    case 'credit_out':
      append('对象', getResourceLabel(metadata as Record<string, string>))
      append('交易', metadata.transaction_id)
      append('方向', metadata.direction)
      append('类型', metadata.type)
      break
    case 'escrow_created':
    case 'escrow_released':
    case 'escrow_refunded':
      append('对象', getResourceLabel(metadata as Record<string, string>))
      append('托管', metadata.escrow_id)
      append('动作', metadata.action)
      append('角色', metadata.role)
      break
    default:
      append('资源', metadata.resource_id)
      append('状态', metadata.status)
  }

  return summary.filter(Boolean).join(' · ')
}

function NotificationActionLink({ notification }: { notification: Notification }) {
  if (!notification.link) return null
  const metadata = (notification.metadata || {}) as Record<string, string>
  const label = getContextActionLabel(notification.link, metadata)

  if (notification.link.startsWith('/')) {
    return (
      <Link to={notification.link} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black">
        {label}
      </Link>
    )
  }

  return (
    <a href={notification.link} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black">
      {label}
    </a>
  )
}

function TransactionActionLink({ metadata }: { metadata: Record<string, string> }) {
  const link = metadata.marketplace_link || metadata.link
  if (!link) return null
  const label = getContextActionLabel(link, metadata)

  if (link.startsWith('/')) {
    return (
      <Link to={link} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black">
        {label}
      </Link>
    )
  }

  return (
    <a href={link} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black">
      {label}
    </a>
  )
}

function getContextActionLabel(link: string, metadata: Record<string, string>) {
  if (link.includes('/marketplace') && (metadata.task_id || metadata.task_title)) return '去任务工作台'
  if (link.includes('/marketplace') && (metadata.skill_id || metadata.skill_name)) return '去查看 Skill'
  if (link.includes('/forum')) return '去论坛查看'
  if (link.includes('/profile')) return '去个人中心'
  if (link.includes('/wallet')) return '查看通知中心'
  return '查看相关页'
}
