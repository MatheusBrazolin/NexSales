'use client'

import { useEffect, useRef } from 'react'

/** Custom event the PDV fires to ask the search field for focus. */
export const FOCUS_SEARCH_EVENT = 'pdv:focus-search'

export interface PdvShortcutHandlers {
  /** F2 — back to the barcode/name field. */
  onFocusSearch: () => void
  /** F4 — confirm the sale. */
  onSubmit: () => void
  /** F8 — empty the cart. */
  onClearCart: () => void
}

/**
 * Function-key shortcuts for the point of sale.
 *
 * A cashier works with one hand on the scanner and the other on the keyboard;
 * reaching for the mouse to press "Confirmar venda" costs real seconds on
 * every single sale. F2/F4/F8 is the convention Brazilian PDV software has
 * used for decades, so it is what an operator coming from another system
 * will already try.
 *
 * Handled on `keydown` at the document level, and deliberately NOT suppressed
 * while an input has focus — the whole point is to escape the field you are
 * typing in. The browser defaults for these keys are preventDefault'd, which
 * matters most in the Electron build where F4 variants reach the window.
 */
export function usePdvShortcuts(handlers: PdvShortcutHandlers, enabled = true) {
  // Callers build this object inline on every render; keeping it in a ref
  // means the listener is attached once instead of on each keystroke in the
  // cart, which is exactly when it must not be churning.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      // Never swallow the user's own modifier combinations (Alt+F4, etc.).
      if (event.altKey || event.ctrlKey || event.metaKey) return

      switch (event.key) {
        case 'F2':
          event.preventDefault()
          handlersRef.current.onFocusSearch()
          break
        case 'F4':
          event.preventDefault()
          handlersRef.current.onSubmit()
          break
        case 'F8':
          event.preventDefault()
          handlersRef.current.onClearCart()
          break
        default:
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
