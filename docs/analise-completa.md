# NexSales — Análise completa do projeto

> Data: 27/11/2026 · Base: `main` @ `0982588` · 17.760 linhas em `src/` (143 arquivos TS/TSX)

---

## 1. Estado atual (verificado, não presumido)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | ✅ limpo, zero erros |
| `npm test` | ✅ 108 testes, 12 arquivos, 3,5s |
| Cobertura (`src/lib` + `actions.ts`) | ⚠️ **21,36% statements** / 39,78% funcs |
| ESLint | ❌ **não existe** (sem config, sem script, não roda no CI) |
| CI | ✅ typecheck + test + build em PR e push para `main` |
| Electron hardening | ✅ `contextIsolation: true`, `nodeIntegration: false`, preload sandboxed, `setWindowOpenHandler` e `will-navigate` tratados |
| Branches remotas | ⚠️ 4 branches **obsoletas** — todas já contidas em `main` |

O projeto está **saudável e bem acima da média** de portfólio: server actions tipadas, Zod em todas as validações, offline-first real (Dexie + fila idempotente por `client_uuid`), dual-runtime Supabase/SQLite, Electron empacotado, cron de e-mail, PWA. A base é sólida — o que falta é **polimento, blindagem e profundidade**, não reescrita.

---

## 2. Achados críticos

### 2.1 🔴 RLS permissiva derruba a separação admin/funcionário

As policies de `001_initial_schema.sql` e `20260611000000_fiado.sql` são todas no formato:

```sql
create policy "auth_write_products" on public.products
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
```

Ou seja: **qualquer usuário autenticado** — inclusive um `employee` — pode ler e escrever `products`, `categories` e `customers`, e ler **todas** as vendas (`auth_read_sales`), direto na API REST do Supabase.

O README afirma *"Trava implementada no servidor — impossível contornar pela URL"*. Isso é verdade para a **URL do app** (`requireAdmin()` em `src/lib/auth/roles.ts` funciona), mas não para a API. A `NEXT_PUBLIC_SUPABASE_ANON_KEY` está no bundle do browser por definição; um funcionário logado pode abrir o DevTools e fazer:

```js
await supabase.from('products').update({ sale_price: 0.01 }).eq('id', '...')
await supabase.from('sales').select('*')   // vendas de todo mundo, todos os dias
```

**Correção:** criar uma função `is_admin()` em SQL (`security definer`, lendo `user_roles`) e reescrever as policies de escrita de `products`/`categories` e as de leitura ampla de `sales` para exigir `is_admin()`, deixando o funcionário com `select` apenas das próprias vendas do dia — espelhando exatamente a regra que o app já aplica. É a mudança de maior impacto do relatório.

### 2.2 🔴 Dashboard soma em JavaScript e trunca em 1.000 linhas

`src/lib/queries/dashboard.ts` busca **todas as linhas** e agrega em memória:

```ts
.from('sales').select('total_amount').gte('created_at', startOfMonth(now)...)
// ...
const monthTotal = (monthSales.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
```

Dois problemas:

1. **Correção:** o PostgREST do Supabase aplica um limite padrão de 1.000 linhas por request. Passando de 1.000 vendas no mês, `monthTotal`, `monthCount` e o ticket médio passam a mostrar números **silenciosamente errados** — e o gráfico de 30 dias trunca junto. Para um PDV de comércio movimentado, 1.000 vendas/mês é ~33/dia: perfeitamente alcançável.
2. **Performance:** trafega N linhas para somar um número.

**Correção:** uma RPC `dashboard_metrics()` com `sum()`/`count()`/`filter` em SQL, retornando uma única linha. Mesmo tratamento para `getSalesLast30Days` (`group by date_trunc('day', ...)`). Bônus: o mesmo vale para `lowStockCount`, que hoje puxa todos os produtos ativos.

### 2.3 🟡 Zero `prefers-reduced-motion`

Nenhuma ocorrência no código. Com a expansão de animações proposta na seção 4, isso vira requisito de acessibilidade (WCAG 2.3.3) — e também prático: um operador de caixa vê a mesma tela 400×/dia; animação não negociável cansa.

---

## 3. Arquitetura e performance

