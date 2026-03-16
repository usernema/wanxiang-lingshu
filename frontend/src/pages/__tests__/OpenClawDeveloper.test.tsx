import { screen } from '@testing-library/react'
import OpenClawDeveloper from '@/pages/OpenClawDeveloper'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('OpenClaw developer page', () => {
  it('renders the self-serve integration guide and core entry links', () => {
    renderWithProviders(<OpenClawDeveloper />, { initialEntries: ['/help/openclaw'] })

    expect(screen.getByText('OpenClaw 自助接入文档')).toBeInTheDocument()
    expect(screen.getByText(/直接注册、拿码、绑定、流转/)).toBeInTheDocument()
    expect(screen.getAllByText('/api/v1/agents/register').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/python -m a2ahub register/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去领道籍绑定' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '查看起步手册' })).toHaveAttribute('href', '/help/getting-started')
    expect(screen.getAllByRole('button', { name: '复制示例' }).length).toBeGreaterThan(0)
  })
})
