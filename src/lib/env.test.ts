import { describe, it, expect } from 'vitest'
import {
  parseRequiredEnv,
  parseOptionalEnv,
  hasSmtpConfig,
  requireOfflineSecret,
} from './env'

const validRequired = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

describe('parseRequiredEnv', () => {
  it('accepts a complete configuration', () => {
    expect(parseRequiredEnv(validRequired).NEXT_PUBLIC_SUPABASE_URL)
      .toBe('https://abc.supabase.co')
  })

  it('names the missing variable in the error', () => {
    expect(() => parseRequiredEnv({}))
      .toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('rejects a URL that is not a URL', () => {
    expect(() =>
      parseRequiredEnv({ ...validRequired, NEXT_PUBLIC_SUPABASE_URL: 'abc.supabase.co' }),
    ).toThrow(/URL completa/)
  })

  it('rejects an empty anon key rather than failing later at request time', () => {
    expect(() =>
      parseRequiredEnv({ ...validRequired, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
})

describe('parseOptionalEnv', () => {
  it('accepts an environment with none of them set', () => {
    expect(parseOptionalEnv({})).toEqual({})
  })

  it('coerces SMTP_PORT to a number', () => {
    expect(parseOptionalEnv({ SMTP_PORT: '465' }).SMTP_PORT).toBe(465)
  })

  it('rejects a nonsensical SMTP_PORT', () => {
    expect(() => parseOptionalEnv({ SMTP_PORT: 'abc' })).toThrow()
  })

  it('rejects an offline secret too short to be worth signing with', () => {
    expect(() =>
      parseOptionalEnv({ OFFLINE_SESSION_SECRET: 'curta' }),
    ).toThrow()
  })
})

describe('hasSmtpConfig', () => {
  it('is false when nothing is configured', () => {
    expect(hasSmtpConfig({})).toBe(false)
  })

  it('is false with a host but no credentials', () => {
    expect(hasSmtpConfig({ SMTP_HOST: 'smtp.gmail.com' })).toBe(false)
  })

  it('is true once host, user and password are present', () => {
    expect(
      hasSmtpConfig({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'a@b.com',
        SMTP_PASS: 'x',
      }),
    ).toBe(true)
  })
})

describe('requireOfflineSecret', () => {
  const longSecret = 'a'.repeat(64)

  it('returns the configured secret', () => {
    expect(requireOfflineSecret({ OFFLINE_SESSION_SECRET: longSecret }))
      .toBe(longSecret)
  })

  it('throws in production when it is missing', () => {
    expect(() => requireOfflineSecret({ NODE_ENV: 'production' }))
      .toThrow(/OFFLINE_SESSION_SECRET/)
  })

  it('throws in production when it is too short to be meaningful', () => {
    expect(() =>
      requireOfflineSecret({
        NODE_ENV: 'production',
        OFFLINE_SESSION_SECRET: 'curta',
      }),
    ).toThrow(/32 caracteres/)
  })

  it('falls back to a clearly-labelled dev value outside production', () => {
    const secret = requireOfflineSecret({ NODE_ENV: 'development' })
    expect(secret).toContain('do-not-use-in-production')
  })
})
