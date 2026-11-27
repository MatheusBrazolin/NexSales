import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLightPrint } from './use-light-print'

/** jsdom has no matchMedia; stub one that records its listeners. */
function stubMatchMedia() {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.add(cb),
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.delete(cb),
    }),
  )
  return listeners
}

describe('useLightPrint', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.classList.remove('dark')
  })

  it('drops the dark class while the print dialog is open', () => {
    stubMatchMedia()
    document.documentElement.classList.add('dark')
    renderHook(() => useLightPrint())

    window.dispatchEvent(new Event('beforeprint'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('puts it back afterwards', () => {
    stubMatchMedia()
    document.documentElement.classList.add('dark')
    renderHook(() => useLightPrint())

    window.dispatchEvent(new Event('beforeprint'))
    window.dispatchEvent(new Event('afterprint'))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('leaves a light page alone', () => {
    stubMatchMedia()
    renderHook(() => useLightPrint())

    window.dispatchEvent(new Event('beforeprint'))
    window.dispatchEvent(new Event('afterprint'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('also reacts to the print media query, for browsers that skip the events', () => {
    const listeners = stubMatchMedia()
    document.documentElement.classList.add('dark')
    renderHook(() => useLightPrint())

    for (const cb of listeners) cb({ matches: true } as MediaQueryListEvent)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    for (const cb of listeners) cb({ matches: false } as MediaQueryListEvent)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('restores the theme on unmount, so navigating mid-print is not fatal', () => {
    stubMatchMedia()
    document.documentElement.classList.add('dark')
    const { unmount } = renderHook(() => useLightPrint())

    window.dispatchEvent(new Event('beforeprint'))
    unmount()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
