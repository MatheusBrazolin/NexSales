'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Search, Plus, Minus, ScanBarcode } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/format'
import { useDebounce } from '@/lib/utils/use-debounce'
import type { Product, CartItem } from '@/types/database'

interface ProductSearchProps {
  onAdd: (item: CartItem) => void
}

export function ProductSearch({ onAdd }: ProductSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  /** Quantity chosen per product before clicking "Adicionar". */
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  // Auto-focus the input on mount so the USB scanner can write directly into it
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fuzzy search for manual typing (does NOT auto-add — just shows the dropdown)
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .or(`name.ilike.%${debouncedQuery}%,code.ilike.%${debouncedQuery}%`)
      .limit(10)
      .then(({ data }) => {
        setResults(data ?? [])
        setLoading(false)
      })
  }, [debouncedQuery])

  function getQuantity(product: Product): number {
    return quantities[product.id] ?? 1
  }

  function setQuantity(product: Product, value: number) {
    const clamped = Math.max(1, Math.min(product.stock_quantity, Math.floor(value) || 1))
    setQuantities((prev) => ({ ...prev, [product.id]: clamped }))
  }

  function handleAdd(product: Product, quantity: number) {
    if (quantity > product.stock_quantity) {
      toast.error(`Estoque insuficiente. Disponível: ${product.stock_quantity}`)
      return
    }
    onAdd({ product, quantity })
    setQuery('')
    setResults([])
    setQuantities({})
    // Return focus to the input so the next scan/search keeps flowing
    inputRef.current?.focus()
  }

  // Scanner workflow: USB readers type the code + Enter.
  // On Enter, we try an EXACT code match and auto-add ONE unit to the cart.
  async function handleScanLookup(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return

    setScanning(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('code', trimmed)
      .eq('is_active', true)
      .maybeSingle()
    setScanning(false)

    if (error) {
      toast.error('Erro ao buscar produto. Tente novamente.')
      return
    }

    if (!data) {
      toast.error(`Produto não encontrado: ${trimmed}`)
      inputRef.current?.select()
      return
    }

    if (data.stock_quantity <= 0) {
      toast.error(`Sem estoque: ${data.name}`)
      inputRef.current?.select()
      return
    }

    handleAdd(data, 1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleScanLookup(e.currentTarget.value)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Aponte o leitor ou digite o nome / código..."
          className="pl-9 pr-10 h-11 text-sm"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
        <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      </div>

      <p className="text-[11px] text-slate-400 px-1">
        Pressione{' '}
        <kbd className="px-1 py-0.5 border border-slate-200 rounded text-[10px] bg-slate-50">
          Enter
        </kbd>{' '}
        para adicionar pelo código exato (scanner = 1 unidade) ou ajuste a quantidade abaixo
        antes de clicar em <strong>Adicionar</strong>.
      </p>

      {(loading || scanning) && (
        <p className="text-xs text-slate-400 px-1">
          {scanning ? 'Lendo código...' : 'Buscando...'}
        </p>
      )}

      {results.length > 0 && (
        <div className="border rounded-lg divide-y bg-white shadow-sm">
          {results.map((product) => {
            const qty = getQuantity(product)
            return (
              <div
                key={product.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    Cód: {product.code} · Estoque: {product.stock_quantity} ·{' '}
                    {formatCurrency(product.sale_price)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQuantity(product, qty - 1)}
                      disabled={qty <= 1}
                      className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={product.stock_quantity}
                      value={qty}
                      onChange={(e) =>
                        setQuantity(product, parseInt(e.target.value, 10) || 1)
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-12 h-8 text-center text-sm font-medium tabular-nums bg-white border-x border-slate-200 focus:outline-none focus:bg-blue-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Quantidade"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(product, qty + 1)}
                      disabled={qty >= product.stock_quantity}
                      className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                    onClick={() => handleAdd(product, qty)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && !scanning && query && results.length === 0 && (
        <p className="text-sm text-slate-400 px-1">Nenhum produto encontrado em estoque.</p>
      )}
    </div>
  )
}
