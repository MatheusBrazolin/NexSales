'use client'

import { useEffect } from 'react'

/**
 * Prints in the light theme, whatever theme is on screen.
 *
 * Dark mode is a `dark` class on <html>, and Tailwind compiles `dark:` into
 * literal colours — not into the CSS variables the print stylesheet
 * overrides. So a page printed from dark mode keeps `dark:text-slate-100`
 * and comes out of the printer as white text on white paper.
 *
 * Dropping the class for the duration of the print dialog is the precise fix:
 * every colour resolves to its light value, including the accent colours that
 * carry meaning (payment badges, profit in green, loss in red), which a
 * blanket `color: black !important` in the print stylesheet would flatten.
 */
export function useLightPrint(): void {
  useEffect(() => {
    const root = document.documentElement
    let wasDark = false

    function beforePrint() {
      wasDark = root.classList.contains('dark')
      if (wasDark) root.classList.remove('dark')
    }

    function afterPrint() {
      if (wasDark) root.classList.add('dark')
    }

    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)

    // Safari and some Chromium builds fire only the media query, not the
    // events, when printing is triggered from the keyboard.
    const media = window.matchMedia('print')
    const onMediaChange = (e: MediaQueryListEvent) =>
      e.matches ? beforePrint() : afterPrint()
    media.addEventListener('change', onMediaChange)

    return () => {
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
      media.removeEventListener('change', onMediaChange)
      afterPrint()
    }
  }, [])
}
