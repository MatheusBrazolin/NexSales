'use client'

import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { usePrefersReducedMotion } from '@/lib/motion'

interface AnimatedNumberProps {
  /** Target value. The component animates from whatever it showed before. */
  value: number
  /** Turns the running number into the string on screen (currency, count…). */
  format: (value: number) => string
  className?: string
  /** Seconds. Defaults to a touch longer than a normal transition. */
  duration?: number
}

/**
 * A number that counts to its new value instead of jumping.
 *
 * Used on the PDV total and on the dashboard KPIs: when a figure changes
 * because of something the operator just did, watching it move is what ties
 * the action to the result. A figure that simply swaps can be missed.
 *
 * The animation is skipped entirely on the first render — arriving at a page
 * and watching every total count up from zero is noise, not feedback — and
 * under prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.4,
}: AnimatedNumberProps) {
  const prefersReduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)
  const isFirstRender = useRef(true)

  useEffect(() => {
    const from = previous.current
    previous.current = value

    if (isFirstRender.current) {
      isFirstRender.current = false
      setDisplay(value)
      return
    }

    if (prefersReduced || from === value) {
      setDisplay(value)
      return
    }

    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    })

    return () => controls.stop()
  }, [value, prefersReduced, duration])

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  )
}
