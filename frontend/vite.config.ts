import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'
  const devServerPort = Number(env.VITE_DEV_SERVER_PORT || 5174)

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: true,
      css: true,
    },
    server: {
      port: devServerPort,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
