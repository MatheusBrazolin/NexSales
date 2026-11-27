import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePdvShortcuts, FOCUS_SEARCH_EVENT } from './use-pdv-shortcuts'

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
  document.dispatchEvent(event)
  return event
}

describe('usePdvShortcuts', () => {
  let handlers: {
    onFocusSearch: ReturnType<typeof vi.fn>
    onSubmit: ReturnType<typeof vi.fn>
    onClearCart: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    handlers = {
      onFocusSearch: vi.fn(),
      onSubmit: vi.fn(),
      onClearCart: vi.fn(),
    }
  })

  it('maps F2, F4 and F8 to their handlers', () => {
    renderHook(() => usePdvShortcuts(handlers))

    press('F2')
    press('F4')
    press('F8')

    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1)
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1)
    expect(handlers.onClearCart).toHaveBeenCalledTimes(1)
  })

  it('suppresses the browser default for the keys it owns', () => {
    renderHook(() => usePdvShortcuts(handlers))
    expect(press('F4').defaultPrevented).toBe(true)
  })

  it('ignores keys it does not own', () => {
    renderHook(() => usePdvShortcuts(handlers))

    press('F5')
    press('Enter')

    expect(handlers.onFocusSearch).not.toHaveBeenCalled()
    expect(handlers.onSubmit).not.toHaveBeenCalled()
    expect(handlers.onClearCart).not.toHaveBeenCalled()
  })

  it('leaves modifier combinations alone, so Alt+F4 still closes the window', () => {
    renderHook(() => usePdvShortcuts(handlers))

    const event = press('F4', { altKey: true })

    expect(handlers.onSubmit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does nothing while disabled', () => {
    renderHook(() => usePdvShortcuts(handlers, false))

    press('F4')

    expect(handlers.onSubmit).not.toHaveBeenCalled()
  })

  it('always calls the latest handlers, not the ones from the first render', () => {
    const { rerender } = renderHook(
      ({ h }) => usePdvShortcuts(h),
      { initialProps: { h: handlers } },
    )

    const replacement = {
      onFocusSearch: vi.fn(),
      onSubmit: vi.fn(),
      onClearCart: vi.fn(),
    }
    rerender({ h: replacement })

    press('F4')

    expect(handlers.onSubmit).not.toHaveBeenCalled()
    expect(replacement.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => usePdvShortcuts(handlers))
    unmount()

    press('F4')

    expect(handlers.onSubmit).not.toHaveBeenCalled()
  })

  it('exposes the focus-search event name used by the search field', () => {
    expect(FOCUS_SEARCH_EVENT).toBe('pdv:focus-search')
  })
})
