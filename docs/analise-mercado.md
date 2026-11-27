# O que os concorrentes têm e nós não

Pesquisa de 28/11/2026. Comparação do NexSales com os sistemas que uma
loja pequena brasileira realmente considera na hora de contratar.

> **Ressalva sobre as fontes.** Quase todo comparativo de PDV publicado em
> português é blog de fornecedor ou de concorrente. Os números abaixo
> servem para saber *o que existe no mercado*, não para decidir preço ou
> obrigação legal. O que for fiscal precisa de confirmação do contador e da
> SEFAZ do estado.

## Quem foi comparado

| Sistema | Perfil | O que o destaca |
| --- | --- | --- |
| **Hiper** | Mercadinho de bairro | Balança integrada, NFC-e, TEF, preço progressivo, maquininha inclusa |
| **Bling** | Loja de balcão + e-commerce | ERP completo, marketplaces; **sem modo offline** |
| **MarketUP** | Entrada, plano grátis | NF-e/NFS-e; caixa cobrado à parte, propaganda no grátis |
| **GestãoClick** | Balcão | TEF com 4 adquirentes |
| **Loyverse** | Global, grátis | Fidelidade, multiloja, display de cliente — tudo no plano grátis |

## Onde o NexSales já está na frente

Vale registrar, porque é fácil olhar só para o que falta.

**Offline de verdade.** Hiper e MarketUP anunciam "7 dias offline" como
diferencial. O NexSales é offline-first: o PDV lê do IndexedDB, a venda
entra numa fila e sobe sozinha quando a internet volta. O Bling, que é o
ERP mais vendido da lista, simplesmente não funciona sem internet.

**Custo congelado por item.** `unit_cost` gravado no momento da venda.
Nenhum dos comparativos menciona isso, e é o que impede o relatório de
lucro de reescrever o passado quando o fornecedor muda de preço.

**Fiado com saldo por cliente.** Presente em poucos, e é central para
loja de bairro.

## O que falta — em três categorias

### 1. Básico que todo concorrente tem (e corrompe dado todo dia)

**Pagamento misto.** Hoje `payment_method` é um enum único por venda: uma
venda, uma forma de pagamento. Cliente que paga R$ 50 no cartão e R$ 20 em
dinheiro obriga o caixa a escolher uma das duas — e o relatório por forma
de pagamento passa a mentir, todo dia, em silêncio. Não é mudança de tela:
é tabela de pagamentos por venda.

**Sangria e suprimento.** O "fechamento de caixa" de hoje é um *resumo das
vendas do dia*, não uma conferência de gaveta. Falta fundo de troco
inicial, retirada, reforço, e a diferença entre o contado e o esperado. Sem
isso o fechamento não fecha de verdade — ele só repete o que o sistema já
sabia.

**Devolução e troca.** Não existe. Hoje devolver significa **excluir a
venda** — e o próprio diálogo avisa: "o histórico não terá registro dessa
venda". Uma venda que aconteceu de verdade some dos livros. Devolução
precisa ser um lançamento novo, não o apagamento do anterior.

### 2. Diferencial que vale a pena perseguir

**Pix com baixa automática.** Hoje o Pix é só um rótulo: o caixa marca
"PIX" e confere no celular se caiu. Com QR dinâmico por venda e webhook, a
venda só fecha quando o banco confirma.

O modelo é bem documentado e um PDV open source brasileiro
([BiniTech-PDV](https://github.com/niicsz/BiniTech-PDV/pull/113)) já o
implementou com Mercado Pago, inclusive com venda mista (parte Pix, parte
dinheiro) e QR expirando em 15 minutos. Duas lições dele que valem ouro:

> O corpo do webhook **nunca** é tratado como prova de pagamento — o status
> é sempre reconfirmado consultando a API com o token da loja. E há consulta
> de fallback, caso o webhook não chegue.

Combina com o pagamento misto, e é o item que mais muda o dia do caixa.

### 3. Projeto, não tarefa

**NFC-e.** O maior item da lista, e o mais delicado. O que a pesquisa
mostrou:

- Para **MEI**, na maior parte dos estados, a NFC-e **não é obrigatória**
  na venda de balcão a pessoa física — dispensa prevista até 31/12/2026.
- Há fontes afirmando que a partir de **01/01/2027** a emissão passa a ser
  obrigatória também para pessoa física, por causa da reforma tributária.
  **Esse ponto não é unânime entre as fontes.**
- Venda para CNPJ, com entrega, e-commerce ou delivery: obrigatória.

Ou seja: pode virar obrigação em pouco mais de um ano, ou não. Exige
certificado digital A1, homologação na SEFAZ do estado e contingência
offline (emitir, marcar como contingência, transmitir quando a rede
voltar). **Não dá para decidir isso a partir de blog — é conversa com o
contador.**

**Balança e produto por peso.** É o que faz o Hiper ser o mais indicado
para mercadinho. Só vale se a loja for vender a granel.

**Fidelidade e multiloja.** O Loyverse entrega os dois no plano grátis.
Fidelidade é o de maior retorno para loja de bairro, e é barato de fazer:
já existe cadastro de cliente por causa do fiado.

## Recomendação, em ordem

1. **Pagamento misto** — corrompe dado todo dia, e é pré-requisito do Pix.
2. **Sangria e suprimento** — faz o fechamento de caixa virar conferência
   de verdade.
3. **Devolução e troca** — para parar de apagar venda que aconteceu.
4. **Pix com baixa automática** — o diferencial.
5. **Fidelidade** — aproveita o cadastro que já existe.
6. **NFC-e** — só depois de falar com o contador.

Os três primeiros não são "features novas": são buracos por onde o dado
que o dono usa para decidir vaza todo dia.

## Referências de código

| Projeto | Para quê serve de base |
| --- | --- |
| [BiniTech-PDV](https://github.com/niicsz/BiniTech-PDV/pull/113) | PDV brasileiro, Pix com Mercado Pago, venda mista. O PR tem o fluxo inteiro |
| [NFePHP sped-nfe](https://github.com/nfephp-org/sped-nfe) | Motor de NFC-e mais maduro em open source. PHP, mas o fluxo SEFAZ é o mesmo |
| [OCA l10n-brazil](https://github.com/OCA/l10n-brazil) | Módulos NFC-e + PDV do Odoo. Python, AGPL |
| [nfe.io Node SDK](https://nfe.io/docs/desenvolvedores/bibliotecas/node/) | Cliente Node para NFC-e via API. Não resolve contingência offline |
| [Posnic POS](https://github.com/Posnic/POS) | PDV offline-first, AGPL. Sem suporte fiscal brasileiro |

Nenhum deles é Node + offline-first + fiscal brasileiro ao mesmo tempo —
essa combinação não existe pronta. Para NFC-e, o caminho realista é um
provedor com API e sandbox, não falar direto com a SEFAZ.
