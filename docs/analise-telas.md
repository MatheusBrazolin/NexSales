# NexSales — Análise de telas, campos e acabamento

> 27/11/2026 · branch `feat/polimento-completo` · app rodado de verdade em
> `localhost`, em claro e escuro, a 1440×900 e a 375×812 (iPhone).

Diferente da primeira análise, que foi feita lendo código, esta foi feita
**abrindo o app e clicando nele**. Isso mudou o resultado: o item mais grave
da lista abaixo não aparece em nenhum lint, nenhum teste e nenhum build.

---

## 0. Status

Os 14 achados foram corrigidos. `npm run lint`, `npm run typecheck`,
199 testes e `next build` passando; cobertura 28,1% → **29,7%**.

As 19 migrations também foram aplicadas do zero contra um Postgres 15 real
(container descartável, com um stub mínimo do ambiente Supabase: schema
`auth`, `auth.uid()` e os papéis). Isso encontrou dois erros que fariam o
`supabase db push` quebrar no meio:

- `dre_report` lia `sales.discount_amount`, coluna criada só na migration
  seguinte — os dois arquivos foram renumerados;
- `dashboard_comparisons` fazia `create or replace` mudando o tipo de
  retorno da função, o que o Postgres recusa (`cannot change return type of
  existing function`) — passou a derrubar a versão anterior antes.

Depois disso as funções foram exercitadas com dados: venda com desconto,
brinde a R$ 0,00 (que não vira preço de catálogo), desconto maior que a
venda, idempotência por `client_uuid`, e item sem controle de estoque.

| # | Achado | Correção |
|---|---|---|
| 1 | Relatório de lucro quebrado | ExportButtons recebe o CSV pronto |
| 2.1 | App nasce invisível no HTML | Entrada em CSS (`nx-enter-*`) |
| 2.2 | Fechamento sem modo escuro | 48 classes `dark:` + `useLightPrint()` |
| 2.3 | Variação inventada no dashboard | `dashboard_metrics()` + `compareToPrevious()` |
| 2.4 | Erro técnico cru | Componente `LoadError` |
| 2.5 | Porcentagem com ponto | `formatPercent()` nos 7 pontos |
| 2.6 | "Sexta-Feira, 27 De Novembro" | `first-letter:uppercase` |
| 2.7 | Balão de validação do navegador | `noValidate` nos 5 formulários |
| 2.8 | Senha parecia preenchida | Placeholder "Sua senha" |
| 2.9 | Gráfico sem estado vazio | Estado vazio com ícone e texto |
| 2.10 | `<select>` nativo destoando | `color-scheme` no tema |
| 2.11 | Input de data invisível | idem |
| 2.12 | Emoji no login | Ícones Lucide |
| 2.13 | "autenticação Supabase" exposta | "Conexão segura e criptografada" |
| 2.14 | Hero travado em 260px | Cresce em `xl` e `2xl` |

Dois achados extras surgiram durante a correção:

- **`vitest.setup.ts` não tinha o `cleanup` do testing-library.** Um hook
  montado num teste continuava vivo e reagindo a eventos disparados pelos
  testes seguintes. Foi assim que o `useLightPrint` pareceu falhar: uma
  instância esquecida tirava a classe `dark` antes, e a instância sob teste
  concluía que a página já estava clara.
- **Imprimir a partir do tema escuro sairia com texto branco em papel
  branco.** Tailwind compila `dark:` para cor literal, que o `@media print`
  não alcança. `useLightPrint()` remove a classe `dark` enquanto o diálogo
  de impressão está aberto, preservando as cores que têm significado
  (verde de lucro, vermelho de prejuízo, selos de pagamento).

---

## 1. Já corrigido nesta rodada

### 🔴 A tela de Relatório de lucro estava quebrada — corrigido

`/relatorios` mostrava apenas **"Algo deu errado"**. Causa: a página é Server
Component e passava para o `ExportButtons` (Client Component) um array de
colunas com um accessor por coluna:

```tsx
columns={[{ header: 'Produto', value: (p) => p.name }]}
```

Função não atravessa a fronteira servidor → cliente. O React lançava
`Functions cannot be passed directly to Client Components` e o error boundary
engolia a página inteira.

