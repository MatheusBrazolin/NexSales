'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ChevronDown,
  Loader2,
  CheckCircle2,
  ShoppingCart,
  Search,
  Receipt,
  CreditCard,
  Banknote,
  CloudOff,
  Printer,
  X,
  UserRound,
  UserPlus,
  Phone,
  Tag,
  TicketPercent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ProductSearch } from '@/components/sales/product-search'
import { Cart } from '@/components/sales/cart'
import { createSale } from '../actions'
import { searchCustomers, createCustomer } from '../../clientes/actions'
import { searchCustomersOffline } from '@/lib/offline/customers-repo'
import { queueSale } from '@/lib/offline/sales-repo'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { formatCurrency } from '@/lib/utils/format'
import { cartSubtotal, parseDiscountInput, saleTotals } from '@/lib/utils/sale-totals'
import { PaymentSplit } from '@/components/sales/payment-split'
import { PixChargePanel, type PixState } from '@/components/sales/pix-charge-panel'
import {
  cleanPaymentLines,
  summarizeSplit,
  type PaymentLine,
} from '@/lib/utils/sale-payments'
import { printReceipt } from '@/lib/utils/print-receipt'
import { fadeUp, spring, useMotionVariants, usePrefersReducedMotion } from '@/lib/motion'
import { usePdvShortcuts, FOCUS_SEARCH_EVENT } from '@/hooks/use-pdv-shortcuts'
import type { CartItem, CustomerBalance, PaymentMethod, Product } from '@/types/database'

/** Snapshot of a sale saved offline, for the provisional confirmation banner. */
interface OfflineSaleConfirmation {
  items: { name: string; quantity: number; unit_price: number }[]
  total: number
  discount: number
  paymentLabel: string
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credit', label: 'Cartão de Crédito' },
  { value: 'debit', label: 'Cartão de Débito' },
  { value: 'fiado', label: 'Fiado' },
]

interface PDVProps {
  /** Há provedor Pix configurado no servidor. */
  pixEnabled?: boolean
  avulsoProduct?: Product | null
}

