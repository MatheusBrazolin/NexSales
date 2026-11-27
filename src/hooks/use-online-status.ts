'use client'

import { useSyncExternalStore } from 'react'

/**
 * Estado da conexão, numa fonte só.
 *
 * Quatro componentes escutavam `online`/`offline` por conta própria, cada
 * um com o seu `useState` + `useEffect`. Além da duplicação, o padrão
 * antigo (`setState` dentro do efeito para corrigir o valor depois da
 * hidratação) provoca uma renderização em cascata a cada montagem — é o
 * que o lint vinha apontando.
 *
 * `useSyncExternalStore` existe exatamente para isto: ler um estado que
 * vive fora do React. O React chama `getServerSnapshot` durante a
 * hidratação e `getSnapshot` depois, sem renderização extra e sem risco
 * de divergência entre servidor e cliente.
 *
 * `navigator.onLine` continua sendo um sinal grosseiro: ele diz que a
 * máquina tem rede, não que a internet funciona. Quem precisa de certeza
 * tenta a requisição e trata a falha — é o que `tryQuery` faz.
 */

function subscribe(aoMudar: () => void) {
  window.addEventListener('online', aoMudar)
  window.addEventListener('offline', aoMudar)
  return () => {
    window.removeEventListener('online', aoMudar)
    window.removeEventListener('offline', aoMudar)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

// Referências estáveis: o React compara a função entre renderizações.
const assumeOnline = () => true
const assumeOffline = () => false

export interface OnlineStatusOptions {
  /**
   * O que assumir enquanto o servidor renderiza, antes de haver navegador.
   *
   * Não é detalhe: o indicador de offline assume ONLINE para ficar
   * escondido, e a tarja de aviso assume OFFLINE para já aparecer. Trocar
   * isso mudaria o que o operador vê no primeiro instante da tela.
   */
  noServidor?: boolean
}

export function useOnlineStatus({ noServidor = true }: OnlineStatusOptions = {}): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    noServidor ? assumeOnline : assumeOffline,
  )
}
