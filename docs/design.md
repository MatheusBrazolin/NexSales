# Contrato de design

Escrito em 28/11/2026, depois de pesquisar como ferramentas de varejo de
verdade resolvem cada tela. Serve para decidir, não para enfeitar: quando
houver dúvida sobre uma tela, a resposta sai daqui.

## O problema que originou isto

As telas pareciam "geradas por IA". O diagnóstico, olhando tela por tela,
não foi a cor — foi o conteúdo:

- A tela de **login era uma landing page**: manchete "A próxima geração em
  gestão de vendas", três bullets de funcionalidades, desenho de um
  dashboard falso, selo de "dados protegidos". Material de venda, mostrado
  para quem já comprou e abre aquilo todo dia de manhã.
- Roxo em **tudo**: logo, título, botão, foco, selo, ícone, link. Quando
  uma cor está em tudo, ela deixa de destacar qualquer coisa.
- Gradiente escrito à mão dentro do componente
  (`linear-gradient(135deg, #7c3aed...)`), furando o sistema de cores.
- Bolhas de brilho desfocadas, texto com gradiente recortado,
  `rounded-3xl`, sombras coloridas.

## Regras

### 1. Cada tela tem um trabalho. Nada que não sirva a ele entra.

O login existe para deixar a pessoa entrar. O PDV existe para registrar
uma venda rápido. O dashboard existe para responder "como foi hoje".

Argumento de venda, selo de confiança e ilustração decorativa não passam
nesse teste.

### 2. Animação transmite estado, não personalidade.

> "Cashiers often look at the screen for only a moment while also talking
> to customers" — e animação deve "convey essential status, such as
> payment processing, and not decorate the screen".
> ([UX Journal](https://medium.com/uxjournal/pos-ux-design-part-one-the-16-ux-factors-in-point-of-sale-b94661936eea),
> [BrightDevs](https://brightdevs.medium.com/payment-in-pos-design-ui-ux-best-practices-and-inspirations-f9f7b7723703))

Permitido: a entrada de uma tela, item caindo no carrinho, pagamento
confirmando, erro aparecendo. Proibido: elemento que se mexe sem ter
mudado de estado.

O sistema já existe em `globals.css` (`nx-enter-*`), é CSS puro e respeita
`prefers-reduced-motion`. Não se adiciona biblioteca de animação por
enfeite — framer-motion só onde há transição de presença real.

### 3. O roxo é da ação principal. Mais nada.

Uma ação primária por tela. O resto é cinza-ardósia. Foco de campo usa o
roxo em anel discreto, porque foco É a ação do momento.

Cor nunca é o único sinal de estado: vem sempre com ícone ou texto.

### 4. O caminho rápido não divide espaço com o avançado.

> "Separate the fast 'scan, pay, go' path from advanced actions like
> complex discounts or manual overrides, so routine sales stay quick."
> ([POSZeo](https://www.poszeo.com/blog-channel/pos-point-how-modern-point-of-sale-hardware-drives-faster-smarter-checkout/))

No PDV: buscar, adicionar, escolher forma, finalizar. Desconto, divisão de
pagamento e preço avulso são exceções — ficam acessíveis, não no caminho.

### 5. Densidade é inimiga do dashboard.

> Sobrecarga de informação é o problema mais comum em painéis, atingindo
> 46,7% dos usuários.
> ([UXPilot](https://uxpilot.ai/blogs/dashboard-design-principles))

Todo bloco precisa responder a uma pergunta que o dono faz. Número sem
comparação não responde nada: "R$ 400 hoje" só significa algo ao lado de
ontem.

### 6. Formulário é uma coluna que respira.

Campos na mesma linha compartilham a altura: se um tem texto de ajuda e o
outro não, a linha entorta. Ou os dois têm, ou o texto vai para fora da
grade.

Rótulo acima do campo, erro abaixo, unidade dentro. Botão primário à
direita do rodapé, destacado do conteúdo por uma borda.

## O que foi medido, não achado

Verificar em 320, 768, 1024 e 1440 px. Sem rolagem horizontal. Toda ação
alcançável por teclado — no PDV isso não é acessibilidade abstrata: o
caixa trabalha com uma mão no leitor e outra no teclado, e F2/F4/F8 é a
convenção que ele já conhece de outros sistemas.

### 7. A tela cabe na tela. Quem rola é a lista, não a página.

Rolar a página inteira esconde o cabeçalho, os filtros e o botão de ação
— e obriga a voltar ao topo para qualquer coisa. Numa ferramenta de
trabalho, isso é imposto cobrado a cada uso.

A regra: a moldura (cabeçalho, filtros, rodapé de ação) fica fixa, e só a
região com muitos itens rola dentro de si mesma. Quando a lista é grande
de verdade, pagina — rolagem infinita tira a noção de "onde estou" e
impede voltar a um item visto antes.

Vale para lista de produtos, histórico de vendas, clientes e as tabelas de
relatório. Não vale para formulário longo de cadastro, onde rolar a página
é o comportamento esperado e correto.

### 8. Campo de digitação não é um quadrado vazio.

Todo campo responde enquanto a pessoa digita. O mínimo:

- **estado de foco visível** (anel, não só mudança de borda);
- **o que esperar**, por exemplo um formato de exemplo em vez de repetir o
  rótulo como marcador;
- **retorno imediato** onde faz sentido: sugestão aparecendo, valor
  formatado em moeda, contagem de resultados, aviso de erro antes de
  enviar;
- **unidade dentro do campo** (`R$` à esquerda), não no rótulo entre
  parênteses — o rótulo diz o que é, o campo diz como preencher.

Campo que aceita busca mostra o que encontrou sem precisar enviar nada.
Campo que aceita dinheiro formata enquanto digita. Campo obrigatório que
ficou vazio avisa ao sair dele, não só ao tentar salvar.
