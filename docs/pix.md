# Pix com baixa automática — como ligar

Escrito em 28/11/2026. **O código está pronto e desligado.** Sem as
variáveis abaixo, nada aparece no PDV e o sistema se comporta exatamente
como antes.

> **Leia isto primeiro.** Diferente do resto do sistema, esta integração
> **não foi testada contra uma conta real** — eu não tenho como criar conta
> no provedor nem gerar chave em seu nome. O que está verificado por teste
> automatizado é a conferência de assinatura, a tradução de status e a
> recusa de notificação forjada. O caminho completo (gerar QR → pagar →
> confirmar) só pode ser verificado por você, no sandbox, antes de usar com
> dinheiro de verdade.

## O que já está decidido no código

**O corpo do webhook nunca é prova de pagamento.** Ele diz apenas *qual
cobrança olhar*; o status é sempre reconsultado na API do provedor, com a
chave da loja. Sem isso, qualquer pessoa que descobrisse a URL do webhook
marcaria vendas como pagas mandando um JSON.

**Existe consulta de reserva.** A tela pergunta o status a cada 3 segundos
enquanto espera. Webhook falha mais do que se imagina; sem a consulta, um
pagamento que o provedor não conseguiu avisar nunca apareceria.

**A confirmação não bloqueia a venda.** Se o provedor cair, o caixa
continua podendo finalizar — com um aviso de que não houve confirmação.
Automação que pode impedir a loja de vender é pior que a ausência dela.

**Status desconhecido vira "pendente", nunca "pago".** Diante de algo que o
código não reconhece, não dar a venda por paga é o erro barato.

## Passo a passo

### 1. Conta no Mercado Pago

Crie (ou use) a conta da loja e pegue o **access token** em
Suas integrações → sua aplicação → Credenciais.

Comece pelas credenciais de **teste**. As de produção movimentam dinheiro
real.

### 2. Variáveis de ambiente

Na Vercel, em Settings → Environment Variables:

```
PIX_PROVIDER=mercadopago
MERCADO_PAGO_ACCESS_TOKEN=<o access token>
MERCADO_PAGO_WEBHOOK_SECRET=<a assinatura secreta do webhook>
PIX_PAYER_EMAIL=<um e-mail genérico da loja>
```

`SUPABASE_SERVICE_ROLE_KEY` também precisa estar configurada — a
confirmação de pagamento não pode depender de nada vindo do navegador.

> Sobre `PIX_PAYER_EMAIL`: o Mercado Pago exige um e-mail de pagador.
> **Não use o seu e-mail pessoal** — é dado pessoal indo para um terceiro
> sem necessidade. Use algo como `pagamentos@sualoja.com.br`.

### 3. Webhook

Em Suas integrações → Webhooks, aponte para:

```
https://nexsales-pdv.vercel.app/api/pix/webhook
```

Evento: **Pagamentos**. Copie a assinatura secreta que o painel gera e
coloque em `MERCADO_PAGO_WEBHOOK_SECRET`.

### 4. Teste no sandbox, antes do dinheiro real

1. Abra uma venda, escolha PIX, clique em **Gerar QR Pix**.
2. Pague com uma conta de teste do Mercado Pago.
3. A tela deve mostrar "Pagamento confirmado pelo banco" e finalizar a
   venda sozinha.

Se não confirmar, olhe os logs da Vercel em `/api/pix/webhook`. Os dois
erros mais comuns são a URL do webhook errada e a assinatura secreta
trocada.

## Trocar de provedor

`src/lib/pix/provider.ts` define a interface. Para somar Asaas, Efí ou
outro, basta um arquivo novo implementando `createCharge`, `getStatus`,
`parseNotification` e `verifySignature`, e uma linha em `getPixProvider()`.
Nada no PDV precisa mudar.
