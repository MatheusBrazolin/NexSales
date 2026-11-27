import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './use-online-status'

function definirOnline(valor: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => valor,
  })
}

afterEach(() => {
  definirOnline(true)
  vi.restoreAllMocks()
})

describe('useOnlineStatus', () => {
  it('reflete o estado atual do navegador', () => {
    definirOnline(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('reage ao evento de queda da conexão', () => {
    definirOnline(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      definirOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('reage à volta da conexão', () => {
    definirOnline(false)
    const { result } = renderHook(() => useOnlineStatus())

    act(() => {
      definirOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })

  it('remove os ouvintes ao desmontar — senão cada tela deixaria um para trás', () => {
    const remover = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()

    const eventos = remover.mock.calls.map((c) => c[0])
    expect(eventos).toContain('online')
    expect(eventos).toContain('offline')
  })
})
