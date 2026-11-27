import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  fadeUp,
  listRow,
  staggerContainer,
  useMotionVariants,
  usePrefersReducedMotion,
} from './motion'

/** Installs a matchMedia stub that reports the given reduced-motion setting. */
function mockReducedMotion(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()

  const mql = {
    matches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb)
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb)
    },
  }

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    emit(next: boolean) {
      mql.matches = next
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

describe('usePrefersReducedMotion', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('reports the current setting', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it('stays false when the user has no preference', () => {
    mockReducedMotion(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it('unsubscribes on unmount', () => {
    const media = mockReducedMotion(false)
    const { unmount } = renderHook(() => usePrefersReducedMotion())
    expect(media.listenerCount()).toBe(1)
    unmount()
    expect(media.listenerCount()).toBe(0)
  })
})

describe('useMotionVariants', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('passes the variants through untouched when motion is allowed', () => {
    mockReducedMotion(false)
    const { result } = renderHook(() => useMotionVariants(fadeUp))
    expect(result.current).toBe(fadeUp)
  })

  it('strips translation and scale under reduced motion', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useMotionVariants(fadeUp))

    const visible = result.current.visible as Record<string, unknown>
    expect(visible).not.toHaveProperty('y')
    expect(visible).not.toHaveProperty('x')
    expect(visible).not.toHaveProperty('scale')
  })

  it('keeps opacity, so elements still appear and disappear', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useMotionVariants(fadeUp))

    expect((result.current.hidden as Record<string, unknown>).opacity).toBe(0)
    expect((result.current.visible as Record<string, unknown>).opacity).toBe(1)
  })

  it('zeroes every duration', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useMotionVariants(listRow))

    for (const state of Object.values(result.current)) {
      const transition = (state as unknown as { transition?: { duration?: number } }).transition
      expect(transition?.duration).toBe(0)
    }
  })

  it('drops the height collapse that makes a removed cart row animate out', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useMotionVariants(listRow))
    expect(result.current.exit as Record<string, unknown>).not.toHaveProperty('height')
  })
})

describe('staggerContainer', () => {
  it('builds a parent variant carrying the stagger', () => {
    const variants = staggerContainer(0.05, 0.1)
    const visible = variants.visible as { transition: Record<string, number> }

    expect(visible.transition.staggerChildren).toBe(0.05)
    expect(visible.transition.delayChildren).toBe(0.1)
  })

  it('defaults to no delay before the first child', () => {
    const visible = staggerContainer().visible as { transition: Record<string, number> }
    expect(visible.transition.delayChildren).toBe(0)
  })
})
