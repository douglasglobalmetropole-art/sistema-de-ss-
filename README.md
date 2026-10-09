# SS de Campo — Vercel

Painel de recepção, acompanhamento e encerramento de SS integrado ao banco PostgreSQL do uMov.

## Publicar na Vercel

1. Envie esta pasta a um repositório GitHub e importe o repositório na Vercel.
2. Em **Settings → Environment Variables**, cadastre os valores do arquivo `.env.example`:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_SSL`
   - `UMOV_API_TOKEN` (Secret) — chave de integração do uMov
   - `UMOV_API_BASE_URL` (Config) — normalmente `https://api.umov.me/CenterWeb/api`
3. Faça o deploy. A página inicial e as rotas `/api/*` serão atendidas pelo `server.js`.

## Segurança

Não envie o arquivo `.env` ao GitHub nem ao ZIP de publicação. Senhas e `UMOV_API_TOKEN` devem ser cadastrados como **Secret** na Vercel.
