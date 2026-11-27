# Política de segurança

O NexSales roda em caixa de comércio: ele guarda vendas, dados de clientes
e saldos de fiado. Levamos relato de vulnerabilidade a sério.

## Como reportar

**Não abra uma issue pública** para uma falha de segurança.

Use o [relato privado de vulnerabilidade do GitHub](https://github.com/MatheusBrazolin/NexSales/security/advisories/new).
Se preferir e-mail, use o endereço do perfil do mantenedor.

No relato, ajuda muito incluir:

- o que dá para fazer com a falha (ler dado de outro usuário? alterar preço?
  burlar a separação admin/funcionário?);
- os passos para reproduzir;
- a versão ou o commit em que você testou.

Respondemos em até 7 dias. Se a falha for confirmada, combinamos uma data de
divulgação depois que a correção estiver publicada.

## Modelo de segurança

Entender isto ajuda a avaliar se algo é de fato uma falha:

### A chave anon é pública, por definição

`NEXT_PUBLIC_SUPABASE_ANON_KEY` vai no bundle do navegador. Ela não é segredo
e não deve ser tratada como tal. **Toda** autorização real está nas policies
de RLS do Postgres e nas funções `security definer`, não na camada do app.

Os guards `requireAdmin()` / `isAdmin()` existem para dar uma experiência
correta (esconder telas, mostrar mensagem clara), não para serem a última
linha de defesa.

### Separação admin / funcionário

| Recurso | Admin | Funcionário |
|---|---|---|
| Produtos e categorias | leitura e escrita | somente leitura |
| Vendas | histórico completo | vendas de hoje + histórico de fiado |
| Cancelar venda | sim | não |
| Clientes | leitura, criação, edição, exclusão | leitura e criação |
| Usuários, relatórios, destinatários | sim | não |

Isso é garantido por RLS (`supabase/migrations/20261127000000_rls_role_hardening.sql`).
Se você conseguir ultrapassar qualquer linha dessa tabela falando direto com a
API do Supabase, **isso é uma vulnerabilidade** e queremos saber.

### Segredos que precisam continuar segredos

- `SUPABASE_SERVICE_ROLE_KEY` — ignora toda RLS. Só no servidor, nunca em
  componente de cliente nem em variável `NEXT_PUBLIC_*`.
- `OFFLINE_SESSION_SECRET` — assina o cookie de sessão offline. Com ele,
  qualquer pessoa forja uma sessão. Obrigatório em produção, com no mínimo
  32 caracteres (validado em `src/lib/env.ts`).
- `CRON_SECRET` — protege a rota do relatório diário.
- `SMTP_PASS` — credencial de envio de e-mail.

### Fora de escopo

- Ataque que exige acesso físico ao caixa já desbloqueado.
- Engenharia social de um funcionário com credencial válida.
- Falta de rate limit no login (o Supabase Auth aplica o dele).
- Relatório automatizado de dependência sem caminho de exploração
  demonstrável no NexSales.

## Versões suportadas

Corrigimos a branch `main`. Não há backport para releases antigas do
instalador Windows — atualize para a versão mais recente.
