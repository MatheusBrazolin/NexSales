'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { spring, useMotionVariants } from '@/lib/motion'
import { useOnlineStatus } from '@/hooks/use-online-status'

/**
 * Small floating chip that appears in the bottom-right corner whenever the
 * browser reports `navigator.onLine === false`. Hidden entirely when online
 * so it doesn't take up space in the happy path.
 *
 * `navigator.onLine` is a coarse signal — it flips when the OS loses its
 * network interface, but a misconfigured DNS or a captive portal can still
 * say "online" while requests fail. Good enough for a heads-up indicator
 * though, and far cheaper than a periodic health ping.
 */
export function OfflineIndicator() {
  // Assume online no servidor para a etiqueta não piscar na hidratação.
  const online = useOnlineStatus()
  const chipVariants = useMotionVariants({
    hidden: { opacity: 0, y: 16, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
    exit: { opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.12 } },
  })

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          aria-live="polite"
          variants={chipVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-red-600 text-white px-3 py-1.5 text-xs font-semibold shadow-lg shadow-red-900/30 ring-1 ring-red-700/40"
        >
          {/* Pontinho pulsando reforça o "alarme" de conexão caída. */}
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-200" />
          </span>
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          <span>Sem internet — usando dados em cache.</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
