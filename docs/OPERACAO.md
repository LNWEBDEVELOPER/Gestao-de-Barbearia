# Gestão de Barbearia

Sistema web com contas individuais por e-mail e senha, Supabase Auth/PostgreSQL e interface escura e dourada.

Cada conta começa vazia: sem clientes, atendimentos, preços ou metas de exemplo. O mesmo login acessa os mesmos dados em diferentes aparelhos. Contas diferentes não compartilham registros. A senha é gerenciada pelo Supabase Auth, nunca armazenada nas tabelas de negócio.

## Preparar e testar

Node.js 22.13 ou superior.

```sh
npm ci
npm test
npm run build
npm start
```

A prévia fica em http://127.0.0.1:8766. Publique somente `dist/`. O build recria essa pasta e não distribui a demonstração nem a exportação do armazenamento antigo compartilhado.

`npm test` executa a migração num PostgreSQL local em WASM (PGlite), valida isolamento com duas identidades e verifica as telas com JSDOM. O teste não acessa nem altera o Supabase online. A confirmação de e-mail e a recuperação de senha precisam ser verificadas no ambiente publicado.

## Recursos

- Cadastro por e-mail e senha; confirmação de e-mail e recuperação de senha.
- Clientes, histórico, preços, atendimentos, relatórios, metas e exportação exclusivos de cada conta.
- Comissão inicial de 50%, configurável em Meu perfil; nome do negócio opcional em Minha conta.
- Preços e comissão calculados no servidor. Cancelamentos preservam o registro e seu motivo.
- Trocar de conta ou sair limpa o painel e o nome do negócio. Respostas pendentes de outra sessão são descartadas.
- Consultas atualizadas ao navegar, salvar ou clicar em Atualizar. Não há gravação offline ou atualização automática em tempo real.

## Ativação e dados antigos

Siga [ATIVACAO.md](../ATIVACAO.md). Em projeto já configurado, aplique `supabase/migrations/004_comissao_padrao_50.sql` se a migração 003 já estiver ativa. O banco salva a comissão de cada atendimento e usa o percentual configurado no perfil no momento do registro.

A migração preserva todas as tabelas antigas do schema `barber`. Elas deixam de ser acessíveis pelas funções antigas do aplicativo. Nenhum dado antigo é apagado ou copiado automaticamente para as novas contas; inclusive contas já existentes começam com um espaço individual vazio. A recuperação de históricos antigos exige atribuição explícita e revisão pelo administrador do banco.

O schema privado `personal` não deve ser exposto pela API. Suas tabelas têm RLS habilitada e sem acesso direto a `anon`/`authenticated`. A função `barber_account_api` verifica identidade, e-mail confirmado e propriedade em cada leitura/gravação. IDs enviados pelo navegador não autorizam acesso a outra conta. Não existe administrador global dentro do aplicativo.

## Arquivos

- `ui.js`: telas; `cloud.js`: sessão e API; `domain.js`: cálculos e formatação.
- `supabase/migrations/003_contas_individuais.sql` e `004_comissao_padrao_50.sql`: estrutura individual e comissão padrão de 50%.
- `tests/`: isolamento do banco e comportamento das telas.
- `scripts/`: build e prévia de `dist/`.
- `demo.js` e `exportar-antigo.*`: arquivos históricos mantidos apenas no código-fonte, fora da publicação.

