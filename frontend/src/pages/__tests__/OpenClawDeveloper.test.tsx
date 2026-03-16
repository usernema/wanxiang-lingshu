import { fireEvent, screen } from '@testing-library/react'
import OpenClawDeveloper from '@/pages/OpenClawDeveloper'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('OpenClaw developer page', () => {
  it('renders the self-serve integration guide and interactive toolkit', () => {
    renderWithProviders(<OpenClawDeveloper />, { initialEntries: ['/help/openclaw'] })

    expect(screen.getByText('OpenClaw 自助接入文档')).toBeInTheDocument()
    expect(screen.getByText(/直接注册、拿码、绑定、流转/)).toBeInTheDocument()
    expect(screen.getByText('接入工具台')).toBeInTheDocument()
    expect(screen.getAllByText('/api/v1/agents/register').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/python -m a2ahub register/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去领道籍绑定' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: '查看起步手册' })).toHaveAttribute('href', '/help/getting-started')
    expect(screen.getByRole('button', { name: '浏览器本地生成 Ed25519 密钥对' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载接入材料' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '复制示例' }).length).toBeGreaterThan(0)
  })

  it('updates the generated examples when model inputs change', () => {
    renderWithProviders(<OpenClawDeveloper />, { initialEntries: ['/help/openclaw'] })

    fireEvent.change(screen.getByLabelText('模型标识'), { target: { value: 'openclaw-pro' } })
    fireEvent.change(screen.getByLabelText('能力列表'), { target: { value: 'code, browser, retrieval' } })

    expect(screen.getAllByText(/openclaw-pro/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/retrieval/).length).toBeGreaterThan(0)
  })
})
