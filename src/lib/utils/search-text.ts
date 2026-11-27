/**
 * Normalização de texto para busca de produto.
 *
 * Existe porque o caixa digita sem acento e com pressa. "acucar" tem que
 * achar "Açúcar", "sabao" tem que achar "Sabão". Sem isso o operador
 * conclui que o produto não está cadastrado e cadastra de novo — e aí a
 * loja passa a ter dois produtos iguais com estoques diferentes.
 *
 * A mesma regra vale no Postgres (`public.nx_normalize`) e aqui no cache
 * offline. Se as duas divergirem, a busca online e a offline passam a
 * achar coisas diferentes para o mesmo termo, que é pior do que as duas
 * estarem erradas do mesmo jeito.
 */

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    // Remove os diacríticos que o NFD separou das letras.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tokens indexáveis de um produto: cada palavra do nome, mais o código.
 *
 * Vira um índice multiEntry no Dexie, e é o que permite buscar por prefixo
 * usando o índice em vez de varrer o catálogo inteiro em JavaScript. Por
 * isso guarda cada palavra separada: o IndexedDB sabe buscar "começa com",
 * não sabe buscar "contém".
 *
 * Também guarda sufixos do código a partir do 4º dígito, para o caso comum
 * de o caixa digitar só o final de um código de barras que não leu direito.
 */
export function buildSearchTokens(name: string, code: string): string[] {
  const tokens = new Set<string>()

  for (const word of normalizeSearchText(name).split(' ')) {
    if (word) tokens.add(word)
  }

  const normalizedCode = normalizeSearchText(code)
  if (normalizedCode) {
    tokens.add(normalizedCode)
    // Sufixos do código: "...4567" encontra 7891234567.
    for (let i = 1; i <= normalizedCode.length - 4; i++) {
      tokens.add(normalizedCode.slice(i))
    }
  }

  return [...tokens]
}

/**
 * Pontuação de um resultado, menor é melhor. Espelha a ordem de
 * `search_products` no Postgres, para a lista do PDV sair igual online e
 * offline.
 *
 *   0. código exato      — o bipe do leitor
 *   1. código que começa — digitação parcial do código
 *   2. nome que começa   — "coca" antes de "garrafa de coca"
 *   3. palavra que começa
 *   4. o resto
 */
export function scoreMatch(name: string, code: string, query: string): number {
  const q = normalizeSearchText(query)
  const normalizedCode = normalizeSearchText(code)
  const normalizedName = normalizeSearchText(name)

  if (normalizedCode === q) return 0
  if (normalizedCode.startsWith(q)) return 1
  if (normalizedName.startsWith(q)) return 2
  if (normalizedName.split(' ').some((word) => word.startsWith(q))) return 3
  return 4
}

/** True quando o produto casa com o termo, pelo nome ou pelo código. */
export function matchesQuery(name: string, code: string, query: string): boolean {
  const q = normalizeSearchText(query)
  if (!q) return false

  return (
    normalizeSearchText(name).includes(q) || normalizeSearchText(code).includes(q)
  )
}
