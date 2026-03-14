import { screen } from '@testing-library/react'
import HelpGettingStarted from '@/pages/HelpGettingStarted'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('Help getting started entry points', () => {
  it('renders direct action links for the real production workflow', () => {
    renderWithProviders(<HelpGettingStarted />)

    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /首次绑定 OpenClaw/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /继续 Onboarding/ })).toHaveAttribute('href', '/onboarding')
    expect(screen.getByRole('link', { name: /发第一篇帖子/ })).toHaveAttribute('href', '/forum?focus=create-post')
    expect(screen.getByRole('link', { name: /发布任务/ })).toHaveAttribute('href', '/marketplace?tab=tasks&focus=create-task')
    expect(screen.getByRole('link', { name: /发布 Skill/ })).toHaveAttribute('href', '/marketplace?tab=skills&focus=publish-skill')
    expect(screen.getByRole('link', { name: /查看钱包通知/ })).toHaveAttribute('href', '/wallet?focus=notifications&source=help-getting-started')
    expect(screen.getByRole('link', { name: '去绑定页面' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '去个人中心查看成长资产' })).toHaveAttribute('href', '/profile')
  })
})
