/**
 * Shared motion language.
 *
 * Why this file exists: before it, every animated component invented its own
 * durations and easing curves, so the sidebar, the KPI cards and the rest of
 * the app moved in three different ways. Movement is part of the interface —
 * it should be as consistent as the colour tokens in globals.css.
 *
 * Two rules the app follows:
 *
 * 1. Nothing animates for longer than ~300ms. This is a point-of-sale system;
 *    the operator sees the same screen hundreds of times a day. Animation
 *    exists to explain what changed, never to be admired.
 *
 * 2. Everything here degrades to "no movement" under prefers-reduced-motion,
 *    via `useMotionVariants()` below. Reduced motion is not an absence of
 *    feedback — the element still appears and disappears, it just does not
 *    travel.
 */
import { useEffect, useState } from 'react'
import type { Transition, Variants } from 'framer-motion'

/** Durations, in seconds. */
export const duration = {
  /** Hover states, colour shifts, pressed states. */
  instant: 0.12,
  /** The default: items entering or leaving a list, panels opening. */
  base: 0.22,
  /** Larger surfaces — page transitions, full-screen confirmations. */
  slow: 0.3,
} as const

/** Easing curves. `out` is the default: fast start, soft landing. */
export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

/** Springs, for anything that should feel physical rather than timed. */
export const spring = {
  /** Panels and banners sliding in. */
  soft: { type: 'spring', stiffness: 260, damping: 26 } as Transition,
  /** Active-item indicators that must snap into place. */
  snappy: { type: 'spring', stiffness: 450, damping: 32 } as Transition,
} as const

export const transition = {
  base: { duration: duration.base, ease: ease.out } as Transition,
  instant: { duration: duration.instant, ease: ease.out } as Transition,
  slow: { duration: duration.slow, ease: ease.out } as Transition,
} as const

/* ── Variants ─────────────────────────────────────────────────────────── */

/** Fade up into place. The default entrance for cards and panels. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: -4, transition: transition.instant },
}

/** Plain fade, for things that should not travel (overlays, backdrops). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.instant },
}

/** Slide in from the left. Used by list rows and nav items. */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: transition.base },
  exit: { opacity: 0, x: -10, transition: transition.instant },
}

/**
 * A row joining or leaving a list — the cart, mainly. Collapsing the height
 * on exit is what makes a removed item feel removed instead of blinked away.
 */
export const listRow: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    transition: { duration: duration.instant, ease: ease.inOut },
  },
}

/** Parent of a staggered group. Pair with any child variant above. */
export function staggerContainer(stagger = 0.045, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  }
}

/* ── Reduced motion ───────────────────────────────────────────────────── */

/**
 * Tracks the user's prefers-reduced-motion setting, and keeps tracking it:
 * the OS toggle can flip while the app is open.
 *
 * Returns false during the server render and the first client paint, which is
 * the safe default — the alternative would be a hydration mismatch.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(query.matches)

    const onChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return prefersReduced
}

/**
 * Strips the movement out of a variant set when the user asked for reduced
 * motion, keeping only opacity. Components use the returned variants exactly
 * as they would use the originals — no branching at the call site.
 */
export function useMotionVariants(variants: Variants): Variants {
  const prefersReduced = usePrefersReducedMotion()
  if (!prefersReduced) return variants

  const stripped: Variants = {}
  for (const [state, value] of Object.entries(variants)) {
    if (typeof value !== 'object' || value === null) {
      stripped[state] = value
      continue
    }
    const source = value as Record<string, unknown>
    const next: Record<string, unknown> = { transition: { duration: 0 } }
    if (typeof source.opacity === 'number') next.opacity = source.opacity
    stripped[state] = next as Variants[string]
  }
  return stripped
}
