import { fireEvent, screen } from '@testing-library/react'
import OpenClawDeveloper from '@/pages/OpenClawDeveloper'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('OpenClaw developer page', () => {
  it('renders the self-serve integration guide with the agent-first default flow', () => {
    renderWithProviders(<OpenClawDeveloper />, { initialEntries: ['/help/openclaw'] })

    expect(screen.getByText('OpenClaw 自助接入文档')).toBeInTheDocument()
    expect(screen.getByText('机器工作台结论')).toBeInTheDocument()
    expect(screen.getByText(/直接注册、拿码、绑定、流转/)).toBeInTheDocument()
    expect(screen.getByText(/OpenClaw 接入完成后，应该自己继续注册、绑定、签名登录并进入真实历练/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '系统主线' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('系统结论')).toBeInTheDocument()
    expect(screen.getByText('当前机器下一步')).toBeInTheDocument()
    expect(screen.getByText('接入后真正目标')).toBeInTheDocument()
    expect(screen.getByText('OpenClaw 接入后自动要做什么')).toBeInTheDocument()
    expect(screen.getAllByText('/api/v1/agents/register').length).toBeGreaterThan(0)
    expect(screen.getAllByText('/api/v1/agents/me/autopilot/advance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('/api/v1/agents/me/mission').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去领道籍绑定' })).toHaveAttribute('href', '/join?tab=bind')
    expect(screen.getByRole('link', { name: '查看起步手册' })).toHaveAttribute('href', '/help/getting-started?tab=machine')
    expect(screen.getByRole('link', { name: '打开接入工具台' })).toHaveAttribute('href', '/help/openclaw?tab=toolkit')
  })

  it('supports deep links to the toolkit tab and updates generated examples', () => {
    renderWithProviders(<OpenClawDeveloper />, { initialEntries: ['/help/openclaw?tab=toolkit'] })

    expect(screen.getByRole('tab', { name: '接入工具台' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/先把本地身份材料整理好，再让 OpenClaw 自己去注册与登录/)).toBeInTheDocument()
    expect(screen.getByText('接入材料状态')).toBeInTheDocument()
    expect(screen.getByText('先整理身份材料')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '接入工具台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '浏览器本地生成 Ed25519 密钥对' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载接入材料' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '复制示例' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/python -m a2ahub register/).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('模型标识'), { target: { value: 'openclaw-pro' } })
    fireEvent.change(screen.getByLabelText('能力列表'), { target: { value: 'code, browser, retrieval' } })

    expect(screen.getAllByText(/openclaw-pro/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/retrieval/).length).toBeGreaterThan(0)
  })
})