Fui eu que introduzi isso ao adicionar a exportação, e **nada pegou**: o
typecheck passa (o tipo é válido), o ESLint passa, os 173 testes passam e o
`next build` passa. É erro de serialização em tempo de execução. Só apareceu
abrindo a tela.

Corrigido: o `ExportButtons` agora recebe o CSV já montado — string sempre
serializa — e ganhou `buildCsvReport()` para montar preâmbulo + tabela.

---

## 2. Os defeitos, como foram encontrados

### 🔴 2.1 O app inteiro nasce invisível no HTML do servidor

Este é o mais sério. O HTML que o servidor manda para `/dashboard` contém:

```html
<aside class="... w-64 min-h-screen bg-slate-900 ..." style="opacity:0;transform:translateX(-20px)">
<li class="relative" style="opacity:0;transform:translateX(-10px)">   ← cada item do menu
<main id="conteudo" ...><div style="opacity:0;transform:translateY(8px)">  ← a página toda
<div class="... rounded-xl border ..." style="opacity:0;transform:translateY(16px) scale(0.98)">  ← cada KPI
```

A sidebar, todos os 11 itens de menu, o conteúdo da página e os cards de KPI
chegam ao navegador com `opacity: 0`. Eles só ficam visíveis **depois** que o
JavaScript carrega, o framer-motion hidrata e a animação roda.

Consequências reais:

- celular lento ou 3G no balcão → tela em branco por segundos;
- erro de hidratação → app **permanentemente** em branco, sem mensagem;
- no Electron, a janela abre vazia antes de pintar.

Eu mesmo observei isso: no iPhone emulado, o dashboard ficou com só o título
por vários segundos, com o corpo vazio.

Parte é anterior a mim (sidebar e KPIs já usavam framer-motion), mas eu
**ampliei para o app todo** ao envolver todas as páginas no `PageTransition`.

**Correção:** animação de entrada em CSS (`@keyframes` + classe), não em JS.
O conteúdo vai visível no HTML e a animação roda sozinha na primeira pintura,
sem depender de hidratação. Mantém o efeito e elimina o risco.

### 🔴 2.2 O Fechamento de Caixa não existe no modo escuro

`src/components/sales/cash-close-view.tsx` tem **zero** classes `dark:`.
Com o tema escuro ligado:

- o título "Fechamento de Caixa" some (texto escuro em fundo escuro);
- os três KPIs mostram só o rótulo — **os valores ficam invisíveis**;
- o seletor de data é um retângulo branco no meio da página escura.

É a tela que o dono da loja abre no fim de todo dia, e no escuro ela é
inutilizável. Em claro está perfeita — foi desenhada só para impressão.

### 🔴 2.3 O dashboard mostra variação inventada

Em `kpi-cards.tsx`, os selos de tendência são literais:

```ts
trend: 'up',  trendLabel: '+12% vs ontem',
trend: 'up',  trendLabel: '+8% vs mês anterior',
trend: 'flat', trendLabel: 'estável',
```

Com a loja zerada, o dashboard exibe **"+12% vs ontem"** ao lado de R$ 0,00.
Não é enfeite: é um número de negócio falso numa tela de gestão. Ou calcula
de verdade (a RPC `dashboard_metrics()` já está lá, bastam mais duas colunas
com os valores de ontem e do mês anterior), ou os selos saem.

### 🟡 2.4 Erro técnico cru na cara do lojista

Duas telas imprimem a exceção direto:

| Tela | Texto que aparece |
|---|---|
| Usuários | `Erro ao carregar usuários: TypeError: fetch failed` |
| Relatório por email | `Erro ao carregar destinatários: AbortError: This operation was aborted` |

Um comerciante não sabe o que é `AbortError`. Precisa virar "Não foi possível
carregar agora — verifique a conexão" + botão de tentar de novo, com o detalhe
técnico só no console.

### 🟡 2.5 Porcentagem com ponto, num app em português

Sete lugares usam `toFixed()` direto: margem bruta, margem por produto, % por
forma de pagamento, margem no formulário de produto. Sai **"12.5%"** onde o
Brasil escreve **"12,5%"** — e fica ainda mais estranho ao lado de
"R$ 1.234,56", que o app formata certo. Falta um `formatPercent()` ao lado do
`formatCurrency()` que já existe.

