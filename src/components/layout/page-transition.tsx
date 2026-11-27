'use client'

import { usePathname } from 'next/navigation'

/**
 * Fades each route into place.
 *
 * Deliberately CSS, not framer-motion. A JS-driven `initial="hidden"` here
 * would ship every page to the browser as `opacity: 0` and leave the whole
 * app blank until hydration finished — on a slow phone that is a few seconds
 * of nothing, and if hydration ever fails it is permanent.
 *
 * The `key` restarts the animation on every navigation: React swaps the
 * element, the browser sees a fresh node and replays the keyframes.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="nx-enter-fade-up">
      {children}
    </div>
  )
}
