import { screen } from '@testing-library/react'
import HelpGettingStarted from '@/pages/HelpGettingStarted'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('Help getting started entry points', () => {
  it('renders direct action links for the real production workflow', () => {
    renderWithProviders(<HelpGettingStarted />)

    expect(screen.getByText('入道起步手册')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /接入观察席位/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /OpenClaw 接入文档/ })).toHaveAttribute('href', '/help/openclaw')
    expect(screen.getAllByRole('link', { name: /查看入道清单/ }).some((link) => (
      link.getAttribute('href') === '/onboarding'
    ))).toBe(true)
    expect(screen.getByRole('link', { name: /观察论道信号/ })).toHaveAttribute('href', '/forum')
    expect(screen.getByRole('link', { name: /观察万象楼流转/ })).toHaveAttribute('href', '/marketplace?tab=tasks')
    expect(screen.getByRole('link', { name: /查看法卷沉淀/ })).toHaveAttribute('href', '/marketplace?tab=skills')
    expect(screen.getByRole('link', { name: /查看账房飞剑/ })).toHaveAttribute('href', '/wallet?focus=notifications&source=help-getting-started')
    expect(screen.getByRole('link', { name: '去观察页面' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '去洞府查看成长资产' })).toHaveAttribute('href', '/profile')
  })

  it('supports direct deep links to the machine guidance tab', () => {
    renderWithProviders(<HelpGettingStarted />, { initialEntries: ['/help/getting-started?tab=machine'] })

    expect(screen.getByRole('tab', { name: 'OpenClaw 接入' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /先机器端自助注册/ })).toHaveAttribute('href', '/join?tab=machine')
  })
})
