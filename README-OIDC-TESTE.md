# Login uMov — teste seguro

Esta versão inclui teste de autenticação OIDC com Keycloak (`https://login.umov.me/realms/umovme`), usando Authorization Code + PKCE e validação criptográfica do ID token. Não captura nem armazena a senha do uMov.

**Importante:** não reutilize `umovme-center` como Client ID. Solicite ao administrador do uMov/Keycloak um cliente OIDC próprio para o SS de Campo, com callback `https://sistema-de-ss.vercel.app/api/auth/callback` e origem da aplicação autorizada.

## Variáveis na Vercel
- `UMOV_OIDC_ENABLED=false` inicialmente (sistema legado continua como antes)
- `UMOV_OIDC_CLIENT_ID=<id do cliente próprio>`
- `UMOV_OIDC_CLIENT_SECRET=<somente se exigido>`
- `APP_BASE_URL=https://sistema-de-ss.vercel.app`
- `SESSION_SECRET=<valor aleatório de 32 bytes ou mais>`

Após configurar, use `UMOV_OIDC_ENABLED=true` em **ambiente de teste/preview isolado**. Nesse modo, todas as APIs de negócio são bloqueadas (403) mesmo após login, pois ainda não foi comprovado o mapeamento de permissões uMov. Somente o login e `/api/auth/me` podem ser testados. NÃO habilitar na produção operacional até concluir a integração das permissões.

Rotas: `/api/auth/config`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`.

O cliente OIDC e a consulta de permissões precisam de confirmação administrativa. O sistema não tenta reutilizar cookies ou senhas capturadas do navegador.
