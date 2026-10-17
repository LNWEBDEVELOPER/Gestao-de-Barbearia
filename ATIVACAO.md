# Ativar contas individuais

## Banco já existente

1. No Supabase do projeto configurado em `config.js`, abra SQL Editor.
2. Se `public.barber_account_api(text,jsonb)` ainda não existir, execute uma vez `supabase/migrations/003_contas_individuais.sql` integralmente. A operação é transacional. Não reaplique essa migração se as contas individuais já estiverem ativas.
3. Execute uma vez `supabase/migrations/004_comissao_padrao_50.sql` para definir 50% como padrão e ajustar contas que ainda estejam no padrão antigo de 0%.
4. Execute uma vez `supabase/migrations/005_aprovacao_de_contas.sql`. Usuários existentes são preservados; novos cadastros ficam pendentes e não acessam dados até a aprovação.
5. Confirme que existe `public.barber_account_api(text,jsonb)` e que `authenticated` não pode mais executar `barber_api` nem `barber_import`.
6. Publique o frontend após as migrações. A versão antiga deixará de consultar dados compartilhados.

Não reaplique 001/002 em banco existente. Em projeto novo, execute 001, 002, 003, 004 e 005 nessa ordem. A conta `luannascimentopsp@gmail.com` é a administradora de aprovações. Ela mantém acesso e pode aprovar pedidos na tela inicial. Novos usuários precisam confirmar o e-mail, solicitar a liberação pelo e-mail ou WhatsApp exibidos e aguardar a aprovação. A conta só recebe acesso aos dados após a liberação.

## Autenticação

Mantenha e-mail/senha, cadastro e confirmação de e-mail habilitados no Supabase Auth. Configure senha mínima de 10 caracteres, Site URL e Redirect URLs com a URL publicada. Para confirmação e recuperação, configure um provedor SMTP que possa enviar aos usuários do sistema; o envio de e-mails não é testado pelos testes locais.

## Publicação

Execute `npm ci`, `npm test` e `npm run build`. Publique apenas `dist/`. O workflow existente publica essa pasta ao enviar a branch `main` ao GitHub. Não publique o frontend antes da migração; ele exige a nova API e não retorna à API compartilhada.

## Verificação após ativar

- A conta administradora deve abrir sem clientes, preços, atendimentos ou metas caso ainda não tenha sido usada.
- Um cadastro novo confirmado deve ver a tela de aprovação, sem conseguir chamar ações de leitura ou gravação até ser aprovado.
- A administradora deve ver solicitações confirmadas e conseguir aprovar uma; após entrar de novo, a conta aprovada abre vazia.
- Cadastre seus preços, clientes e primeiro atendimento. Faça login em outro aparelho com a mesma conta e atualize a tela.
- Outra conta deve continuar vazia, sem poder consultar, alterar ou exportar os registros da primeira.
- Ao sair, o nome do negócio volta a Gestão de Barbearia e o painel é limpo.
- Confirme o recebimento de e-mail de cadastro/recuperação com contas de teste próprias.

## Histórico preservado

A migração não elimina o schema `barber`, usuários ou dados de autenticação. O histórico compartilhado antigo permanece restrito à administração do banco. As novas contas não recebem esse histórico automaticamente. Os antigos arquivos de exportação local não são distribuídos em `dist/`.

Se for necessário reverter o lançamento, preserve também o schema `personal` e seus registros novos. Restaurar o frontend anterior exige revisar e reativar as permissões antigas, o que volta a compartilhar dados e não atende ao modelo individual solicitado. Não faça essa reversão silenciosamente.