### 🟡 2.6 Data do fechamento com maiúscula em toda palavra

`className="capitalize"` aplicado na data inteira produz:

> **Sexta-Feira, 27 De Novembro De 2026**

Em português é "Sexta-feira, 27 de novembro de 2026". Precisa capitalizar só
a primeira letra (`first-letter:uppercase`).

### 🟡 2.7 Validação do formulário usa o balão do navegador

Enviando o cadastro de produto vazio, aparece o tooltip nativo do Chrome
("Preencha este campo.") — caixa branca, fonte do sistema, fora do design.
O projeto tem Zod + react-hook-form prontos para mostrar erro inline, mas o
`required` nativo dispara antes. Basta `noValidate` no `<form>` e deixar o
RHF assumir.

### 🟡 2.8 Campo de senha parece já preenchido

O placeholder é `••••••••`. Visualmente é idêntico a uma senha digitada — na
tela de login do celular dá para jurar que o campo já está preenchido. Deve
ser "Sua senha" ou vazio.

### 🟡 2.9 Gráfico de 30 dias sem estado vazio

Sem vendas, o card vira um retângulo grande e vazio, sem eixo e sem mensagem.
Todas as outras listas do app têm empty state com ícone e texto; o gráfico
não.

### 🟢 2.10 Dois `<select>` nativos no meio de Selects customizados

Filtros de Produtos e de Vendas usam `<select>` nativo, enquanto o PDV e o
formulário usam o Select do design system. No escuro a diferença salta: seta
padrão do SO e dropdown com a cara do sistema, não do app.

### 🟢 2.11 Input de data nativo quase invisível no escuro

`<input type="date">` nos filtros de Vendas e no Fechamento: o ícone de
calendário fica cinza-escuro sobre fundo escuro. Precisa de
`[color-scheme:dark]` ou de um date picker próprio.

### 🟢 2.12 Login: emoji no meio de um app de ícones Lucide

O painel esquerdo lista benefícios com 📊 📦 👥. O resto do app usa Lucide.
Emoji muda de desenho em cada sistema operacional e quebra a identidade — e
esta é a primeira tela que qualquer pessoa vê.

### 🟢 2.13 Login revela o fornecedor

"Protegido por autenticação Supabase" no rodapé do formulário. Para o lojista
não significa nada e expõe a stack. "Conexão segura" entrega a mesma
tranquilidade.

### 🟢 2.14 Hero do login não aproveita telas grandes

A coluna de texto está travada em `max-w-[230px] xl:max-w-[260px]`. Em
1440px o título quebra em quatro linhas curtas ("A próxima / geração / em
gestão / de vendas.") enquanto sobra espaço. O limite pode crescer com a tela.

---

## 3. O que já está bom (e não deve mexer)

- **Empty states** de produtos, vendas, clientes e carrinho: ícone, frase
  explicativa e CTA. Bem acima da média.
- **Formulário de produto**: o toggle "Controlar estoque" esconde Estoque
  Atual/Mínimo quando desligado — comportamento certo, sem campo órfão.
- **Modo claro**: todas as telas conferidas estão corretas e coerentes.
- **PDV**: o layout de duas colunas com a coluna de finalização fixa é a
  escolha certa; a barra de checkout fixa no rodapé do celular também.
- **Dicas de teclado** no PDV (bipe → Enter, setas para navegar) são um toque
  de produto de verdade.
- **Breadcrumb e header** consistentes em todas as telas.
- **Responsivo**: nada estourou a largura em 375px nas telas que abri.

---

## 4. Ordem sugerida

| # | Item | Por quê primeiro |
|---|---|---|
| 1 | 2.1 HTML invisível | Pode deixar o app em branco em produção |
| 2 | 2.2 Fechamento no escuro | Tela diária, hoje inutilizável |
| 3 | 2.3 Variação falsa | Número de negócio inventado |
| 4 | 2.4 Erro cru | Primeiro contato do lojista com um problema |
| 5 | 2.5–2.8 | Formatação e campos; rápidos e muito visíveis |
| 6 | 2.9–2.14 | Acabamento |

Os itens 1 a 4 mudam se o app funciona. Do 5 em diante mudam se ele parece
profissional.