| # | Item | Observação |
|---|---|---|
| 3.1 | **Recharts sem code splitting** | `sales-chart.tsx` importa Recharts estaticamente (~100 kB gzip). Zero usos de `next/dynamic` no projeto. Carregar o gráfico com `dynamic(..., { ssr: false, loading: <Skeleton/> })` tira peso do bundle da rota mais pesada. |
| 3.2 | **Sem análise de bundle** | Nenhum `@next/bundle-analyzer`. Sem baseline, não dá para afirmar nada sobre o tamanho — vale medir antes de otimizar. |
| 3.3 | **Dual runtime bem resolvido** | O padrão `if (isElectron()) { await import('@/lib/db/queries/...') }` é consistente nas 4 famílias de query e usa import dinâmico — bom. O custo é que **cada query existe em duas versões** (Supabase + SQLite) sem teste que garanta paridade de contrato entre elas. Um teste de contrato compartilhado evitaria divergências silenciosas. |
| 3.4 | **`tryQuery` com timeout** | Padrão sólido para degradar offline. Testado (8 testes). |
| 3.5 | **Paginação correta** | `getSalesPaged` e `getProductsPaged` usam `count: 'exact'` + `range()` com teto de 100 — certo. |
| 3.6 | **`revalidate` usado em 32 pontos** | Bom, mas sem padrão documentado de invalidação. |

---

## 4. UX, UI e animações

Hoje o **framer-motion já é dependência**, mas só aparece em **2 arquivos**: `sidebar.tsx` e `kpi-cards.tsx`. Todo o resto depende de `transition-*` do Tailwind (99 ocorrências). O fluxo mais usado do sistema — o PDV — **não tem uma animação sequer**.

### 4.1 Onde a animação muda a sensação de produto

| Lugar | Hoje | Proposta |
|---|---|---|
| **Carrinho** (`cart.tsx`) | Itens aparecem/somem instantaneamente, sem `key` animada | `AnimatePresence` com entrada `slide+fade` do topo e saída colapsando a altura. É o feedback que diz "o bipe funcionou". |
| **Total e troco** (`pdv.tsx`) | Número troca seco | Contador animado (`useSpring`/`animate`) em cima do valor. Alto impacto visual, baixo custo. |
| **Confirmação de venda** | `toast.success` + `router.push` | Overlay de sucesso com check animado (path SVG desenhando) por ~800ms antes de navegar. É o momento mais importante do app e hoje passa despercebido. |
| **Busca de produto** (`product-search.tsx`) | Dropdown aparece | Stagger nos resultados (40ms entre itens) + realce do item sob o cursor com `layoutId`. |
| **KPIs do dashboard** | Já tem entrada em stagger ✅ | Adicionar contagem animada dos valores e micro-hover (`scale: 1.02`). |
| **Gráfico de vendas** | Estático | `isAnimationActive` do Recharts + entrada das barras em cascata. |
| **Troca de rota** | `loading.tsx` com skeleton ✅ | Transição de página com `AnimatePresence` no layout do dashboard. |
| **Banner offline / badge pendentes** | Aparecem seco | Entrada por cima com `spring`, e pulso sutil no contador quando incrementa. |
| **Dialogs / Sheet** | Base UI com transição CSS | Consistente, mas vale padronizar as curvas com as do framer-motion para não ter duas linguagens de movimento. |

### 4.2 Princípio para não virar enfeite

Criar `src/lib/motion.ts` com os tokens de movimento (`duration`, `easing`, variantes `fadeUp`, `stagger`, `springSoft`) e um hook `useReducedMotion()` que zera tudo. Hoje cada componente inventa a própria curva — isso é o que separa "tem animação" de "parece produto".

### 4.3 Acessibilidade

- **1 único `aria-live`** no projeto inteiro (`offline-indicator.tsx`). O PDV muda total, troco e quantidade de itens sem anunciar nada a leitor de tela.
- **0 `aria-busy`** durante submits.
- Sem **skip link** para o conteúdo principal.
- `focus-visible` aparece em 19 pontos (bom), mas não há foco gerenciado após ações — ex.: depois de adicionar um item, o foco deveria voltar à busca para o próximo bipe.
- Navegação por teclado existe e é boa no `product-search` (setas, Enter, Escape) e no `cart` (Enter/Escape) — o alicerce está lá.

### 4.4 O que falta para "parecer PDV profissional"

- **Atalhos globais**: F2 foca a busca, F4 finaliza a venda, F8 limpa o carrinho, Esc cancela edição. Hoje não existe nenhum atalho de nível de página. Operador de caixa trabalha com teclado, não com mouse.
- **Modo quiosque / tela cheia** no Electron para o caixa.
- **Estados vazios ilustrados** — o carrinho vazio já tem ícone + texto (bom); listas de produtos/vendas/clientes merecem o mesmo tratamento com CTA.
- **Feedback sonoro opcional** no bipe do leitor (beep de sucesso / erro). Padrão em PDV de mercado.

---

## 5. Qualidade de engenharia

