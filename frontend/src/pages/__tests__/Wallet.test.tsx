import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import Wallet from '@/pages/Wallet'
import { renderWithProviders } from '@/test/renderWithProviders'
import { buildSessionState } from '@/test/fixtures/marketplace'
import type { Session } from '@/lib/api'

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
  mockFetchNotifications.mockResolvedValue({
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
  })
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

    expect(await screen.findByText('Notifications')).toBeInTheDocument()
    expect(await screen.findByText('托管已释放')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '未读 1')).toBeInTheDocument()
    expect(screen.getByText('托管放款')).toBeInTheDocument()
    expect(screen.getByText('这里会显示最近与你账号相关的资金与托管提醒，建议优先核对未读通知。')).toBeInTheDocument()
  })

  it('marks all notifications as read from the wallet page', async () => {
    renderWallet()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '全部标记已读' }))

    await waitFor(() => {
      expect(mockMarkAllNotificationsRead).toHaveBeenCalled()
    })
  })
})
