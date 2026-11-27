/**
 * Aritmética do pagamento dividido.
 *
 * Fora do componente do PDV pelo mesmo motivo de sale-totals.ts: é aqui que
 * o cliente e o servidor precisam concordar. `create_sale_with_items`
 * RECUSA a venda quando a soma dos pagamentos não bate com o total, então
 * se a tela deixasse finalizar uma divisão que não fecha, o caixa veria um
 * erro cru do banco no meio do atendimento.
 *
 * A regra aqui é só para avisar antes. Quem decide continua sendo o
 * servidor — se os dois discordarem por arredondamento, a venda é
 * recusada, e isso é melhor do que gravar uma venda que não fecha.
 */

import type { PaymentMethod } from '@/types/database'

export interface PaymentLine {
  method: PaymentMethod
  /** Em reais. */
  amount: number
}

/**
 * Dinheiro em centavos, como inteiro.
 *
 * Comparar reais em ponto flutuante não funciona: 50,10 + 20,20 não dá
 * exatamente 70,30 em binário, e a venda seria recusada por uma diferença
 * que não existe na gaveta.
 */
export function toCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export interface SplitSummary {
  /** Soma do que já foi distribuído. */
  paid: number
  /** Quanto ainda falta distribuir. Negativo quando passou do total. */
  remaining: number
  /** A soma bate com o total — só aqui a venda pode ser finalizada. */
  balanced: boolean
  /** Distribuiu mais do que o total. */
  overpaid: boolean
  /** Alguma parcela é fiada, então a venda exige cliente. */
  requiresCustomer: boolean
  /** Forma de maior valor — a etiqueta que a venda vai receber. */
  predominant: PaymentMethod | null
}

export function summarizeSplit(lines: PaymentLine[], total: number): SplitSummary {
  const totalCents = toCents(total)

  let paidCents = 0
  let bestCents = -1
  let predominant: PaymentMethod | null = null
  let requiresCustomer = false

  for (const line of lines) {
    const cents = toCents(line.amount)
    if (cents <= 0) continue

    paidCents += cents
    if (line.method === 'fiado') requiresCustomer = true

    // Empate fica com a primeira — mesma regra do servidor, que só troca
    // a predominante quando o valor é estritamente maior.
    if (cents > bestCents) {
      bestCents = cents
      predominant = line.method
    }
  }

  return {
    paid: paidCents / 100,
    remaining: (totalCents - paidCents) / 100,
    balanced: paidCents === totalCents && totalCents > 0,
    overpaid: paidCents > totalCents,
    requiresCustomer,
    predominant,
  }
}

/**
 * Remove as parcelas zeradas e arredonda para centavos.
 *
 * O servidor recusa parcela <= 0, e uma linha vazia na tela é só uma linha
 * que o operador ainda não preencheu — não é um erro para mostrar na cara
 * dele.
 */
export function cleanPaymentLines(lines: PaymentLine[]): PaymentLine[] {
  return lines
    .filter((line) => toCents(line.amount) > 0)
    .map((line) => ({ method: line.method, amount: toCents(line.amount) / 100 }))
}

/**
 * O troco sai só da parte em dinheiro.
 *
 * Quem paga R$ 50 no cartão e entrega R$ 20 em espécie para uma parcela de
 * R$ 15 recebe R$ 5 de volta — não R$ 55. Calcular troco sobre o total da
 * venda devolveria dinheiro que o cliente nunca entregou.
 */
export function cashChange(lines: PaymentLine[], cashReceived: number): number {
  const cashDue = lines
    .filter((line) => line.method === 'cash')
    .reduce((sum, line) => sum + toCents(line.amount), 0)

  // Sem parcela em dinheiro não há troco, por maior que seja o valor
  // digitado. Sem esta guarda a conta devolvia o recebido inteiro, e a
  // tela diria "troco R$ 100,00" numa venda paga só no PIX.
  if (cashDue <= 0) return 0

  const change = toCents(cashReceived) - cashDue
  return change > 0 ? change / 100 : 0
}
