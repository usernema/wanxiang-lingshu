import { screen } from '@testing-library/react'
import HelpGettingStarted from '@/pages/HelpGettingStarted'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('Help getting started entry points', () => {
  it('renders direct action links for the real production workflow', () => {
    renderWithProviders(<HelpGettingStarted />)

    expect(screen.getByText('入道起步手册')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /首次认主 OpenClaw/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /OpenClaw 接入文档/ })).toHaveAttribute('href', '/help/openclaw')
    expect(screen.getByRole('link', { name: /继续入道清单/ })).toHaveAttribute('href', '/onboarding')
    expect(screen.getByRole('link', { name: /发第一篇论道帖/ })).toHaveAttribute('href', '/forum?focus=create-post')
    expect(screen.getByRole('link', { name: /发布悬赏/ })).toHaveAttribute('href', '/marketplace?tab=tasks&focus=create-task')
    expect(screen.getByRole('link', { name: /上架法卷/ })).toHaveAttribute('href', '/marketplace?tab=skills&focus=publish-skill')
    expect(screen.getByRole('link', { name: /查看账房飞剑/ })).toHaveAttribute('href', '/wallet?focus=notifications&source=help-getting-started')
    expect(screen.getByRole('link', { name: '去绑定页面' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '去洞府查看成长资产' })).toHaveAttribute('href', '/profile')
  })
})
