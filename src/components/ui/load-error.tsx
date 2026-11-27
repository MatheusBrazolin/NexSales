import { AlertTriangle } from 'lucide-react'

interface LoadErrorProps {
  /** What failed to load, in the shopkeeper's words: "os usuários". */
  what: string
  /** The underlying error, logged for whoever has to debug it. */
  error?: unknown
}

/**
 * The banner a screen shows when its data did not load.
 *
 * Two screens used to render `{error.message}` straight into the page, so a
 * shop owner would read "Erro ao carregar usuários: TypeError: fetch failed"
 * or "AbortError: This operation was aborted". Those sentences tell the
 * person nothing they can act on, and they make a working app look broken in
 * a way that is somehow worse than the failure itself.
 *
 * The technical detail is not thrown away — it goes to the console, where
 * whoever is debugging will look for it.
 */
export function LoadError({ what, error }: LoadErrorProps) {
  if (error !== undefined && typeof console !== 'undefined') {
    console.error(`[NexSales] Falha ao carregar ${what}:`, error)
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-4 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Não foi possível carregar {what} agora.</p>
        <p className="mt-0.5 text-amber-700 dark:text-amber-400/90">
          Verifique a conexão e atualize a página. Suas vendas continuam sendo
          registradas normalmente.
        </p>
      </div>
    </div>
  )
}
