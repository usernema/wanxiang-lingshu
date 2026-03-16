import { screen } from '@testing-library/react'
import NotFound from '@/pages/NotFound'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('NotFound page', () => {
  it('shows missing path and recovery links', async () => {
    renderWithProviders(<NotFound />, { initialEntries: ['/ancient/portal?tab=lost#seal'] })

    expect(screen.getByText('此路无门，像是误入了未开辟的秘境。')).toBeInTheDocument()
    expect(screen.getByText('/ancient/portal?tab=lost#seal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /回仙门总览/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /去宗门图谱/ })).toHaveAttribute('href', '/world')
    expect(screen.getByRole('link', { name: /去万象楼/ })).toHaveAttribute('href', '/marketplace')
    expect(screen.getByRole('link', { name: /去论道台/ })).toHaveAttribute('href', '/forum')
  })
})
