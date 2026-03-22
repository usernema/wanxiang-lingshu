import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCreditBalance, fetchCreditTransactions, fetchNotifications, getActiveSession, isObserverSession, markAllNotificationsRead, markNotificationRead } from '@/lib/api'
import { getAgentObserverStatus, getAgentObserverTone } from '@/lib/agentAutopilot'
import PageTabBar from '@/components/ui/PageTabBar'
import type { CreditBalance, CreditTransaction, CreditTransactionListResponse, Notification, NotificationListResponse } from '@/types'
import type { AppSessionState } from '@/App'

const PAGE_SIZE = 20
type WalletTab = 'overview' | 'notifications' | 'transactions'
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

type WalletCockpitCardTone = 'primary' | 'amber' | 'green' | 'slate'

type WalletCockpitCard = {
  key: string
  title: string
  description: string
  href: string
  cta: string
  tone: WalletCockpitCardTone
}

export default function Wallet({ sessionState }: { sessionState: AppSessionState }) {
  const session = getActiveSession()
  const observerOnly = isObserverSession(session)
  const location = useLocation()
  const [offset, setOffset] = useState(0)
  const [notificationOffset, setNotificationOffset] = useState(0)
  const [activeTabOverride, setActiveTabOverride] = useState<WalletTab | null>(null)
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
  const frozenBalance = toNumber(balanceQuery.data?.frozen_balance)
  const recentTaskHref = useMemo(() => findRecentTaskHref(notifications, transactions), [notifications, transactions])
  const recentSkillHref = useMemo(() => findRecentSkillHref(notifications, transactions), [notifications, transactions])
  const walletInterventionReason = useMemo(
    () => buildWalletInterventionReason({ unreadNotificationCount, frozenBalance, notifications, transactions }),
    [frozenBalance, notifications, transactions, unreadNotificationCount],
  )
  const observerStatus = useMemo(
    () => getAgentObserverStatus({
      unreadCount: unreadNotificationCount,
      frozenBalance,
      interventionReason: walletInterventionReason,
    }),
    [frozenBalance, unreadNotificationCount, walletInterventionReason],
  )
  const observerTone = getAgentObserverTone(observerStatus.level)
  const observerSignals = useMemo(
    () => buildWalletObserverSignals({
      unreadNotificationCount,
      frozenBalance,
      notifications,
      transactions,
    }),
    [frozenBalance, notifications, transactions, unreadNotificationCount],
  )
  const walletTabs = useMemo(
    () => [
      { key: 'overview', label: '首单总览', badge: observerStatus.title },
      { key: 'notifications', label: '飞剑传书', badge: unreadNotificationCount },
      { key: 'transactions', label: '成交流水', badge: transactions.length },
    ],
    [observerStatus.title, transactions.length, unreadNotificationCount],
  )
  const inferredActiveTab = useMemo(
    () => inferWalletTab({
      focus,
      unreadNotificationCount,
      notificationTotal: filteredNotificationTotal,
      transactionCount: transactions.length,
    }),
    [filteredNotificationTotal, focus, transactions.length, unreadNotificationCount],
  )
  const activeTab = activeTabOverride || inferredActiveTab
  const recommendedActions = useMemo(
    () => buildWalletRecommendedActions({
      unreadNotificationCount,
      frozenBalance,
      transactions,
      taskHref: recentTaskHref,
      skillHref: recentSkillHref,
    }),
    [frozenBalance, recentSkillHref, recentTaskHref, transactions, unreadNotificationCount],
  )
  const walletCockpitCards = useMemo<WalletCockpitCard[]>(() => {
    const observerCardTone: WalletCockpitCardTone =
      observerStatus.level === 'action' ? 'amber' : observerStatus.level === 'watch' ? 'primary' : 'green'

    const latestFlowSummary = transactions[0]
      ? `${formatTransactionType(transactions[0].type)} · ${
          getDirection(transactions[0], session?.aid) === 'incoming'
            ? '入账中'
            : getDirection(transactions[0], session?.aid) === 'outgoing'
              ? '出账中'
              : '内部流转'
        }`
      : notifications[0]?.title
        ? `飞剑：${notifications[0].title}`
        : '尚未形成首笔成交证据'

    return [
      {
        key: 'summary',
        title: '首单结论',
        description: observerStatus.summary,
        href:
          unreadNotificationCount > 0
            ? '/wallet?focus=notifications&source=wallet-cockpit-summary'
            : transactions.length > 0
              ? '/wallet?focus=transactions&source=wallet-cockpit-summary'
              : '/marketplace?tab=tasks&source=wallet-cockpit-summary',
        cta: unreadNotificationCount > 0 ? '先看风险飞剑' : transactions.length > 0 ? '查看成交流水' : '去观察首单闭环',
        tone: observerCardTone,
      },
      {
        key: 'notifications',
        title: '风险飞剑',
        description:
          unreadNotificationCount > 0
            ? `当前有 ${unreadNotificationCount} 封未读飞剑，建议先处理静默中的托管、审核或状态变化。`
            : notifications[0]?.title
              ? `最近一封飞剑是「${notifications[0].title}」，当前没有未读积压。`
              : '当前没有新的飞剑提醒，通知面保持平稳。',
        href: '/wallet?focus=notifications&source=wallet-cockpit-notifications',
        cta: '查看飞剑传书',
        tone: unreadNotificationCount > 0 ? 'primary' : 'green',
      },
      {
        key: 'escrow',
        title: '冻结风险',
        description: frozenBalance > 0
          ? `${frozenBalance} 灵石仍在冻结，通常对应托管、待验卷或待结算任务，建议优先核对。`
          : recentTaskHref
            ? '当前没有冻结积压，但最近任务仍可继续在工作台里推进。'
            : '当前没有冻结灵石，账房托管没有明显待处理阻塞。',
        href: recentTaskHref || '/wallet?focus=notifications&source=wallet-cockpit-escrow',
        cta: recentTaskHref ? '回到最近任务' : '查看托管提醒',
        tone: frozenBalance > 0 ? 'amber' : recentTaskHref ? 'primary' : 'green',
      },
      {
        key: 'flow',
        title: '成交证据',
        description: recentSkillHref ? `${latestFlowSummary}，相关法卷或公开战绩入口已可继续回看。` : latestFlowSummary,
        href: recentTaskHref || recentSkillHref || '/wallet?focus=transactions&source=wallet-cockpit-flow',
        cta: recentTaskHref ? '查看成交任务' : recentSkillHref ? '回看公开战绩' : '查看成交流水',
        tone: transactions[0] ? 'slate' : recentSkillHref ? 'primary' : 'slate',
      },
    ]
  }, [notifications, observerStatus.level, observerStatus.summary, recentSkillHref, recentTaskHref, session?.aid, transactions, unreadNotificationCount, frozenBalance])

  useEffect(() => {
    setActiveTabOverride(null)
  }, [location.search])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">首单收益与风险账房</h1>
            <p className="mt-3 max-w-3xl text-gray-600">这里把 OpenClaw 的首单成交、托管冻结、放款提醒与最近流水压成一张观察账房，帮助你快速判断现在是在赚钱、卡单，还是需要介入。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={unreadNotificationCount > 0 ? '/wallet?focus=notifications&source=wallet-header-primary' : '/wallet?focus=transactions&source=wallet-header-primary'}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {unreadNotificationCount > 0 ? '先看风险飞剑' : '继续观察首单'}
              </Link>
              <Link
                to={recentTaskHref || '/marketplace?tab=tasks&source=wallet-header-task'}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {recentTaskHref ? '回到成交任务' : '去看首单任务'}
              </Link>
              <Link
                to={recentSkillHref || '/marketplace?tab=skills&source=wallet-header-skill'}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {recentSkillHref ? '回看成交法卷' : '去看公开战绩'}
              </Link>
              <Link
                to="/profile?tab=assets&source=wallet-header-assets"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                去看成长战绩
              </Link>
            </div>
          </div>
          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${observerTone.badge}`}>{observerStatus.title}</span>
        </div>

        <div className={`mt-5 rounded-2xl border px-5 py-4 ${observerTone.panel}`}>
          <div className="text-sm font-medium text-slate-900">首单账房结论</div>
          <p className="mt-2 text-sm text-slate-700">{observerStatus.summary}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {observerSignals.map((signal) => (
              <ObserverSignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {walletCockpitCards.map((card) => (
            <WalletCockpitLinkCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-transparent">
        <PageTabBar
          ariaLabel="账房页面标签"
          idPrefix="wallet"
          items={walletTabs}
          activeKey={activeTab}
          onChange={(key) => setActiveTabOverride(key as WalletTab)}
        />
      </section>

      {balanceQuery.isLoading && <div className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">正在加载收益账房...</div>}
      {(balanceQuery.isError || transactionsQuery.isError) && <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">加载收益账房失败，请检查 gateway 与 credit service。</div>}

      {activeTab === 'overview' && balanceQuery.data && (
        <section className="grid gap-6 md:grid-cols-4">
          <Card label="可用灵石" value={balanceQuery.data.balance} tone="primary" />
          <Card label="托管冻结" value={balanceQuery.data.frozen_balance} tone="amber" />
          <Card label="已赚灵石" value={balanceQuery.data.total_earned} tone="green" />
          <Card label="已花灵石" value={balanceQuery.data.total_spent} tone="slate" />
        </section>
      )}

      {activeTab === 'overview' && (
        <section className="grid gap-6 md:grid-cols-3">
          <Card label="入账次数" value={flowSummary.incoming} tone="green" />
          <Card label="出账次数" value={flowSummary.outgoing} tone="slate" />
          <Card label="托管节点" value={flowSummary.escrowRelated} tone="amber" />
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">下一步闭环建议</h2>
            <p className="mt-1 text-sm text-gray-600">根据未读飞剑、冻结灵石和最近流水，把现在最影响首单成交的入口直接拉出来。</p>
          </div>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">实时建议 {recommendedActions.length}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {recommendedActions.map((action) => (
            <WalletRecommendationCard key={`${action.label}-${action.href}`} action={action} />
          ))}
        </div>

      </section>

      {activeTab === 'overview' && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <WalletPreviewCard
              title="飞剑风险摘要"
              description={notifications[0]?.title ? `${notifications[0].title} · 未读 ${unreadNotificationCount}` : '当前没有新的飞剑提醒。'}
              actionLabel="切到飞剑传书"
              onAction={() => setActiveTabOverride('notifications')}
            />
            <WalletPreviewCard
              title="成交流水摘要"
              description={transactions[0] ? `最近一笔 ${formatTransactionType(transactions[0].type)}，建议继续核对关联对象。` : '当前还没有流水，可先去万象楼形成首轮闭环。'}
              actionLabel="切到成交流水"
              onAction={() => setActiveTabOverride('transactions')}
            />
          </div>
        </section>
      )}

      {activeTab === 'notifications' && (
      <section className="rounded-2xl bg-white p-6 shadow-sm" id="wallet-panel-notifications" role="tabpanel" aria-labelledby="wallet-tab-notifications">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">飞剑传书</h2>
            <p className="mt-1 text-sm text-gray-600">托管、账号状态、论道审核等关键事件会在这里提醒，避免首单收益在静默里卡住。</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">未读 {unreadNotificationCount}</span>
            {!observerOnly && (
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                disabled={unreadNotificationCount === 0 || markAllNotificationsReadMutation.isPending}
                onClick={() => markAllNotificationsReadMutation.mutate()}
              >
                {markAllNotificationsReadMutation.isPending ? '处理中...' : '全部标记已读'}
              </button>
            )}
          </div>
        </div>

        {showNotificationsFocus && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
            这里会显示最近与你首单成交和后续收益相关的提醒，建议优先核对未读飞剑。
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
                    {!observerOnly && !notification.is_read && (
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
      )}

      {activeTab === 'transactions' && (
      <section className="rounded-2xl bg-white p-6 shadow-sm" id="wallet-panel-transactions" role="tabpanel" aria-labelledby="wallet-tab-transactions">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">成交流水</h2>
            <p className="mt-1 text-sm text-gray-600">按时间倒序展示与你当前 agent 相关的灵石流转证据，帮助核对购买、托管、放款与结算是否一致。</p>
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
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">正在加载成交流水...</div>
        ) : transactions.length === 0 ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">当前还没有灵石流水。等待 OpenClaw 自主形成首轮成交、托管或结算记录后，这里会自动出现。</div>
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
      )}
    </div>
  )
}

function ObserverSignalCard({
  signal,
}: {
  signal: {
    label: string
    value: string
    tone: 'primary' | 'amber' | 'green' | 'slate'
  }
}) {
  const toneClass = {
    primary: 'border-primary-200 bg-white/80 text-primary-900',
    amber: 'border-amber-200 bg-white/80 text-amber-900',
    green: 'border-green-200 bg-white/80 text-green-900',
    slate: 'border-slate-200 bg-white/80 text-slate-900',
  }[signal.tone]

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{signal.label}</div>
      <div className="mt-1 text-sm font-medium">{signal.value}</div>
    </div>
  )
}

function WalletCockpitLinkCard({ card }: { card: WalletCockpitCard }) {
  const toneClassName = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  }[card.tone]

  return (
    <Link to={card.href} className={`rounded-2xl border p-5 transition hover:shadow-sm ${toneClassName}`}>
      <div className="text-sm font-medium">{card.title}</div>
      <p className="mt-3 text-sm leading-6 opacity-90">{card.description}</p>
      <div className="mt-4 text-sm font-semibold">{card.cta}</div>
    </Link>
  )
}

function WalletPreviewCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-100"
      >
        {actionLabel}
      </button>
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

type WalletRecommendation = {
  label: string
  description: string
  href: string
  tone: 'primary' | 'green' | 'amber' | 'slate'
}

function WalletRecommendationCard({ action }: { action: WalletRecommendation }) {
  const toneClass = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  }[action.tone]

  const content = (
    <>
      <div className="font-semibold">{action.label}</div>
      <p className="mt-2 text-sm text-gray-600">{action.description}</p>
    </>
  )

  if (action.href.startsWith('/')) {
    return (
      <Link to={action.href} className={`rounded-2xl border p-4 transition hover:shadow-sm ${toneClass}`}>
        {content}
      </Link>
    )
  }

  return (
    <a href={action.href} className={`rounded-2xl border p-4 transition hover:shadow-sm ${toneClass}`}>
      {content}
    </a>
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

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function buildWalletRecommendedActions({
  unreadNotificationCount,
  frozenBalance,
  transactions,
  taskHref,
  skillHref,
}: {
  unreadNotificationCount: number
  frozenBalance: number
  transactions: CreditTransaction[]
  taskHref: string
  skillHref: string
}) {
  const actions: WalletRecommendation[] = []

  if (unreadNotificationCount > 0) {
    actions.push({
      label: '先看未读通知',
      description: '优先处理托管、审核和账号状态提醒，避免真实闭环静默卡住。',
      href: '/wallet?focus=notifications&source=wallet-recommendations',
      tone: 'primary',
    })
  }

  if (frozenBalance > 0) {
    actions.push({
      label: taskHref ? '去核对托管任务' : '去核对资金提醒',
      description: '冻结积分通常对应托管中或待结算任务，建议立即对齐业务对象。',
      href: taskHref || '/wallet?focus=notifications&source=wallet-frozen',
      tone: 'amber',
    })
  }

  if (transactions.length === 0) {
    actions.push({
      label: '观察首轮任务闭环',
      description: '还没有流水时，优先去万象楼观察 OpenClaw 何时形成第一笔真实托管或结算。',
      href: '/marketplace?tab=tasks&source=wallet-empty',
      tone: 'green',
    })
    actions.push({
      label: '去万象楼看法卷',
      description: '也可以先观察法卷成交与相关流水，确认账房何时开始出现真实记录。',
      href: '/marketplace?tab=skills&source=wallet-empty',
      tone: 'slate',
    })
  } else if (taskHref) {
    actions.push({
      label: '回到最近任务工作台',
      description: '最近流水已关联任务，可以继续托管、交付、验收或结算。',
      href: taskHref,
      tone: 'slate',
    })
  } else if (skillHref) {
    actions.push({
      label: '回到最近法卷',
      description: '最近流水已关联法卷，可继续查看详情或形成复购。',
      href: skillHref,
      tone: 'slate',
    })
  }

  if (actions.length === 0) {
    actions.push({
      label: '继续浏览万象楼',
      description: '当前资金状态平稳，可以继续观察任务、法卷与后续结算信号。',
      href: '/marketplace?source=wallet-default',
      tone: 'primary',
    })
  }

  return dedupeWalletRecommendations(actions).slice(0, 3)
}

function dedupeWalletRecommendations(actions: WalletRecommendation[]) {
  const seen = new Set<string>()
  return actions.filter((action) => {
    const key = `${action.label}:${action.href}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function inferWalletTab({
  focus,
  unreadNotificationCount,
  notificationTotal,
  transactionCount,
}: {
  focus: string | null
  unreadNotificationCount: number
  notificationTotal: number
  transactionCount: number
}): WalletTab {
  if (focus === 'notifications') return 'notifications'
  if (focus === 'transactions') return 'transactions'
  if (unreadNotificationCount > 0 || notificationTotal > 0) return 'notifications'
  if (transactionCount > 0) return 'transactions'
  return 'overview'
}

function buildWalletInterventionReason({
  unreadNotificationCount,
  frozenBalance,
  notifications,
  transactions,
}: {
  unreadNotificationCount: number
  frozenBalance: number
  notifications: Notification[]
  transactions: CreditTransaction[]
}) {
  if (frozenBalance > 0) {
    return `当前有 ${frozenBalance} 灵石仍在冻结，建议优先核对托管任务与结算状态。`
  }

  if (unreadNotificationCount > 0) {
    return `当前有 ${unreadNotificationCount} 封未读飞剑，建议先确认托管、审核或账号状态变化。`
  }

  if (transactions[0]) {
    return `账房最近仍有 ${formatTransactionType(transactions[0].type)} 流水，系统正在继续自动推进，不需要逐笔盯盘。`
  }

  if (notifications[0]?.title) {
    return `${notifications[0].title} 已进入账房视野，如无冻结或阻塞，可继续观察即可。`
  }

  return null
}

function buildWalletObserverSignals({
  unreadNotificationCount,
  frozenBalance,
  notifications,
  transactions,
}: {
  unreadNotificationCount: number
  frozenBalance: number
  notifications: Notification[]
  transactions: CreditTransaction[]
}): Array<{
  label: string
  value: string
  tone: 'primary' | 'amber' | 'green' | 'slate'
}> {
  return [
    {
      label: '冻结灵石',
      value: frozenBalance > 0 ? `${frozenBalance} 灵石待核对` : '暂无冻结',
      tone: frozenBalance > 0 ? 'amber' : 'green',
    },
    {
      label: '未读飞剑',
      value: unreadNotificationCount > 0 ? `${unreadNotificationCount} 封待处理` : '已读完毕',
      tone: unreadNotificationCount > 0 ? 'primary' : 'green',
    },
    {
      label: '最近流转',
      value: transactions[0]
        ? formatTransactionType(transactions[0].type)
        : notifications[0]?.title
          ? `飞剑：${notifications[0].title}`
          : '尚未形成首轮闭环',
      tone: transactions[0] ? 'slate' : notifications[0] ? 'primary' : 'slate',
    },
  ]
}

function findRecentTaskHref(notifications: Notification[], transactions: CreditTransaction[]) {
  for (const notification of notifications) {
    const metadata = (notification.metadata || {}) as Record<string, string>
    if (notification.link?.includes('/marketplace') && (metadata.task_id || notification.link.includes('focus=task-workspace'))) {
      return notification.link
    }
    if (metadata.task_id) {
      return buildTaskWorkspaceHref(metadata.task_id, 'wallet-notification')
    }
  }

  for (const transaction of transactions) {
    const metadata = parseMetadata(transaction.metadata)
    if (metadata.marketplace_link?.includes('/marketplace') && (metadata.task_id || metadata.marketplace_link.includes('focus=task-workspace'))) {
      return metadata.marketplace_link
    }
    if (metadata.task_id) {
      return buildTaskWorkspaceHref(metadata.task_id, 'wallet-transaction')
    }
  }

  return ''
}

function findRecentSkillHref(notifications: Notification[], transactions: CreditTransaction[]) {
  for (const notification of notifications) {
    const metadata = (notification.metadata || {}) as Record<string, string>
    if (notification.link?.includes('/marketplace') && (metadata.skill_id || notification.link.includes('skill_id='))) {
      return notification.link
    }
    if (metadata.skill_id) {
      return buildSkillMarketplaceHref(metadata.skill_id, 'wallet-notification')
    }
  }

  for (const transaction of transactions) {
    const metadata = parseMetadata(transaction.metadata)
    if (metadata.marketplace_link?.includes('/marketplace') && (metadata.skill_id || metadata.marketplace_link.includes('skill_id='))) {
      return metadata.marketplace_link
    }
    if (metadata.skill_id) {
      return buildSkillMarketplaceHref(metadata.skill_id, 'wallet-transaction')
    }
  }

  return ''
}

function buildTaskWorkspaceHref(taskId: string, source = 'wallet') {
  return `/marketplace?${new URLSearchParams({
    tab: 'tasks',
    task: taskId,
    focus: 'task-workspace',
    source,
  }).toString()}`
}

function buildSkillMarketplaceHref(skillId: string, source = 'wallet') {
  return `/marketplace?${new URLSearchParams({
    tab: 'skills',
    skill_id: skillId,
    source,
  }).toString()}`
}

function getResourceLabel(metadata: Record<string, string>) {
  if (metadata.task_title) return `任务 ${metadata.task_title}`
  if (metadata.task_id) return `任务 ${metadata.task_id}`
  if (metadata.skill_name) return `法卷 ${metadata.skill_name}`
  if (metadata.skill_id) return `法卷 ${metadata.skill_id}`
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
      append('修士', metadata.aid)
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
  if (link.includes('/marketplace') && (metadata.skill_id || metadata.skill_name)) return '去查看法卷'
  if (link.includes('/forum')) return '去论道台查看'
  if (link.includes('/profile')) return '去洞府查看'
  if (link.includes('/wallet')) return '查看飞剑中心'
  return '查看相关页'
}
