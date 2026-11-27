'use client'

/**
 * QR Pix da venda, com confirmação automática.
 *
 * Hoje "PIX" é só um rótulo: o caixa marca a forma e confere no celular se
 * o dinheiro caiu. Em hora de movimento, a conferência some — e é assim que
 * uma venda é dada como paga sem ter sido.
 *
 * UMA ESCOLHA DELIBERADA: a confirmação NÃO bloqueia a venda.
 *
 * Se o webhook falhar, se a internet oscilar, se o provedor ficar fora do
 * ar — travar o botão deixaria a loja sem vender, com fila no balcão. O
 * painel confirma quando consegue e avisa quando não consegue; finalizar
 * sem confirmação continua possível, exatamente como é hoje. Automação que
 * pode impedir a loja de vender é pior que a ausência dela.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { QrCode, Copy, Check, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'

export type PixState = 'idle' | 'creating' | 'pending' | 'paid' | 'error'

interface Props {
  amount: number
  /** Chave de idempotência da venda — a mesma que a venda vai usar. */
  clientUuid: string
  onStateChange: (state: PixState) => void
  /** Chamado uma única vez, quando o pagamento é confirmado. */
  onConfirmed: () => void
}

const POLL_MS = 3000

export function PixChargePanel({ amount, clientUuid, onStateChange, onConfirmed }: Props) {
  const [state, setState] = useState<PixState>('idle')
  const [qrCode, setQrCode] = useState('')
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [chargeId, setChargeId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const confirmedRef = useRef(false)

  const update = useCallback(
    (next: PixState) => {
      setState(next)
      onStateChange(next)
    },
    [onStateChange],
  )

  async function createCharge() {
    update('creating')
    try {
      const response = await fetch('/api/pix/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, client_uuid: clientUuid }),
      })

      if (!response.ok) throw new Error(String(response.status))

      const { charge } = await response.json()
      setChargeId(charge.id)
      setQrCode(charge.qr_code ?? '')
      setQrImage(charge.qr_code_base64 ?? null)
      update(charge.status === 'paid' ? 'paid' : 'pending')
    } catch {
      update('error')
      toast.error('Não foi possível gerar o QR. Você ainda pode finalizar a venda normalmente.')
    }
  }

  // Consulta de reserva: o webhook é o caminho rápido, mas ele falha com
  // mais frequência do que se imagina. Sem isto, um pagamento que o
  // provedor não conseguiu avisar nunca apareceria na tela.
  useEffect(() => {
    if (state !== 'pending' || !chargeId) return

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/pix/charges/${chargeId}`)
        if (!response.ok) return

        const { status } = await response.json()
        if (status === 'paid' && !confirmedRef.current) {
          confirmedRef.current = true
          update('paid')
          onConfirmed()
        } else if (status === 'expired' || status === 'cancelled') {
          update('error')
        }
      } catch {
        // Rede instável não é "não pago". Tenta de novo no próximo ciclo.
      }
    }, POLL_MS)

    return () => clearInterval(timer)
  }, [state, chargeId, update, onConfirmed])

  async function copy() {
    try {
      await navigator.clipboard.writeText(qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  if (state === 'idle' || state === 'error') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={createCharge}
          disabled={amount <= 0}
          className="w-full h-9 text-xs"
        >
          <QrCode className="h-3.5 w-3.5 mr-1.5" />
          Gerar QR Pix de {formatCurrency(amount)}
        </Button>
        {state === 'error' && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            Confirme o pagamento no seu aplicativo do banco antes de finalizar.
          </p>
        )}
      </div>
    )
  }

  if (state === 'creating') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-white/10 p-4 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Gerando QR...
      </div>
    )
  }

  if (state === 'paid') {
    return (
      <div
        role="status"
        className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/8 p-3 flex items-center gap-2"
      >
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Pagamento confirmado pelo banco
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2.5">
      {qrImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${qrImage}`}
          alt="QR Code para pagamento via Pix"
          className="mx-auto h-40 w-40 rounded bg-white p-1"
        />
      )}

      <Button type="button" variant="outline" onClick={copy} className="w-full h-8 text-xs">
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copiar código Pix
          </>
        )}
      </Button>

      <p
        role="status"
        className="text-[11px] text-center text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Aguardando o pagamento cair...
      </p>
    </div>
  )
}
