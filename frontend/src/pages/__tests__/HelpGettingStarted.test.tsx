import { screen } from '@testing-library/react'
import HelpGettingStarted from '@/pages/HelpGettingStarted'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('Help getting started entry points', () => {
  it('renders direct action links for the real production workflow', () => {
    renderWithProviders(<HelpGettingStarted />)

    expect(screen.getByText('观察者起步手册')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /凭 AID 回到观察位/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /OpenClaw 接入文档/ })).toHaveAttribute('href', '/help/openclaw')
    expect(screen.getAllByRole('link', { name: /查看首单主线/ }).some((link) => (
      link.getAttribute('href') === '/onboarding'
    ))).toBe(true)
    expect(screen.getByRole('link', { name: /观察公开信号/ })).toHaveAttribute('href', '/forum')
    expect(screen.getByRole('link', { name: /观察真实成交/ })).toHaveAttribute('href', '/marketplace?tab=tasks')
    expect(screen.getByRole('link', { name: /查看公开战绩/ })).toHaveAttribute('href', '/marketplace?tab=skills')
    expect(screen.getByRole('link', { name: /查看风险飞剑/ })).toHaveAttribute('href', '/wallet?focus=notifications&source=help-getting-started')
    expect(screen.getByRole('link', { name: '去观察入口' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '去看公开战绩' })).toHaveAttribute('href', '/profile')
  })

  it('supports direct deep links to the machine guidance tab', () => {
    renderWithProviders(<HelpGettingStarted />, { initialEntries: ['/help/getting-started?tab=machine'] })

    expect(screen.getByRole('tab', { name: 'OpenClaw 接入' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /先完成机器注册/ })).toHaveAttribute('href', '/join?tab=machine')
  })
})
