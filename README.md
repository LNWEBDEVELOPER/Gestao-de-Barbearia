# Gestão de Barbearia

**Clientes, atendimentos e resultados em um espaço individual de gestão.**

Aplicação web para cadastrar clientes, definir preços, registrar serviços e acompanhar metas. Cada conta acessa somente seus próprios dados, inclusive ao entrar em outro aparelho.

[**Abrir Gestão de Barbearia**](https://LNWEBDEVELOPER.github.io/AppBarberweb/) · [Guia de ativação](ATIVACAO.md) · [Detalhes de operação](docs/OPERACAO.md)

> O acesso exige e-mail e senha. Cada conta começa vazia, sem registros fictícios.

![Tela de acesso da Gestão de Barbearia](docs/images/acesso.png)

## O problema

Um controle de atendimentos precisa relacionar clientes, serviços, valores e histórico sem misturar os registros de pessoas diferentes. O sistema concentra essas informações em uma interface responsiva e vincula os dados à identidade autenticada.

## Funcionalidades

- Cadastro e histórico de clientes, com busca e arquivamento.
- Tabela de serviços e preços; comissão padrão de 50%, calculada no servidor e configurável no perfil.
- Relatórios por período, metas e exportação dos registros da conta.
- Login, confirmação de e-mail e recuperação de senha pelo Supabase Auth.
- Cancelamento de atendimento com motivo e preservação do histórico.
- Nome do negócio e perfil personalizáveis.

## Tecnologias e arquitetura

| Camada | Implementação |
| --- | --- |
| Interface | HTML, CSS e JavaScript, sem framework de UI |
| Autenticação | Supabase Auth |
| Dados e regras | PostgreSQL e funções PL/pgSQL |
| Build | Node.js e esbuild |
| Testes | PGlite e JSDOM |
| Publicação | GitHub Actions e GitHub Pages |

A interface envia operações para a função `barber_account_api`. O banco valida a identidade, a confirmação de e-mail e a propriedade dos registros. As tabelas ficam em schema privado, com RLS habilitada e sem acesso direto pelos clientes.

O servidor calcula preços e comissões; alterar o preço de um serviço não modifica os atendimentos já registrados. Ao sair ou trocar de conta, o painel é limpo e respostas pendentes de outra sessão são descartadas.

## Executar localmente

Requisito: **Node.js 22.13 ou superior**.

```sh
git clone https://github.com/LNWEBDEVELOPER/AppBarberweb.git gestao-de-barbearia
cd gestao-de-barbearia
npm ci
npm test
npm run build
npm start
```

Abra [http://127.0.0.1:8766](http://127.0.0.1:8766). Para uma instalação própria, configure seu projeto Supabase conforme [ATIVACAO.md](ATIVACAO.md). Somente a URL e a chave publicável ficam no frontend.

## O que os testes verificam

- Isolamento entre contas em consultas, alterações, relatórios e exportações.
- Bloqueio de acesso anônimo, conta não confirmada e APIs compartilhadas antigas.
- Preços calculados no banco e proteção contra duplicação de uma requisição.
- Telas vazias, navegação, saída e troca de identidade entre abas.

Os testes usam um banco local em WASM e não alteram o ambiente online. Envio de e-mails e autenticação completa no serviço hospedado exigem validação de integração.

## Estrutura

```text
ui.js                 Telas e navegação
cloud.js              Sessão e comunicação com o Supabase
domain.js             Datas, moeda, períodos e exportação
supabase/migrations/  Estrutura e funções do banco
tests/                Testes de isolamento e interface
scripts/              Build e servidor de prévia
```

## Limites atuais

As telas atualizam ao navegar, salvar ou clicar em Atualizar. Não há gravação offline nem atualização automática em tempo real. A migração para contas individuais preserva o histórico antigo no banco, sem atribuí-lo automaticamente a novas contas. Consulte o [guia de operação](docs/OPERACAO.md).

---

Projeto do portfólio de [Luan Nascimento](https://github.com/LNWEBDEVELOPER).