| # | Item | Situação |
|---|---|---|
| 5.1 | **Sem ESLint** | Nenhuma config, nenhum script, não roda no CI. É a lacuna mais visível para quem avalia o repositório. `eslint-config-next` + `jsx-a11y` + step no CI. |
| 5.2 | **Cobertura 21%** | 108 testes cobrem bem o núcleo offline (sync, repos), formatação e schemas. Ficam **sem teste**: queries do dashboard, `roles.ts`, `local-auth.ts`, `offline-cookie.ts`, e as server actions de produtos/clientes. Dado o achado 2.1, `roles.ts` e as actions de admin são o que mais merece teste. |
| 5.3 | **E2E existe, README diz que não** | Há 5 specs Playwright (`auth`, `pdv`, `offline`, `navigation`, `full-suite`) + `auth.setup.ts`, mas **o CI não roda nenhum deles** e o roadmap do README marca E2E como pendente. |
| 5.4 | **11 `console.*` e 9 `any`** | Pequeno, mas são exatamente os pontos que um revisor marca. |
| 5.5 | **4 branches obsoletas no remote** | `feat/improve-quality`, `feat/ui-destinatarios-relatorio`, `fix/production-stability-and-responsiveness`, `perf/loading-states` — verifiquei: todas já estão contidas em `main`. Deletar. |
| 5.6 | **README desatualizado** | O roadmap marca como pendentes itens já entregues (E2E, login offline — há `local-auth.ts` e o commit de hardening `0982588`). |
| 5.7 | **Falta `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`** | Issue/PR templates existem ✅. Para um repo público de portfólio, os três fecham o conjunto. |
| 5.8 | **Env sem validação** | 38 usos de `process.env`, 10 com `!` (non-null assertion). Um `env.ts` com Zod falha no boot com mensagem clara em vez de quebrar em runtime. |
| 5.9 | **Sem Dependabot/Renovate** | Nenhum `.github/dependabot.yml`. |
| 5.10 | **Sem threshold de cobertura** | `vitest.config.mts` tem coverage configurado mas sem `thresholds` — nada impede a cobertura cair. |

---

## 6. Funcionalidades para o produto ficar completo

Do roadmap, ainda abertos de verdade:

- **Exportação CSV/PDF** dos relatórios (lucro, fechamento, fiado). Baixo esforço, alto valor percebido.
- **NFC-e** via serviço terceirizado. É o maior item e o que mais separa "projeto" de "produto vendável" no Brasil.

Oportunidades que ainda não estão no roadmap:

- **Sangria e suprimento de caixa** + abertura/fechamento de turno com conferência. Hoje há fechamento do dia, mas não controle de gaveta por operador.
- **Devolução / troca** de venda (hoje só existe cancelamento total).
- **Desconto no total** da venda (existe override por item, não no total).
- **Múltiplas formas de pagamento na mesma venda** (metade PIX, metade dinheiro) — muito comum no varejo pequeno.
- **Importação de produtos por CSV** para onboarding de loja nova.
- **Histórico de alteração de preço** por produto.
- **Metas de venda** no dashboard (meta do mês com progresso) — gancho natural para animação.

---

## 7. Plano priorizado

### Onda 1 — blindagem (o que não pode ficar como está)
1. Reescrever as RLS policies com `is_admin()` (§2.1) + teste de integração provando que `employee` é bloqueado.
2. Migrar as métricas do dashboard para RPC agregada (§2.2).
3. Adicionar ESLint (`next` + `jsx-a11y`) e plugar no CI.
4. Limpar as 4 branches obsoletas e atualizar o roadmap do README.

### Onda 2 — a camada de movimento
5. Criar `src/lib/motion.ts` com tokens + `useReducedMotion`.
6. Animar o carrinho (`AnimatePresence`), o total/troco (contador) e a confirmação de venda (check animado).
7. Stagger na busca de produtos, transição entre rotas, entrada do banner offline.
8. `aria-live` no PDV, `aria-busy` nos submits, skip link, foco de volta na busca após adicionar item.

### Onda 3 — profundidade de produto
9. Atalhos de teclado globais no PDV (F2/F4/F8/Esc) com legenda discreta na tela.
10. Exportação CSV/PDF dos relatórios.
11. Desconto no total + pagamento misto.
12. Sangria/suprimento e turno por operador.

### Onda 4 — maturidade
13. E2E no CI (contra um projeto Supabase de teste).
14. Subir cobertura de `roles.ts`, `local-auth.ts` e server actions; definir threshold.
15. `env.ts` com Zod, `SECURITY.md`, Dependabot, bundle analyzer.
16. NFC-e.

---

## 8. Conclusão

A engenharia aqui já é boa: tipagem rigorosa, offline-first que funciona de verdade, dual runtime bem isolado, Electron hardened, CI verde. Os dois furos reais são **RLS permissiva** e **agregação do dashboard** — ambos invisíveis hoje e inevitáveis com volume. Resolvidos esses, o que separa o NexSales de um produto comercial não é mais arquitetura: é **movimento, atalhos de teclado e as funções de caixa do dia a dia** (desconto, pagamento misto, sangria, devolução).