export function PDV({ avulsoProduct, pixEnabled = false }: PDVProps) {
  const router = useRouter()
  const panelVariants = useMotionVariants({
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  })
  const bannerVariants = useMotionVariants(fadeUp)
  const overlayVariants = useMotionVariants({
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.18 } },
    exit: { opacity: 0, transition: { duration: 0.18 } },
  })
  const prefersReduced = usePrefersReducedMotion()
  // The check draws itself; under reduced motion it is simply already drawn.
  const checkCircleVariants = {
    hidden: { pathLength: prefersReduced ? 1 : 0, opacity: prefersReduced ? 1 : 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: { duration: prefersReduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] as const },
    },
  }
  const checkPathVariants = {
    hidden: { pathLength: prefersReduced ? 1 : 0, opacity: prefersReduced ? 1 : 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        duration: prefersReduced ? 0 : 0.3,
        delay: prefersReduced ? 0 : 0.2,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  }
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [offlineSale, setOfflineSale] = useState<OfflineSaleConfirmation | null>(null)
  /** Total of the sale just confirmed, shown in the success overlay. */
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null)
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [cashReceivedRaw, setCashReceivedRaw] = useState('')
  // Divisão do pagamento. Fora do caminho comum de propósito: a imensa
  // maioria das vendas tem uma forma só, e quem abre o caixa de manhã não
  // deve ter que fechar um formulário a mais por isso.
  const [splitMode, setSplitMode] = useState(false)
  const [splitLines, setSplitLines] = useState<PaymentLine[]>([])
  const [splitRaw, setSplitRaw] = useState<string[]>([])
  // A chave de idempotência precisa existir ANTES de finalizar: a cobrança
  // Pix é criada para uma venda que ainda não existe, e as duas têm de
  // usar o mesmo identificador.
  const [clientUuid, setClientUuid] = useState(() => crypto.randomUUID())
  const [pixState, setPixState] = useState<PixState>('idle')
  const [discountRaw, setDiscountRaw] = useState('')

  // --- Fiado: seleção de cliente ---
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerBalance | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerBalance[]>([])
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clamped exactly the way create_sale_with_items clamps it, so the screen
  // can never promise a total the RPC will not honour.
  const { subtotal, discount, total, exceeded: discountExceeded } = saleTotals(
    cartSubtotal(
      cartItems.map((item) => ({
        quantity: item.quantity,
        customPrice: item.customPrice,
        unitPrice: item.product.sale_price,
      })),
    ),
    parseDiscountInput(discountRaw),
  )

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const split = summarizeSplit(splitLines, total)
  const needsCustomer = splitMode ? split.requiresCustomer : paymentMethod === 'fiado'
  const paymentMissing = splitMode ? !split.balanced : !paymentMethod
  const customerMissing = needsCustomer && !selectedCustomer

  const splitCashDue = splitLines
    .filter((line) => line.method === 'cash')
    .reduce((sum, line) => sum + line.amount, 0)

  // Sem divisão, a parte em dinheiro é a venda inteira — então o troco
  // continua sendo calculado exatamente como antes.
  const cashDue = splitMode ? splitCashDue : total
  const showCashBox = splitMode ? splitCashDue > 0 : paymentMethod === 'cash'

  const cashReceived = cashReceivedRaw.trim()
    ? parseFloat(cashReceivedRaw.replace(',', '.'))
    : NaN
  const hasCashEntered = !Number.isNaN(cashReceived)
  const change = hasCashEntered ? cashReceived - cashDue : 0
  const cashShort = hasCashEntered && cashReceived < cashDue

  function handleAddItem(item: CartItem) {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === item.product.id)
      if (existing) {
        if (existing.product.track_stock) {
          return prev.map((i) =>
            i.product.id === item.product.id
              ? { ...i, quantity: Math.min(i.quantity + 1, existing.product.stock_quantity) }
              : i
          )
        }
        return prev.map((i) =>
          i.product.id === item.product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, item]
    })
  }

  function handleUpdateDescription(productId: string, desc: string) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, itemDescription: desc } : item
      )
    )
  }

  function handleUpdateQty(productId: string, qty: number) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    )
  }

  function handleUpdatePrice(productId: string, price: number) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, customPrice: price } : item
      )
    )
  }

  function handleRemove(productId: string) {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId))
  }

  useEffect(() => {
    if (paymentMethod !== 'fiado') return
    if (!customerQuery.trim()) {
      setCustomerResults([])
      return
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      setIsSearchingCustomer(true)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const rows = await searchCustomersOffline(customerQuery)
        setCustomerResults(rows)
      } else {
        const result = await searchCustomers(customerQuery)
        setCustomerResults(result.customers ?? [])
      }
      setIsSearchingCustomer(false)
    }, 350)
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current)
    }
  }, [customerQuery, paymentMethod])

  function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return digits.length ? `(${digits}` : ''
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return
    setIsCreatingCustomer(true)
    const result = await createCustomer({ fullName: newCustomerName, phone: newCustomerPhone })
    setIsCreatingCustomer(false)
    if (result.error) {
      toast.error('Erro ao criar cliente: ' + result.error)
      return
    }
    if (result.customer) {
      setSelectedCustomer({
        ...result.customer,
        total_fiado: 0,
        total_paid: 0,
        current_debt: 0,
        last_payment_at: null,
        first_fiado_at: null,
      })
      setCustomerQuery('')
      setCustomerResults([])
      setShowNewCustomerForm(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      toast.success(`Cliente "${result.customer.full_name}" cadastrado!`)
    }
  }

  async function handleSubmit() {
    setTriedSubmit(true)

    if (cartItems.length === 0) {
      toast.error('Adicione pelo menos um produto')
      return
    }
    if (splitMode) {
      // O servidor recusa a venda cuja soma não bate. Avisar aqui evita o
      // erro cru do banco no meio do atendimento.
      if (!split.balanced) {
        toast.error(
          split.overpaid
            ? 'A soma dos pagamentos passou do total da venda'
            : 'A soma dos pagamentos não cobre o total da venda',
        )
        return
      }
    } else if (!paymentMethod) {
      toast.error('Selecione o método de pagamento')
      return
    }
    if (showCashBox && hasCashEntered && cashShort) {
      toast.error('Valor recebido é menor que a parte em dinheiro')
      return
    }
    if (needsCustomer && !selectedCustomer) {
      toast.error('Selecione um cliente para a venda fiada')
      return
    }

    const avulsoWithoutPrice = cartItems.some(
      (item) => !item.product.track_stock && !(item.customPrice && item.customPrice > 0)
    )
    if (avulsoWithoutPrice) {
      toast.error('Defina o valor dos itens avulsos antes de finalizar')
      return
    }

    setIsSubmitting(true)

    const rpcItems = cartItems.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      ...(item.customPrice !== undefined ? { unit_price: item.customPrice } : {}),
      ...(item.itemDescription ? { item_description: item.itemDescription } : {}),
    }))

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await saveOffline(clientUuid)
        return
      }

      try {
        const result = await createSale({
          // Na divisão, a etiqueta é a forma predominante — a mesma regra
          // que o servidor aplica, para a tela não prometer outra coisa.
          payment_method: (splitMode ? split.predominant : paymentMethod) as PaymentMethod,
          notes,
          items: rpcItems,
          client_uuid: clientUuid,
          customer_id: selectedCustomer?.id ?? null,
          discount,
          ...(splitMode ? { payments: cleanPaymentLines(splitLines) } : {}),
        })

        if (result.error) {
          toast.error(result.error)
          return
        }

        // Hold the success state on screen for a beat before navigating.
        // Confirming a sale is the most consequential action in the app and
        // it used to be acknowledged only by a toast that the redirect
        // immediately swept away.
        // Chave de idempotência queimada: ela identifica ESTA venda. Se a
        // tela não desmontasse por algum motivo, a próxima venda reusaria
        // a chave e o servidor devolveria a venda anterior — registrando
        // nada, em silêncio.
        setClientUuid(crypto.randomUUID())
        setPixState('idle')
        setConfirmedTotal(total)
        await new Promise((resolve) => setTimeout(resolve, 850))
        router.push(`/vendas/${result.saleId}`)
      } catch {
        await saveOffline(clientUuid)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function saveOffline(clientUuid: string) {
    const method = splitMode ? split.predominant : paymentMethod
    if (!method) return
    try {
      await queueSale({
        client_uuid: clientUuid,
        payment_method: method,
        notes,
        total,
        discount,
        customer_id: selectedCustomer?.id ?? null,
        ...(splitMode ? { payments: cleanPaymentLines(splitLines) } : {}),
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          name: item.product.name,
          unit_price: item.customPrice ?? item.product.sale_price,
          ...(item.itemDescription ? { item_description: item.itemDescription } : {}),
        })),
      })
    } catch {
      toast.error('Não foi possível salvar a venda offline.')
      return
    }

    const confirmation: OfflineSaleConfirmation = {
      total,
      discount,
      paymentLabel:
        PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)?.label ?? paymentMethod,
      items: cartItems.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.customPrice ?? item.product.sale_price,
      })),
    }

    resetForm()
    setOfflineSale(confirmation)
    toast.success('Venda salva offline — será enviada ao reconectar.')
  }

  function handlePrintOffline() {
    if (!offlineSale) return
    const ok = printReceipt({
      items: offlineSale.items,
      total: offlineSale.total,
      discount: offlineSale.discount,
      paymentLabel: offlineSale.paymentLabel,
      provisional: true,
    })
    if (!ok) {
      toast.error('Não foi possível abrir a impressão. Verifique o bloqueador de pop-ups.')
    }
  }

  function resetForm() {
    setCartItems([])
    setPaymentMethod('')
    setSplitMode(false)
    setSplitLines([])
    setSplitRaw([])
    setClientUuid(crypto.randomUUID())
    setPixState('idle')
    setNotes('')
    setCashReceivedRaw('')
    setDiscountRaw('')
    setTriedSubmit(false)
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
    setShowNewCustomerForm(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
  }

  function handleAddAvulso() {
    if (!avulsoProduct) return
    handleAddItem({ product: avulsoProduct, quantity: 1, customPrice: 0 })
  }

  const canSubmit = !isSubmitting && cartItems.length > 0

  usePdvShortcuts(
    {
      onFocusSearch: () => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)),
      onSubmit: () => {
        if (canSubmit) void handleSubmit()
      },
      onClearCart: () => {
        if (cartItems.length === 0) return
        resetForm()
        toast.info('Carrinho limpo.')
      },
    },
    // Disabled while the success overlay is up: the sale is already committed
    // and a stray F4 would otherwise start a second one.
    confirmedTotal === null,
  )

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {/* Running commentary for screen readers: the cart total changes as a
          side effect of scanning, and nothing else announced it. */}
      <p aria-live="polite" className="sr-only">
        {itemCount === 0
          ? 'Carrinho vazio'
          : `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} no carrinho` +
            (discount > 0 ? `, desconto de ${formatCurrency(discount)}` : '') +
            `, total ${formatCurrency(total)}`}
      </p>

      <AnimatePresence>
        {confirmedTotal !== null && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-emerald-600/95 backdrop-blur-sm text-white"
            role="status"
            aria-live="assertive"
          >
            <motion.svg
              width="88"
              height="88"
              viewBox="0 0 52 52"
              aria-hidden
              className="drop-shadow"
            >
              <motion.circle
                cx="26"
                cy="26"
                r="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeOpacity="0.45"
                variants={checkCircleVariants}
              />
              <motion.path
                d="M15 27 l8 8 l15 -16"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                variants={checkPathVariants}
              />
            </motion.svg>
            <p className="text-lg font-semibold">Venda registrada</p>
            <p className="text-3xl font-bold tabular-nums">
              {formatCurrency(confirmedTotal)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {offlineSale && (
        <motion.div
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 shadow-sm"
        >
          <button
            type="button"
            onClick={() => setOfflineSale(null)}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <CloudOff className="h-5 w-5" />
            <p className="font-semibold">Venda salva offline</p>
          </div>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-400">
            Recibo provisório — será enviada ao servidor automaticamente quando a
            conexão voltar.
          </p>
          <div className="mt-3 rounded-lg bg-white/70 dark:bg-white/5 border border-amber-200 dark:border-amber-500/20 divide-y divide-amber-100 dark:divide-white/5 text-sm">
            {offlineSale.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-slate-700 dark:text-slate-300">
                  {item.quantity}× {item.name}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {formatCurrency(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
              <span>Total · {offlineSale.paymentLabel}</span>
              <span className="tabular-nums">{formatCurrency(offlineSale.total)}</span>
            </div>
          </div>
          <Button
            onClick={handlePrintOffline}
            variant="outline"
            className="mt-3 border-amber-300 dark:border-amber-500/30 bg-white dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir recibo
          </Button>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Buscar produto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProductSearch onAdd={handleAddItem} />
              {avulsoProduct && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-400 transition-colors"
                  onClick={handleAddAvulso}
                >
                  <Tag className="h-3.5 w-3.5 mr-1.5" />
                  Item Avulso
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Carrinho
              </CardTitle>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </span>
            </CardHeader>
            <CardContent>
              <Cart
                items={cartItems}
                onUpdateQty={handleUpdateQty}
                onUpdatePrice={handleUpdatePrice}
                onUpdateDescription={handleUpdateDescription}
                onRemove={handleRemove}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-24 border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/60 dark:bg-white/3 border-b border-slate-100 dark:border-white/5 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Finalizar venda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    Método de pagamento <span className="text-red-500">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      if (splitMode) {
                        setSplitMode(false)
                        setSplitLines([])
                        setSplitRaw([])
                        setCashReceivedRaw('')
                        return
                      }
                      // Entra na divisão já com uma linha valendo a venda
                      // inteira, na forma que o operador tinha escolhido.
                      // Daí ele só ajusta o valor e adiciona a segunda.
                      setSplitMode(true)
                      setSplitLines([{ method: paymentMethod || 'cash', amount: total }])
                      setSplitRaw([total > 0 ? total.toFixed(2).replace('.', ',') : ''])
                      setCashReceivedRaw('')
                    }}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 underline underline-offset-2"
                  >
                    {splitMode ? 'Pagamento único' : 'Dividir pagamento'}
                  </button>
                </div>
                {splitMode ? (
                  <PaymentSplit
                    total={total}
                    lines={splitLines}
                    onChange={setSplitLines}
                    rawAmounts={splitRaw}
                    onRawAmountsChange={setSplitRaw}
                  />
                ) : (
                <Select
                  value={paymentMethod}
                  items={PAYMENT_OPTIONS}
                  onValueChange={(v) => {
                    const next = v as PaymentMethod
                    setPaymentMethod(next)
                    if (next !== 'cash') setCashReceivedRaw('')
                    if (next !== 'fiado') {
                      setSelectedCustomer(null)
                      setCustomerQuery('')
                      setCustomerResults([])
                      setShowNewCustomerForm(false)
                    }
                  }}
                >
                  <SelectTrigger
                    aria-invalid={triedSubmit && paymentMissing}
                    className={
                      triedSubmit && paymentMissing
                        ? 'h-10 border-red-500 ring-2 ring-red-100 dark:ring-red-900/30'
                        : 'h-10 border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200'
                    }
                  >
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
                {triedSubmit && paymentMissing && !splitMode && (
                  <p className="text-red-500 text-xs">
                    Selecione o método de pagamento para finalizar.
                  </p>
                )}
              </div>

              {pixEnabled && !splitMode && paymentMethod === 'pix' && total > 0 && (
                <PixChargePanel
                  amount={total}
                  clientUuid={clientUuid}
                  onStateChange={setPixState}
                  onConfirmed={() => {
                    // Confirmado pelo banco: finaliza sozinho. É o ganho
                    // real — o operador para de conferir o celular.
                    if (!isSubmitting) void handleSubmit()
                  }}
                />
              )}

              {showCashBox && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/8 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cash-received"
                      className="text-xs font-medium text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5"
                    >
                      <Banknote className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                      Valor recebido
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400 pointer-events-none">
                        R$
                      </span>
                      <Input
                        id="cash-received"
                        type="text"
                        inputMode="decimal"
                        value={cashReceivedRaw}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^\d,.]/g, '')
                          setCashReceivedRaw(cleaned)
                        }}
                        placeholder="0,00"
                        autoComplete="off"
                        className="h-10 pl-9 bg-white dark:bg-slate-800/60 border-emerald-200 dark:border-emerald-500/20 dark:text-slate-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200 dark:focus-visible:ring-emerald-900/30"
                      />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[total, 50, 100, 200].map((preset, idx) => (
                        <button
                          key={`${preset}-${idx}`}
                          type="button"
                          onClick={() => setCashReceivedRaw(preset.toFixed(2).replace('.', ','))}
                          className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-white dark:bg-slate-700/50 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors"
                        >
                          {idx === 0 ? 'Valor exato' : formatCurrency(preset)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {hasCashEntered && (
                      <motion.div
                        key={cashShort ? 'short' : 'change'}
                        variants={panelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className={
                          cashShort
                            ? 'rounded-xl bg-red-600 px-4 py-4 shadow-md shadow-red-900/10 text-white'
                            : 'rounded-xl bg-emerald-600 px-4 py-4 shadow-md shadow-emerald-900/10 text-white'
                        }
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                          {cashShort ? 'Falta receber' : 'Troco a devolver'}
                        </p>
                        {/* Counts to the new figure: the cashier is reading
                            this number while still handling notes, and a value
                            that moves is far harder to misread than one that
                            silently swaps between keystrokes. */}
                        <AnimatedNumber
                          value={Math.abs(change)}
                          format={formatCurrency}
                          className="block text-4xl font-bold tabular-nums leading-tight mt-1"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {paymentMethod === 'fiado' && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/8 p-3 space-y-3">
                  <Label className="text-xs font-medium text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    Cliente <span className="text-red-500">*</span>
                  </Label>

                  {selectedCustomer ? (
                    <div className="rounded-md bg-white dark:bg-white/5 border border-amber-200 dark:border-amber-500/20 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{selectedCustomer.full_name}</p>
                          {selectedCustomer.phone && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {selectedCustomer.phone}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 shrink-0"
                          aria-label="Trocar cliente"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {selectedCustomer.current_debt > 0 ? (
                        <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded px-2 py-1">
                          Possui {formatCurrency(selectedCustomer.current_debt)} em aberto
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded px-2 py-1">
                          Sem débitos pendentes
                        </p>
                      )}
                    </div>
                  ) : showNewCustomerForm ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="Nome completo *"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="h-9 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                        autoFocus
                      />
                      <Input
                        placeholder="Telefone *"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(formatPhone(e.target.value))}
                        inputMode="numeric"
                        className="h-9 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                          disabled={!newCustomerName.trim() || !newCustomerPhone.trim() || isCreatingCustomer}
                          onClick={handleCreateCustomer}
                        >
                          {isCreatingCustomer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cadastrar'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-amber-200 dark:border-amber-500/20 dark:text-slate-300 dark:hover:bg-white/5"
                          onClick={() => setShowNewCustomerForm(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                        <Input
                          placeholder="Buscar por nome ou telefone..."
                          value={customerQuery}
                          onChange={(e) => setCustomerQuery(e.target.value)}
                          className="h-9 pl-8 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                          autoFocus
                        />
                        {isSearchingCustomer && (
                          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400 dark:text-slate-500" />
                        )}
                      </div>

                      {customerResults.length > 0 && (
                        <ul className="rounded-md border border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-white/5 max-h-36 overflow-y-auto">
                          {customerResults.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                                onClick={() => { setSelectedCustomer(c); setCustomerQuery(''); setCustomerResults([]) }}
                              >
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.full_name}</p>
                                {c.phone && <p className="text-xs text-slate-500 dark:text-slate-400">{c.phone}</p>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {customerQuery.trim() && !isSearchingCustomer && customerResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-1">Nenhum cliente encontrado.</p>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium py-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Cadastrar novo cliente
                      </button>
                    </div>
                  )}

                  {triedSubmit && customerMissing && (
                    <p className="text-red-500 text-xs">Selecione um cliente para continuar.</p>
                  )}
                </div>
              )}

              {/* Desconto e observação são EXCEÇÕES, não o caminho de toda
                  venda. Sentados no meio do fluxo, empurravam o total e o
                  botão de confirmar para baixo em todo atendimento.

                  "Separate the fast 'scan, pay, go' path from advanced
                  actions like complex discounts or manual overrides, so
                  routine sales stay quick" — regra 4 do docs/design.md.

                  `<details>` nativo: abre por teclado, não precisa de
                  JavaScript e não quebra se o script falhar. */}
              <details className="group rounded-lg border border-slate-200 dark:border-white/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-slate-600 marker:content-none hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <TicketPercent className="h-3.5 w-3.5" aria-hidden />
                    Desconto e observações
                  </span>
                  <span className="flex items-center gap-2">
                    {/* Desconto aplicado tem de aparecer MESMO recolhido:
                        um abatimento escondido é dinheiro saindo sem
                        ninguém ver. */}
                    {discount > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                        −{formatCurrency(discount)}
                      </span>
                    )}
                    <ChevronDown
                      className="h-4 w-4 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </span>
                </summary>

                <div className="space-y-3 border-t border-slate-200 p-3 dark:border-white/10">
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Observações
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações opcionais..."
                  rows={2}
                  className="border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500 text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="discount"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <TicketPercent className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  Desconto no total
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    R$
                  </span>
                  <Input
                    id="discount"
                    type="text"
                    inputMode="decimal"
                    value={discountRaw}
                    onChange={(e) => setDiscountRaw(e.target.value.replace(/[^\d,.]/g, ''))}
                    placeholder="0,00"
                    disabled={cartItems.length === 0}
                    aria-invalid={discountExceeded}
                    className="pl-9 h-10 border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 tabular-nums"
                  />
                </div>
                {discountExceeded && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs">
                    Desconto maior que a venda — será aplicado até zerar o total.
                  </p>
                )}
              </div>
                </div>
              </details>

              <div className="rounded-lg bg-slate-900 dark:bg-slate-950/80 dark:border dark:border-white/8 text-white p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})</span>
                  <AnimatedNumber
                    value={subtotal}
                    format={formatCurrency}
                    className="tabular-nums"
                  />
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between text-xs text-emerald-400 mt-1">
                    <span>Desconto</span>
                    <AnimatedNumber
                      value={-discount}
                      format={formatCurrency}
                      className="tabular-nums"
                    />
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-sm text-slate-300 font-medium">Total</span>
                  <AnimatedNumber
                    value={total}
                    format={formatCurrency}
                    className="text-3xl font-bold tracking-tight tabular-nums"
                  />
                </div>
              </div>

              {pixEnabled && paymentMethod === 'pix' && pixState === 'pending' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center mb-2">
                  O pagamento ainda não foi confirmado pelo banco. Você pode
                  finalizar mesmo assim, se já conferiu.
                </p>
              )}

              <Button
                className="hidden lg:flex w-full h-12 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-base shadow-sm shadow-green-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Confirmar venda
                  </>
                )}
              </Button>

              {cartItems.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Adicione produtos ao carrinho para finalizar.
                </p>
              )}

              {/* Discreet, but discoverable: an operator who never reads a
                  manual will still pick these up after a few shifts. */}
              <div className="hidden lg:flex items-center justify-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 dark:text-slate-300 font-mono text-[10px]">F2</kbd>{' '}
                  buscar
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 dark:text-slate-300 font-mono text-[10px]">F4</kbd>{' '}
                  finalizar
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 dark:text-slate-300 font-mono text-[10px]">F8</kbd>{' '}
                  limpar
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra fixa de checkout (mobile only) */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-slate-900/80 px-4 py-3 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </p>
              <AnimatedNumber
                value={total}
                format={formatCurrency}
                className="block text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 leading-tight"
              />
            </div>
            <Button
              className="h-12 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold shadow-sm disabled:opacity-50 transition-colors"
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
