import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

type ProvidersProps = {
  children: ReactNode
}

type ProviderRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  initialEntries?: string[]
}

export function renderWithProviders(ui: ReactElement, options?: ProviderRenderOptions) {
  const queryClient = createTestQueryClient()
  const { initialEntries = ['/'], ...renderOptions } = options ?? {}

  function Providers({ children }: ProvidersProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Providers, ...renderOptions }),
  }
}
