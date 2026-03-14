import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import Wallet from '@/pages/Wallet'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import type { Session } from '@/lib/api'
import type { NotificationListResponse } from '@/types'

const mockFetchCreditBalance = vi.fn()
const mockFetchCreditTransactions = vi.fn()
const mockFetchNotifications = vi.fn()
const mockMarkNotificationRead = vi.fn()
const mockMarkAllNotificationsRead = vi.fn()
const mockGetActiveSession = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    fetchCreditBalance: () => mockFetchCreditBalance(),
    fetchCreditTransactions: (...args: unknown[]) => mockFetchCreditTransactions(...args),
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
    markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
    getActiveSession: () => mockGetActiveSession(),
  }
})

const activeSession: Session = {
  aid: 'worker-agent',
  token: 'worker-token',
  role: 'worker',
}

function renderWallet(initialEntries = ['/wallet']) {
  mockGetActiveSession.mockReturnValue(activeSession)
  mockFetchCreditBalance.mockResolvedValue({
    aid: 'worker-agent',
    balance: 120,
    frozen_balance: 15,
    total_earned: 320,
    total_spent: 200,
  })
  mockFetchCreditTransactions.mockResolvedValue({
    transactions: [],
    limit: 20,
    offset: 0,
  })
  const defaultNotifications = {
    items: [
      {
        notification_id: 'notif_1',
        recipient_aid: 'worker-agent',
        type: 'escrow_released',
        title: '托管已释放',
        content: '你的托管已完成放款。',
        link: '/wallet?focus=notifications',
        is_read: false,
        metadata: { escrow_id: 'escrow_1' },
        created_at: '2026-03-14T00:00:00.000Z',
      },
    ],
    total: 1,
    unread_count: 1,
    limit: 20,
    offset: 0,
  }
  mockFetchNotifications.mockResolvedValue(defaultNotifications)
  mockMarkNotificationRead.mockResolvedValue({})
  mockMarkAllNotificationsRead.mockResolvedValue({ updated: 1 })

  return renderWithProviders(
    <Routes>
      <Route path="/wallet" element={<Wallet sessionState={buildSessionState()} />} />
    </Routes>,
    { initialEntries },
  )
}

function renderWalletWithNotifications(notifications: NotificationListResponse, initialEntries = ['/wallet']) {
  mockGetActiveSession.mockReturnValue(activeSession)
  mockFetchCreditBalance.mockResolvedValue({
    aid: 'worker-agent',
    balance: 120,
    frozen_balance: 15,
    total_earned: 320,
    total_spent: 200,
  })
  mockFetchCreditTransactions.mockResolvedValue({
    transactions: [],
    limit: 20,
    offset: 0,
  })
  mockFetchNotifications.mockResolvedValue(notifications)
  mockMarkNotificationRead.mockResolvedValue({})
  mockMarkAllNotificationsRead.mockResolvedValue({ updated: 1 })

  return renderWithProviders(
    <Routes>
      <Route path="/wallet" element={<Wallet sessionState={buildSessionState()} />} />
    </Routes>,
    { initialEntries },
  )
}

describe('Wallet notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the notifications section with unread reminder focus', async () => {
    renderWallet(['/wallet?focus=notifications'])

    expect(await screen.findByText('通知中心')).toBeInTheDocument()
    expect(await screen.findByText('托管已释放')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '未读 1')).toBeInTheDocument()
    expect(screen.getAllByText('托管放款').length).toBeGreaterThan(0)
    expect(screen.getByText('这里会显示最近与你账号相关的资金、审核与状态提醒，建议优先核对未读通知。')).toBeInTheDocument()
    expect(screen.getByLabelText('通知分组')).toBeInTheDocument()
    expect(screen.getByLabelText('通知类型')).toBeInTheDocument()
    expect(screen.getByText('筛选后总数')).toBeInTheDocument()
    expect(screen.getByText('当前类型')).toBeInTheDocument()
    expect(screen.getByText(/来源：分组 资金与托管/)).toBeInTheDocument()
  })

  it('marks all notifications as read from the wallet page', async () => {
    renderWallet()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '全部标记已读' }))

    await waitFor(() => {
      expect(mockMarkAllNotificationsRead).toHaveBeenCalled()
    })
  })

  it('supports notification type and unread filters', async () => {
    renderWallet()

    const user = userEvent.setup()
    await screen.findByText('通知中心')

    await user.selectOptions(screen.getByLabelText('通知分组'), 'moderation')

    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenLastCalledWith(20, 0, false, 'all', 'moderation')
    })

    await user.selectOptions(screen.getByLabelText('通知类型'), 'forum_post_moderated')

    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenLastCalledWith(20, 0, false, 'forum_post_moderated', 'moderation')
    })

    await user.click(screen.getByRole('button', { name: '仅看未读' }))

    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenLastCalledWith(20, 0, true, 'forum_post_moderated', 'moderation')
    })
  })

  it('supports notification pagination controls', async () => {
    renderWalletWithNotifications({
      items: Array.from({ length: 20 }, (_, index) => ({
        notification_id: `notif_${index}`,
        recipient_aid: 'worker-agent',
        type: 'agent_status_changed',
        title: `通知 ${index}`,
        content: '内容',
        link: '/profile',
        is_read: index % 2 === 0,
        metadata: null,
        created_at: '2026-03-14T00:00:00.000Z',
      })),
      total: 25,
      unread_count: 5,
      limit: 20,
      offset: 0,
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '通知下一页' }))

    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenLastCalledWith(20, 20, false, 'all', 'all')
    })
  })
})
