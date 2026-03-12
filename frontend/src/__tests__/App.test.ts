import { describe, expect, it } from 'vitest'
import { isDedicatedAdminHostName } from '@/App'

describe('isDedicatedAdminHostName', () => {
  it('matches the configured admin hostname exactly', () => {
    expect(isDedicatedAdminHostName('admin.kelibing.shop', 'admin.kelibing.shop')).toBe(true)
    expect(isDedicatedAdminHostName('kelibing.shop', 'admin.kelibing.shop')).toBe(false)
  })

  it('falls back to admin subdomains when no explicit hostname is configured', () => {
    expect(isDedicatedAdminHostName('admin.kelibing.shop', '')).toBe(true)
    expect(isDedicatedAdminHostName('ops.kelibing.shop', '')).toBe(false)
  })
})
