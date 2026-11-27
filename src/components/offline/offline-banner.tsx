'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/use-online-status'

interface OfflineBannerProps {
  message?: string
}

export function OfflineBanner({
  message = 'Você está offline. Dados podem estar desatualizados.',
}: OfflineBannerProps) {
  const router = useRouter()
  // `noServidor: false` mantém o comportamento de antes: o servidor não
  // consegue ler navigator.onLine, e esta tarja só é renderizada quando a
  // consulta do servidor JÁ falhou — então assumir offline no primeiro
  // instante é o palpite certo. Corrige para azul em milissegundos se o
  // navegador estiver online.
  const isOnline = useOnlineStatus({ noServidor: false })

  if (isOnline) {
    return (
      <div className="nx-enter-fade-up flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <span>Conexão disponível — dados exibidos podem estar desatualizados.</span>
        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-1.5 font-medium whitespace-nowrap hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>
    )
  }

  return (
    <div className="nx-enter-fade-up flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
