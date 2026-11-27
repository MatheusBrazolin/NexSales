'use client'

import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { fadeUp, useMotionVariants } from '@/lib/motion'

/**
 * Fades each route into place.
 *
 * Next.js already streams pages in, but without a transition the swap is
 * abrupt enough that it reads as a flash rather than as navigation — most
 * noticeably in the Electron build, where there is no browser chrome to
 * signal that anything moved.
 *
 * Keyed on the pathname so every navigation replays the entrance, and kept
 * deliberately short: this sits between the operator and their next action.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const variants = useMotionVariants(fadeUp)

  return (
    <motion.div key={pathname} variants={variants} initial="hidden" animate="visible">
      {children}
    </motion.div>
  )
}
